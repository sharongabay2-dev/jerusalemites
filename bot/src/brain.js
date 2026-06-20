'use strict';

/**
 * "המוח" של הבוט — מנהל את מהלך השיחה כמכונת מצבים.
 * -------------------------------------------------------------
 * עצמאי לחלוטין מהערוץ (וואטסאפ / טרמינל): מקבל טקסט, מחזיר הודעות.
 * מופע אחד = שיחה אחת. בעתיד, חיבור הוואטסאפ ייצור מופע Brain לכל
 * מספר טלפון (session) ויעביר אליו הודעות נכנסות.
 *
 * שימוש:
 *   const brain = new Brain({ calendar, notify });
 *   brain.start();            // -> [הודעת פתיחה]
 *   brain.receive('1');       // -> [הודעות תגובה]
 *   brain.isDone();           // -> true כשהשיחה הסתיימה
 */

const messages = require('./messages');
const { getTier } = require('./config/pricing');

// ── עוזרי פירוק קלט ──────────────────────────────────────────
function norm(text) {
  return String(text || '').trim();
}

function containsAny(text, words) {
  const t = norm(text);
  return words.some((w) => t.includes(w));
}

function pickNumber(text) {
  // מזהה ספרה בודדת (1–9) או בורר ספרה ראשונה במחרוזת.
  const m = norm(text).match(/[1-9]/);
  return m ? parseInt(m[0], 10) : null;
}

function extractPhone(text) {
  const m = norm(text).match(/(\+?[\d][\d\-\s().]{6,}\d)/);
  if (!m) return null;
  const digits = m[1].replace(/\D/g, '');
  return digits.length >= 7 ? m[1].trim() : null;
}

const HANDOFF_WORDS = ['שרון', 'טלפון', 'להתקשר', 'לדבר', 'נציג', 'אנושי', 'שיחה אישית'];
const YES_WORDS = ['כן', 'בטח', 'אשמח', 'סבבה', 'יאללה', 'בהחלט', 'ok', 'אוקיי', 'כמובן'];
const NO_WORDS = ['לא', 'ממש לא', 'בינתיים לא', 'אחר כך', 'לא תודה'];

// ── מכונת המצבים ────────────────────────────────────────────
class Brain {
  constructor({ calendar, notify } = {}) {
    if (!calendar) throw new Error('Brain דורש calendar');
    if (!notify) throw new Error('Brain דורש notify');
    this.calendar = calendar;
    this.notify = notify;
    this.step = 'init';
    this.lead = {
      name: null,
      phone: null,
      type: null,
      typeLabel: null,
      when: null,
      location: null,
      locationLabel: null,
      tier: null,
      booking: null,
      outcome: null,
      notes: null,
    };
    this.proposed = [];
    this.contactPurpose = null; // 'handoff' | 'bigcompany' | 'team'
  }

  isDone() {
    return this.step === 'done';
  }

  start() {
    this.step = 'type';
    return [messages.greeting()];
  }

  receive(text) {
    if (this.step === 'done') return [messages.goodbye()];

    // הצעה לעבור לשיחה אישית — זמינה בכל שלב.
    if (this._isHandoffIntent(text)) {
      return this._enterHandoff('הלקוח ביקש לעבור לשיחה אישית עם שרון');
    }

    switch (this.step) {
      case 'type':
        return this._handleType(text);
      case 'when':
        return this._handleWhen(text);
      case 'where':
        return this._handleWhere(text);
      case 'package':
        return this._handlePackage(text);
      case 'team_confirm':
        return this._handleTeamConfirm(text);
      case 'schedule':
        return this._handleSchedule(text);
      case 'name':
        return this._handleName(text);
      case 'phone':
        return this._handlePhone(text);
      case 'collect_contact':
        return this._handleCollectContact(text);
      default:
        return [messages.notUnderstood()];
    }
  }

  // ── שלב הסינון: סוג הצילום ──
  _handleType(text) {
    const n = pickNumber(text);
    let type = null;
    if (n === 1 || containsAny(text, ['פורטרט', 'תדמית', 'אישי'])) type = 'portrait';
    else if (n === 2 || containsAny(text, ['הדשוט', 'headshot', 'עובד בודד', 'כמה אנשים', 'אנשים בודדים'])) type = 'headshots';
    else if (n === 3 || containsAny(text, ['צוות', 'קבוצה', 'קבוצתי'])) type = 'team';
    else if (n === 4 || containsAny(text, ['חברה גדולה', 'עובדים רבים', 'הרבה עובדים', 'המון עובדים'])) type = 'bigcompany';

    if (!type) return [messages.notUnderstood()];

    this.lead.type = type;
    const labels = {
      portrait: 'פורטרט אישי / תדמית',
      headshots: 'הדשוטס (עובד / כמה בודדים)',
      team: 'צילום צוות / קבוצה',
      bigcompany: 'חברה גדולה — הדשוטס לעובדים רבים',
    };
    this.lead.typeLabel = labels[type];

    if (type === 'bigcompany') {
      // פרויקט גדול — הבוט לא קובע לבד, אלא מתאם שיחת טלפון.
      this.contactPurpose = 'bigcompany';
      this.lead.outcome = 'פרויקט גדול — מתואמת שיחת טלפון עם שרון (ללא קביעה אוטומטית)';
      this.step = 'collect_contact';
      return [messages.bigCompany()];
    }

    if (type === 'team') {
      this.step = 'team_confirm';
      return [messages.teamPricing()];
    }

    this.step = 'when';
    return [messages.askWhen()];
  }

  _handleTeamConfirm(text) {
    if (containsAny(text, NO_WORDS) && !containsAny(text, YES_WORDS)) {
      this.lead.outcome = 'קיבל תמחור צוות (לפי אדם), בחר שלא לתאם כרגע';
      this.notify(this.lead);
      this.step = 'done';
      return [messages.goodbye()];
    }
    // ברירת מחדל: מחברים לשרון לבניית הצעה מדויקת.
    this.contactPurpose = 'team';
    this.lead.outcome = 'תמחור צוות — מתואמת שיחת טלפון עם שרון לבניית הצעה';
    this.step = 'collect_contact';
    return [messages.askContactForHandoff()];
  }

  // ── שלב הסינון: מתי ──
  _handleWhen(text) {
    this.lead.when = norm(text);
    this.step = 'where';
    return [messages.askWhere()];
  }

  // ── שלב הסינון: איפה ──
  _handleWhere(text) {
    const n = pickNumber(text);
    let loc = null;
    if (n === 1 || containsAny(text, ['סטודיו', 'אצלכם', 'אליכם'])) loc = 'studio';
    else if (n === 2 || containsAny(text, ['אצל', 'אלי', 'אליי', 'אצלי', 'אצלנו', 'בבית', 'במשרד', 'בעבודה'])) loc = 'onsite';

    if (!loc) return [messages.notUnderstood()];

    this.lead.location = loc;
    this.lead.locationLabel = loc === 'studio' ? 'בסטודיו' : 'אצל הלקוח';
    this.step = 'package';
    return [messages.presentPackages(loc)];
  }

  // ── הצגת חבילה ומחיר + בחירה ──
  _handlePackage(text) {
    const n = pickNumber(text);
    let tierId = null;
    if (n === 1 || containsAny(text, ['בסיס', 'בסיסי'])) tierId = 'base';
    else if (n === 2 || containsAny(text, ['סטנדרט', 'רגיל', 'מומלצ', 'אמצע'])) tierId = 'standard';
    else if (n === 3 || containsAny(text, ['פרימיום', 'מקסימום', 'הכי טוב', 'מלא'])) tierId = 'premium';

    if (!tierId) return [messages.notUnderstood()];

    this.lead.tier = getTier(this.lead.location, tierId);
    return this._proposeSchedule();
  }

  // ── הצעת מועדים לפי כל חוקי הזמינות ──
  _proposeSchedule() {
    const tierId = this.lead.tier.id;
    if (this.lead.location === 'onsite') {
      this.proposed = this.calendar.proposeOnsiteDays(tierId);
      this.step = this.proposed.length ? 'schedule' : 'done';
      const msg = messages.presentOnsiteDays(this.proposed);
      if (!this.proposed.length) return this._noSlotsFallback(msg);
      return [msg];
    }
    this.proposed = this.calendar.proposeStudioSlots(tierId);
    this.step = this.proposed.length ? 'schedule' : 'done';
    const msg = messages.presentStudioSlots(this.proposed, this.lead.tier.label);
    if (!this.proposed.length) return this._noSlotsFallback(msg);
    return [msg];
  }

  _noSlotsFallback(msg) {
    this.lead.outcome = 'לא נמצאה משבצת פנויה — הופנה לתיאום אישי עם שרון';
    this.notify(this.lead);
    return [msg];
  }

  _handleSchedule(text) {
    const n = pickNumber(text);
    if (!n || n < 1 || n > this.proposed.length) return [messages.notUnderstood()];
    this.lead.selectedSlot = this.proposed[n - 1];
    this.step = 'name';
    return [messages.askName()];
  }

  _handleName(text) {
    this.lead.name = norm(text);
    this.step = 'phone';
    return [messages.askPhone()];
  }

  _handlePhone(text) {
    this.lead.phone = extractPhone(text) || norm(text);
    return this._finalizeBooking();
  }

  // ── קביעת המועד ביומן (בדיקה מדומה) + התראה לשרון ──
  _finalizeBooking() {
    const slot = this.lead.selectedSlot;
    const tier = this.lead.tier;
    const title = `צילום ${tier.label} — ${this.lead.name} (${this.lead.locationLabel})`;
    const result = this.calendar.book(slot, title);

    if (!result.ok) {
      // התנגשות נדירה — נופלים לתיאום אישי.
      this.lead.outcome = `המועד לא נשמר (${result.reason}) — הופנה לתיאום אישי`;
      this.notify(this.lead);
      this.step = 'done';
      return [
        'מתנצל — נראה שהמועד נתפס בדיוק כעת. העברתי את הפנייה לשרון, ' +
          'והוא יתאם אתכם מועד חלופי באופן אישי.',
      ];
    }

    this.lead.booking = {
      dateKey: slot.dateKey,
      dateLabel: slot.dateLabel,
      startLabel: slot.startLabel,
      endLabel: slot.endLabel,
      fullDay: !!slot.fullDay,
    };
    this.lead.outcome = 'מועד נקבע ביומן (בדיקה מדומה)';
    this.notify(this.lead);
    this.step = 'done';

    const confirm =
      this.lead.location === 'onsite'
        ? messages.confirmOnsite(this.lead.name, tier, this.lead.booking)
        : messages.confirmStudio(this.lead.name, tier, this.lead.booking);
    return [confirm];
  }

  // ── מעבר לשיחה אישית עם שרון (מכל שלב) ──
  _isHandoffIntent(text) {
    return containsAny(text, HANDOFF_WORDS);
  }

  _enterHandoff(reason) {
    this.contactPurpose = this.contactPurpose || 'handoff';
    if (!this.lead.outcome) this.lead.outcome = reason;
    const out = [messages.handoff(this.lead.name)];
    if (!this.lead.name || !this.lead.phone) {
      this.step = 'collect_contact';
      out.push(messages.askContactForHandoff());
    } else {
      this.notify(this.lead);
      this.step = 'done';
      out.push(messages.goodbye());
    }
    return out;
  }

  // ── איסוף פרטי קשר להעברה לשרון (שם + טלפון, גמיש) ──
  _handleCollectContact(text) {
    const phone = extractPhone(text);
    if (phone && !this.lead.phone) {
      this.lead.phone = phone;
      // מה שנשאר אחרי הסרת הטלפון עשוי להיות השם.
      const rest = norm(norm(text).replace(phone, '').replace(/[,،]/g, ' ')).trim();
      if (rest && !this.lead.name) this.lead.name = rest;
    } else if (!this.lead.name) {
      this.lead.name = norm(text);
    } else if (!this.lead.phone) {
      this.lead.phone = norm(text);
    }

    if (!this.lead.name) return [messages.askName()];
    if (!this.lead.phone) return [messages.askPhone()];

    this.notify(this.lead);
    this.step = 'done';
    return [messages.goodbye()];
  }
}

module.exports = { Brain };
