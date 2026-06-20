'use strict';

/**
 * "המוח" של הבוט — מנהל את מהלך השיחה כמכונת מצבים.
 * עצמאי מהערוץ (וואטסאפ/טרמינל). מופע אחד = שיחה אחת.
 *
 * receive() הוא אסינכרוני כי קריאת זמינות/קביעה ביומן (גוגל) היא רשתית.
 * שמירה/שחזור מצב: toState()/loadState() (לאחסון מתמיד בין הודעות).
 *
 * מהלך:
 *  פתיחה -> קהל (אדם אחד / מספר עובדים)
 *  אדם אחד -> מיקום (סטודיו/בית עסק) -> חבילה -> מועד -> פרטי קשר -> אישור
 *  מספר עובדים -> כמות -> (מתומחר: מחיר + מועד יום מלא | 40+: הצעה אישית) -> פרטי קשר
 */

const messages = require('./messages');
const { getTier, getTeamBracket, formatPrice, TEAM, PACKAGES } = require('./config/pricing');
const business = require('./config/business');

// ── עוזרי קלט ──
function norm(text) {
  return String(text || '').trim();
}
function pickNumber(text) {
  const m = norm(text).match(/[1-9]/);
  return m ? parseInt(m[0], 10) : null;
}
function extractPhone(text) {
  const m = norm(text).match(/(\+?[\d][\d\-\s().]{6,}\d)/);
  if (!m) return null;
  return m[1].replace(/\D/g, '').length >= 7 ? m[1].trim() : null;
}
function extractEmail(text) {
  const m = norm(text).match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m ? m[0] : null;
}
function reviveSlot(slot) {
  if (slot && slot.date && !(slot.date instanceof Date)) {
    return Object.assign({}, slot, { date: new Date(slot.date) });
  }
  return slot;
}

const HANDOFF_WORDS = ['שרון', 'טלפון', 'להתקשר', 'לדבר', 'נציג', 'אנושי', 'שיחה אישית'];

// שדות קשר ושאלותיהם.
const CONTACT_QUESTIONS = {
  name: () => messages.askName(),
  phone: () => messages.askPhone(),
  email: () => messages.askEmail(),
  address: () => messages.askAddress(),
};

class Brain {
  constructor({ calendar, notify } = {}) {
    if (!calendar) throw new Error('Brain דורש calendar');
    if (!notify) throw new Error('Brain דורש notify');
    this.calendar = calendar;
    this.notify = notify;
    this.step = 'init';
    this.lead = {
      audience: null, // 'single' | 'team'
      location: null, // 'studio' | 'onsite'
      tier: null, // {id,label,price,...}
      team: null, // {id,label,perPerson}
      selectedSlot: null,
      booking: null,
      name: null,
      phone: null,
      email: null,
      address: null,
      outcome: null,
    };
    this.contactFields = [];
    this.contactIndex = 0;
    this.contactPurpose = null; // 'book' | 'handoff' | 'teamCustom'
  }

  isDone() {
    return this.step === 'done';
  }

  toState() {
    return {
      step: this.step,
      lead: this.lead,
      contactFields: this.contactFields,
      contactIndex: this.contactIndex,
      contactPurpose: this.contactPurpose,
    };
  }

  loadState(s) {
    if (!s) return this;
    this.step = s.step || 'audience';
    this.lead = s.lead || this.lead;
    if (this.lead.selectedSlot) this.lead.selectedSlot = reviveSlot(this.lead.selectedSlot);
    this.contactFields = s.contactFields || [];
    this.contactIndex = s.contactIndex || 0;
    this.contactPurpose = s.contactPurpose || null;
    return this;
  }

  start() {
    this.step = 'audience';
    return [messages.greeting()];
  }

  async receive(text) {
    if (this.step === 'done') return [messages.goodbye()];

    // בקשה לדבר עם שרון — זמינה בשלבי הבחירה (לא בזמן הקלדת פרטים).
    if (this.step !== 'contact' && this._isHandoffIntent(text)) {
      return this._enterHandoff('הלקוח ביקש לדבר עם שרון');
    }

    switch (this.step) {
      case 'audience': return this._handleAudience(text);
      case 'location': return this._handleLocation(text);
      case 'package': return this._handlePackage(text);
      case 'employees': return this._handleEmployees(text);
      case 'employees_sub': return this._handleEmployeesSub(text);
      case 'schedule': return this._handleSchedule(text);
      case 'contact': return this._handleContact(text);
      default: return [messages.notUnderstood()];
    }
  }

  // ── קהל ──
  _handleAudience(text) {
    const n = pickNumber(text);
    if (n === 1) {
      this.lead.audience = 'single';
      this.step = 'location';
      return [messages.askLocation()];
    }
    if (n === 2) {
      this.lead.audience = 'team';
      this.lead.location = 'onsite'; // צוות תמיד בבית העסק
      this.step = 'employees';
      return [messages.askEmployeesGroup()];
    }
    return [messages.notUnderstood()];
  }

  // ── מיקום (אדם אחד) ──
  _handleLocation(text) {
    const n = pickNumber(text);
    if (n === 1) this.lead.location = 'studio';
    else if (n === 2) this.lead.location = 'onsite';
    else return [messages.notUnderstood()];
    this.step = 'package';
    return [messages.presentPackages(this.lead.location)];
  }

  // ── חבילה (אדם אחד) ──
  async _handlePackage(text) {
    const n = pickNumber(text);
    const map = { 1: 'base', 2: 'standard', 3: 'premium' };
    const tierId = map[n];
    if (!tierId) return [messages.notUnderstood()];
    this.lead.tier = getTier(this.lead.location, tierId);
    return this._proposeSchedule();
  }

  // ── כמות עובדים (צוות) — שלב א': קבוצה ──
  async _handleEmployees(text) {
    const n = pickNumber(text);
    if (n === 1) {
      this.step = 'employees_sub';
      this.lead._empGroup = 'small'; // עד 10
      return [messages.askEmployeesSubSmall()];
    }
    if (n === 2) {
      this.step = 'employees_sub';
      this.lead._empGroup = 'mid'; // 11–40
      return [messages.askEmployeesSubMid()];
    }
    if (n === 3) {
      // יותר מ-40 — הצעה אישית, ללא תמחור/קביעה אוטומטיים.
      this.lead.team = getTeamBracket('b41');
      this.lead.outcome = 'צוות 40+ — מתואמת הצעה אישית של שרון';
      return this._startContact(['name', 'phone', 'email'], 'teamCustom', [messages.teamCustom()]);
    }
    return [messages.notUnderstood()];
  }

  // ── כמות עובדים — שלב ב': פירוט המדרגה ──
  async _handleEmployeesSub(text) {
    const n = pickNumber(text);
    const groups = {
      small: { 1: 'b5', 2: 'b10' },
      mid: { 1: 'b20', 2: 'b40' },
    };
    const id = (groups[this.lead._empGroup] || {})[n];
    const bracket = getTeamBracket(id);
    if (!bracket) return [messages.notUnderstood()];
    this.lead.team = bracket;
    const sched = await this._proposeSchedule();
    return [messages.teamPriced(bracket), ...sched];
  }

  // ── הצעת מועדים לפי כל החוקים ──
  async _proposeSchedule() {
    try {
      let proposed;
      if (this.lead.location === 'onsite') {
        proposed = await this.calendar.proposeOnsiteDays(this.lead.tier ? this.lead.tier.id : 'base');
      } else {
        proposed = await this.calendar.proposeStudioSlots(this.lead.tier.id);
      }
      if (!proposed.length) return this._noSlotsFallback();
      // נשמר ב-lead כדי לשרוד שחזור מצב בין הודעות.
      this.lead._proposed = proposed;
      this.step = 'schedule';
      return [
        this.lead.location === 'onsite'
          ? messages.presentOnsiteDays(proposed)
          : messages.presentStudioSlots(proposed),
      ];
    } catch (e) {
      return this._noSlotsFallback(e);
    }
  }

  _noSlotsFallback(err) {
    this.lead.outcome = 'לא נמצא מועד פנוי — הופנה לתיאום אישי' + (err ? ` (${err.message})` : '');
    this.notify(this.lead);
    this.step = 'done';
    return [messages.noSlots()];
  }

  _handleSchedule(text) {
    // המועדים המוצעים נשמרו ב-lead — משחזרים תאריכים אם הגיעו כמחרוזות.
    const proposed = (this.lead._proposed || []).map(reviveSlot);
    const n = pickNumber(text);
    if (!n || n < 1 || n > proposed.length) return [messages.notUnderstood()];
    this.lead.selectedSlot = proposed[n - 1];
    const fields = this.lead.location === 'onsite'
      ? ['name', 'phone', 'email', 'address']
      : ['name', 'phone', 'email'];
    return this._startContact(fields, 'book');
  }

  // ── איסוף פרטי קשר (מוקלד) ──
  _startContact(fields, purpose, prefix = []) {
    this.contactFields = fields;
    this.contactIndex = 0;
    this.contactPurpose = purpose;
    this.step = 'contact';
    return [...prefix, CONTACT_QUESTIONS[fields[0]]()];
  }

  async _handleContact(text) {
    const field = this.contactFields[this.contactIndex];
    let value = norm(text);
    if (field === 'phone') value = extractPhone(text) || value;
    if (field === 'email') value = extractEmail(text) || value;
    this.lead[field] = value;
    this.contactIndex++;

    if (this.contactIndex < this.contactFields.length) {
      return [CONTACT_QUESTIONS[this.contactFields[this.contactIndex]]()];
    }

    // כל הפרטים נאספו.
    if (this.contactPurpose === 'book') return this._finalizeBooking();

    // handoff / teamCustom — מיידעים את שרון.
    if (!this.lead.outcome) this.lead.outcome = 'מתואמת שיחה אישית עם שרון';
    this.notify(this.lead);
    this.step = 'done';
    return [
      this.contactPurpose === 'teamCustom'
        ? messages.teamCustomDone(this.lead.name)
        : messages.handoffDone(this.lead.name),
    ];
  }

  // ── קביעת מועד ביומן + התראה לשרון ──
  async _finalizeBooking() {
    const slot = this.lead.selectedSlot;
    const info = this._eventInfo();
    let result;
    try {
      result = await this.calendar.book(slot, info);
    } catch (e) {
      result = { ok: false, reason: e.message };
    }

    if (!result || !result.ok) {
      this.lead.outcome = 'קביעה ביומן נכשלה — הופנה לתיאום אישי' +
        (result && result.reason ? ` (${result.reason})` : '');
      this.notify(this.lead);
      this.step = 'done';
      return [messages.bookingFailed()];
    }

    this.lead.booking = {
      dateKey: slot.dateKey,
      dateLabel: slot.dateLabel,
      startLabel: slot.startLabel,
      endLabel: slot.endLabel,
      fullDay: !!slot.fullDay,
      eventId: result.eventId || null,
    };
    this.lead.outcome = 'מועד נקבע ביומן';
    this.notify(this.lead);
    this.step = 'done';
    return [messages.confirm(this.lead)];
  }

  _eventInfo() {
    const l = this.lead;
    let priceText;
    if (l.audience === 'team' && l.team) {
      priceText = `${l.team.label} — ${formatPrice(l.team.perPerson)} לעובד + ${formatPrice(TEAM.arrivalFee)} הגעה והקמה`;
    } else {
      priceText = `חבילת ${l.tier.label} ${PACKAGES[l.location].label} — ${formatPrice(l.tier.price)}`;
    }
    const location = l.location === 'onsite' ? l.address : business.studioAddress;
    const title = l.audience === 'team'
      ? `צילום צוות — ${l.name}`
      : `צילום ${l.tier.label} — ${l.name}`;
    const description = [
      `סוג: ${l.audience === 'team' ? 'צוות עובדים' : 'אדם אחד'}`,
      priceText,
      `שם: ${l.name}`,
      `טלפון: ${l.phone}`,
      `אימייל: ${l.email}`,
      l.address ? `כתובת: ${l.address}` : null,
    ].filter(Boolean).join('\n');
    return { title, description, location, attendeeEmail: l.email };
  }

  // ── מעבר לשרון ──
  _isHandoffIntent(text) {
    return HANDOFF_WORDS.some((w) => norm(text).includes(w));
  }
  _enterHandoff(reason) {
    this.lead.outcome = this.lead.outcome || reason;
    return this._startContact(['name', 'phone', 'email'], 'handoff', [messages.handoff(this.lead.name)]);
  }
}

module.exports = { Brain };
