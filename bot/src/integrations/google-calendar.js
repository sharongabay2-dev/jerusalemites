'use strict';

/**
 * חיבור ליומן גוגל אמיתי — קריאת זמינות וקביעת אירועים.
 * -------------------------------------------------------------
 * שיטה: Service Account (הכי פחות הקמה — בלי מסך הסכמה ובלי רענון טוקנים).
 * שרון משתף את היומן שלו עם כתובת ה-Service Account ונותן הרשאת עריכה.
 *
 * ללא תלויות חיצוניות: חתימת JWT עם crypto, וקריאות REST ל-Google.
 *
 * משתני סביבה נדרשים (ראו דיווח/README):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID
 *   GOOGLE_CALENDAR_TIMEZONE (ברירת מחדל: Asia/Jerusalem)
 *
 * מממש את אותו ממשק כמו MockCalendar:
 *   proposeStudioSlots(tierId), proposeOnsiteDays(tierId), book(slot, info)
 */

const crypto = require('crypto');
const { isWorkingDay } = require('../config/availability');
const {
  addDays,
  toDateKey,
  studioSlotsForDay,
  windowIsFree,
  fullDaySlot,
  slotIsFree,
  nowInTz,
  isFutureSlot,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
} = require('../scheduling');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

let _tokenCache = { token: null, exp: 0 };

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

class GoogleCalendar {
  constructor({ clientEmail, privateKey, calendarId, timeZone } = {}) {
    this.backend = 'google';
    this.clientEmail = clientEmail;
    this.privateKey = (privateKey || '').replace(/\\n/g, '\n');
    this.calendarId = calendarId;
    this.timeZone = timeZone || 'Asia/Jerusalem';
  }

  async _accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (_tokenCache.token && _tokenCache.exp - 60 > now) return _tokenCache.token;

    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(
      JSON.stringify({ iss: this.clientEmail, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now })
    );
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claim}`);
    const sig = signer.sign(this.privateKey).toString('base64url');
    const assertion = `${header}.${claim}.${sig}`;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' +
        encodeURIComponent(assertion),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      throw new Error('Google token נכשל: ' + JSON.stringify(data));
    }
    _tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return data.access_token;
  }

  async _api(path, { method = 'GET', body, query } = {}) {
    const token = await this._accessToken();
    let url = 'https://www.googleapis.com/calendar/v3' + path;
    if (query) url += '?' + new URLSearchParams(query).toString();
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google ${method} ${path} נכשל (${res.status}): ${JSON.stringify(data)}`);
    return data;
  }

  // החזרת מרכיבי זמן מקומיים (לפי אזור הזמן של היומן) עבור רגע נתון.
  _localParts(date) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const p = {};
    for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
    const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
    return { key: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + parseInt(p.minute, 10) };
  }

  // שליפת מרווחים תפוסים לכל יום בטווח, ממופים לדקות מקומיות.
  async _busyByDay(horizonDays) {
    const start = new Date();
    const end = addDays(start, horizonDays + 1);
    const data = await this._api('/freeBusy', {
      method: 'POST',
      body: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: this.timeZone,
        items: [{ id: this.calendarId }],
      },
    });
    const cal = (data.calendars && data.calendars[this.calendarId]) || {};
    const byDay = {}; // dateKey -> [{startMin,endMin}]
    for (const b of cal.busy || []) {
      const s = this._localParts(new Date(b.start));
      const e = this._localParts(new Date(b.end));
      if (s.key === e.key) {
        (byDay[s.key] = byDay[s.key] || []).push({ startMin: s.minutes, endMin: e.minutes });
      } else {
        // אירוע שחוצה חצות — חוסם את שאר היום הראשון ואת תחילת הבא (בקירוב בטוח).
        (byDay[s.key] = byDay[s.key] || []).push({ startMin: s.minutes, endMin: 1440 });
        (byDay[e.key] = byDay[e.key] || []).push({ startMin: 0, endMin: e.minutes });
      }
    }
    return byDay;
  }

  async proposeStudioSlots(tierId, { limit = 4, horizonDays = 30 } = {}) {
    const byDay = await this._busyByDay(horizonDays);
    const today = new Date();
    const now = nowInTz(this.timeZone); // סינון חלונות שכבר עברו
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(today, i);
      if (!isWorkingDay(day)) continue;
      const busy = byDay[toDateKey(day)] || [];
      for (const s of studioSlotsForDay(day, tierId, busy)) {
        if (!isFutureSlot(s, 30, now)) continue; // רק חלונות עתידיים (now + 30 דק')
        out.push(s);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async proposeOnsiteDays(_tierId, { limit = 3, horizonDays = 45 } = {}) {
    const byDay = await this._busyByDay(horizonDays);
    const today = new Date();
    const now = nowInTz(this.timeZone);
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(today, i);
      if (!isWorkingDay(day)) continue;
      if (!windowIsFree(byDay[toDateKey(day)] || [])) continue;
      const slot = fullDaySlot(day);
      if (!isFutureSlot(slot, 30, now)) continue; // לא להציע יום שכבר עבר חלון הבוקר
      out.push(slot);
    }
    return out;
  }

  async book(slot, info = {}) {
    const date = slot.date instanceof Date ? slot.date : new Date(slot.date);
    const startMin = slot.fullDay ? WINDOW_START_MIN : slot.startMin;
    const endMin = slot.fullDay ? WINDOW_END_MIN : slot.endMin;

    // אימות זמינות לפני קביעה — קובעים רק בזמן פנוי.
    const byDay = await this._busyByDay(45);
    const busy = byDay[toDateKey(date)] || [];
    const ok = slot.fullDay ? windowIsFree(busy) : slotIsFree(startMin, endMin, busy);
    if (!ok) return { ok: false, reason: 'הזמן נתפס ביומן' };

    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;

    const event = {
      summary: info.title || 'צילום',
      description: info.description || '',
      location: info.location || '',
      start: { dateTime: `${dateStr}T${hhmm(startMin)}`, timeZone: this.timeZone },
      end: { dateTime: `${dateStr}T${hhmm(endMin)}`, timeZone: this.timeZone },
    };
    if (info.attendeeEmail) event.attendees = [{ email: info.attendeeEmail }];

    const created = await this._api(`/calendars/${encodeURIComponent(this.calendarId)}/events`, {
      method: 'POST',
      query: { sendUpdates: 'all' }, // שולח זימון לאימייל של הלקוח
      body: event,
    });
    return { ok: true, eventId: created.id, htmlLink: created.htmlLink };
  }
}

function googleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_CALENDAR_ID
  );
}

function createGoogleCalendar() {
  return new GoogleCalendar({
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY,
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Asia/Jerusalem',
  });
}

module.exports = { GoogleCalendar, googleConfigured, createGoogleCalendar };
