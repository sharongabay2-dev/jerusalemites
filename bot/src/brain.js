'use strict';

/**
 * "המוח" של הבוט — מכונת מצבים לזרימת השיחה הסופית.
 * עצמאי מהערוץ. receive() אסינכרוני (יומן גוגל רשתי). מצב נשמר/משוחזר.
 *
 * מהלך:
 *  פתיחה -> קהל (אדם אחד / מספר עובדים / תיק עבודות)
 *  אדם אחד -> מיקום -> חבילה -> מועד -> פרטי קשר מלאים -> אישור + אירוע יומן
 *  מספר עובדים -> כמות -> (עד 40: מחיר -> אישור המשך -> מועד -> פרטים -> אישור |
 *                          מעל 40: הצעה אישית -> איסוף לחזרה)
 *  "שרון יחזור אליי" -> איסוף לחזרה (שם + טלפון בלבד)
 *
 * מעבר למענה אנושי ("נציג"/"שרון") מטופל ב-dispatcher, לא כאן.
 */

const messages = require('./messages');
const { getTier, getTeamBracket, formatPrice, TEAM, PACKAGES } = require('./config/pricing');
const business = require('./config/business');

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

// נרמול טקסט להשוואת תוויות, וחילוץ אפשרויות (id+title) מהודעת כפתורים/רשימה.
function normChoice(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}
function optionsOf(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (Array.isArray(msg.buttons)) {
    return msg.buttons.map((b) => ({ id: String(b.id), title: String(b.title) }));
  }
  if (msg.list && Array.isArray(msg.list.rows)) {
    return msg.list.rows.map((r) => ({ id: String(r.id), title: String(r.title) }));
  }
  return null;
}

// שאלות פרטי הקשר לפי מטרה.
const QUESTIONS = {
  book: {
    name: () => messages.askName(),
    phone: () => messages.askPhone(),
    email: () => messages.askEmail(),
    address: () => messages.askAddress(),
  },
  callback: {
    name: () => messages.askCallbackName(),
    phone: () => messages.askCallbackPhone(),
  },
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
      tier: null,
      team: null,
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
    this.contactPurpose = null; // 'book' | 'callback'
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
    // לחיצת כפתור/רשימה מגיעה לעיתים כטקסט של תווית האפשרות — ממירים למספר הבחירה,
    // לפי האפשרויות של השלב הנוכחי (עצמאי, לא תלוי במה שנשמר קודם).
    const choice = this._translateChoice(text);
    switch (this.step) {
      case 'audience': return this._handleAudience(choice);
      case 'location': return this._handleLocation(choice);
      case 'package': return this._handlePackage(choice);
      case 'employees': return this._handleEmployees(choice);
      case 'team_confirm': return this._handleTeamConfirm(choice);
      case 'schedule': return this._handleSchedule(choice);
      case 'contact': return this._handleContact(text); // פרטי קשר — לא ממירים
      default: return [messages.notUnderstood()];
    }
  }

  // אפשרויות הבחירה של השלב הנוכחי (מחושבות מחדש מתוך הודעת השאלה).
  _currentOptions() {
    try {
      let msg = null;
      switch (this.step) {
        case 'audience': msg = messages.greeting(); break;
        case 'location': msg = messages.askLocation(); break;
        case 'package': msg = messages.presentPackages(this.lead.location); break;
        case 'employees': msg = messages.askEmployees(); break;
        case 'team_confirm': msg = messages.teamPrice(this.lead.team); break;
        case 'schedule': msg = messages.presentSlots((this.lead._proposed || []).map(reviveSlot)); break;
        default: return null;
      }
      return optionsOf(msg);
    } catch (_) {
      return null;
    }
  }

  _translateChoice(text) {
    const t = normChoice(text);
    if (!t || /^[1-9]$/.test(t)) return text; // כבר מספר
    const opts = this._currentOptions();
    if (!opts) return text;
    // התאמה מדויקת ל-id (למשל "1") או לתווית ("צילום תדמית ליחיד").
    for (const o of opts) {
      const id = String(o.id);
      const title = normChoice(o.title);
      if (t === id) return id;
      if (title && (t === title || title.startsWith(t) || t.startsWith(title))) return id;
    }
    // buttonId עם מספר משובץ (btn_1 / option_1 / 1) -> מספר הבחירה.
    const m = t.match(/(\d+)/);
    if (m && opts.some((o) => String(o.id) === m[1])) return m[1];
    return text;
  }

  // 1 · קהל
  _handleAudience(text) {
    const n = pickNumber(text);
    if (n === 1) {
      this.lead.audience = 'single';
      this.step = 'location';
      return [messages.askLocation()];
    }
    if (n === 2) {
      this.lead.audience = 'team';
      this.lead.location = 'onsite';
      this.step = 'employees';
      return [messages.askEmployees()];
    }
    if (n === 3) {
      // תיק עבודות וביקורות — שולחים קישורים וחוזרים לשאלת הפתיחה.
      return [messages.portfolioLinks(), messages.greeting()];
    }
    return [messages.notUnderstood()];
  }

  // 2 · מיקום (אדם אחד)
  _handleLocation(text) {
    const n = pickNumber(text);
    if (n === 1) this.lead.location = 'studio';
    else if (n === 2) this.lead.location = 'onsite';
    else return [messages.notUnderstood()];
    this.step = 'package';
    return [messages.presentPackages(this.lead.location)];
  }

  // 3 · חבילה (אדם אחד)
  async _handlePackage(text) {
    const map = { 1: 'base', 2: 'standard', 3: 'premium' };
    const tierId = map[pickNumber(text)];
    if (!tierId) return [messages.notUnderstood()];
    this.lead.tier = getTier(this.lead.location, tierId);
    return this._proposeSchedule();
  }

  // 7 · כמות עובדים
  async _handleEmployees(text) {
    const map = { 1: 'b5', 2: 'b10', 3: 'b20', 4: 'b40', 5: 'b41' };
    const bracket = getTeamBracket(map[pickNumber(text)]);
    if (!bracket) return [messages.notUnderstood()];
    this.lead.team = bracket;

    if (bracket.perPerson === null) {
      // 9 · מעל 40 — הצעה אישית, איסוף לחזרה.
      this.lead.outcome = 'צוות מעל 40 — הצעה אישית; שרון יחזור אל הלקוח';
      return this._startContact(['name', 'phone'], 'callback', [messages.teamCustom()]);
    }
    // 8 · הצגת מחיר ואישור המשך.
    this.step = 'team_confirm';
    return [messages.teamPrice(bracket)];
  }

  // 8 · המשך / חזרה
  async _handleTeamConfirm(text) {
    const n = pickNumber(text);
    if (n === 1) return this._proposeSchedule(); // יום מלא
    if (n === 2) {
      this.lead.outcome = 'צוות — הלקוח ביקש ששרון יחזור אליו';
      return this._startContact(['name', 'phone'], 'callback');
    }
    return [messages.notUnderstood()];
  }

  // 4 · הצעת מועדים מהיומן
  async _proposeSchedule() {
    try {
      const tierId = this.lead.tier ? this.lead.tier.id : 'base';
      const proposed =
        this.lead.location === 'onsite'
          ? await this.calendar.proposeOnsiteDays(tierId)
          : await this.calendar.proposeStudioSlots(tierId);
      if (!proposed.length) return this._noSlotsFallback();
      this.lead._proposed = proposed; // נשמר לשרידות מצב
      this.step = 'schedule';
      return [messages.presentSlots(proposed)];
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
    const proposed = (this.lead._proposed || []).map(reviveSlot);
    const n = pickNumber(text);
    if (!n || n < 1 || n > proposed.length) return [messages.notUnderstood()];
    this.lead.selectedSlot = proposed[n - 1];
    const fields =
      this.lead.location === 'onsite'
        ? ['name', 'phone', 'email', 'address']
        : ['name', 'phone', 'email'];
    return this._startContact(fields, 'book');
  }

  // 5 · איסוף פרטים
  _startContact(fields, purpose, prefix = []) {
    this.contactFields = fields;
    this.contactIndex = 0;
    this.contactPurpose = purpose;
    this.step = 'contact';
    return [...prefix, QUESTIONS[purpose][fields[0]]()];
  }

  async _handleContact(text) {
    const field = this.contactFields[this.contactIndex];
    let value = norm(text);
    if (field === 'phone') value = extractPhone(text) || value;
    if (field === 'email') value = extractEmail(text) || value;
    this.lead[field] = value;
    this.contactIndex++;

    if (this.contactIndex < this.contactFields.length) {
      return [QUESTIONS[this.contactPurpose][this.contactFields[this.contactIndex]]()];
    }

    if (this.contactPurpose === 'book') return this._finalizeBooking();

    // איסוף לחזרה — מיידעים את שרון.
    if (!this.lead.outcome) this.lead.outcome = 'איסוף לחזרה — שרון יחזור אל הלקוח';
    this.notify(this.lead);
    this.step = 'done';
    return [messages.callbackDone()];
  }

  // 6 · קביעת מועד ביומן + אישור
  async _finalizeBooking() {
    const slot = this.lead.selectedSlot;
    let result;
    try {
      result = await this.calendar.book(slot, this._eventInfo());
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
      priceText = `צוות (${l.team.label}) — ${formatPrice(l.team.perPerson)} לעובד + ${formatPrice(TEAM.arrivalFee)} הגעה והקמה`;
    } else {
      priceText = `חבילת ${l.tier.label} ${PACKAGES[l.location].label} — ${formatPrice(l.tier.price)}`;
    }
    const location = l.location === 'onsite' ? l.address : business.studioAddress;
    const title = l.audience === 'team' ? `צילום צוות — ${l.name}` : `צילום ${l.tier.label} — ${l.name}`;
    const description = [
      `סוג: ${l.audience === 'team' ? 'מספר עובדים' : 'אדם אחד'}`,
      priceText,
      `שם: ${l.name}`,
      `טלפון: ${l.phone}`,
      l.email ? `אימייל: ${l.email}` : null,
      l.address ? `כתובת: ${l.address}` : null,
    ].filter(Boolean).join('\n');
    return { title, description, location, attendeeEmail: l.email };
  }
}

module.exports = { Brain };
