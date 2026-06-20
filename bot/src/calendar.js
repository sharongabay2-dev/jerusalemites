'use strict';

/**
 * יומן בדיקה מדומה (Mock Calendar).
 * -------------------------------------------------------------
 * זהו שלב הבדיקה: היומן חי בזיכרון בלבד ומאותחל עם כמה אירועים
 * תפוסים כדי להדגים שהבוט מתחשב בזמינות.
 *
 * >>> נקודת חיבור עתידית (Google Calendar) <<<
 * המחלקה Calendar מגדירה את הממשק שייושם בעתיד מול יומן גוגל אמיתי:
 *   - getEventsForDate(date)  -> קריאת זמינות מהיומן
 *   - book(event)             -> יצירת אירוע ביומן
 * כדי לחבר יומן אמיתי: ממשו מחלקה עם אותן מתודות (ראו
 * src/integrations/google-calendar.js) והזריקו אותה ל-brain במקום זו.
 */

const {
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  STUDIO_DURATION_MIN,
  GAP_MIN,
  SLOT_STEP_MIN,
  isWorkingDay,
  minutesToHHMM,
} = require('./config/availability');

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function formatDateHe(date) {
  const day = HE_WEEKDAYS[date.getDay()];
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `יום ${day}, ${d}/${m}`;
}

class MockCalendar {
  /**
   * @param {Date} baseDate נקודת ההתחלה לחיפוש מועדים ("היום").
   */
  constructor(baseDate = new Date()) {
    this.baseDate = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate()
    );
    // מפה: dateKey -> מערך אירועים { startMin, endMin, fullDay, title }
    this.events = new Map();
    this._seed();
  }

  /** זריעת אירועים תפוסים יחסית ליום הבסיס, להדגמת לוגיקת הזמינות. */
  _seed() {
    const workdays = [];
    let cursor = this.baseDate;
    while (workdays.length < 4) {
      if (isWorkingDay(cursor)) workdays.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    // יום עבודה ראשון: צילום סטנדרט תפוס 10:00–11:00.
    this._add(workdays[0], { startMin: 10 * 60, endMin: 11 * 60, title: 'צילום סטנדרט (תפוס)' });
    // יום עבודה שני: חסום יום שלם (צילום אצל לקוח אחר).
    this._add(workdays[1], { fullDay: true, title: 'צילום אצל לקוח (יום חסום)' });
    // יום עבודה שלישי: צילום בסיס תפוס 12:00–12:30.
    this._add(workdays[2], { startMin: 12 * 60, endMin: 12 * 60 + 30, title: 'צילום בסיס (תפוס)' });
  }

  _add(date, ev) {
    const key = toDateKey(date);
    if (!this.events.has(key)) this.events.set(key, []);
    this.events.get(key).push(ev);
  }

  /** קריאת אירועי יום מסוים (ממשק שיומן אמיתי יחליף). */
  getEventsForDate(date) {
    return this.events.get(toDateKey(date)) || [];
  }

  isFullyBlocked(date) {
    return this.getEventsForDate(date).some((e) => e.fullDay);
  }

  /** בדיקה אם משבצת [startMin, endMin] פנויה, כולל רווח חובה. */
  _isSlotFree(date, startMin, endMin) {
    const events = this.getEventsForDate(date);
    for (const ev of events) {
      if (ev.fullDay) return false;
      const free =
        endMin + GAP_MIN <= ev.startMin || ev.endMin + GAP_MIN <= startMin;
      if (!free) return false;
    }
    return true;
  }

  /**
   * משבצות פנויות ביום מסוים לצילום סטודיו בחבילה נתונה.
   * מוחזרות משבצות *נפרדות שאינן חופפות* (אריזה חמדנית עם רווח חובה),
   * כדי שהאפשרויות המוצגות ללקוח יהיו ברורות ולא מבלבלות.
   */
  freeStudioSlots(date, tierId) {
    if (!isWorkingDay(date) || this.isFullyBlocked(date)) return [];
    const duration = STUDIO_DURATION_MIN[tierId];
    if (!duration) return [];
    const slots = [];
    let start = WINDOW_START_MIN;
    while (start + duration <= WINDOW_END_MIN) {
      const end = start + duration;
      if (this._isSlotFree(date, start, end)) {
        slots.push({
          date: new Date(date),
          dateKey: toDateKey(date),
          startMin: start,
          endMin: end,
          startLabel: minutesToHHMM(start),
          endLabel: minutesToHHMM(end),
          dateLabel: formatDateHe(date),
        });
        // המשבצת הבאה מתחילה רק אחרי המשבצת שנבחרה + רווח — בלי חפיפה.
        start = end + GAP_MIN;
      } else {
        start += SLOT_STEP_MIN;
      }
    }
    return slots;
  }

  /**
   * הצעת מועדי סטודיו פנויים קרובים.
   * @returns {Array} עד `limit` משבצות, החל מיום הבסיס וקדימה.
   */
  proposeStudioSlots(tierId, { limit = 4, horizonDays = 30 } = {}) {
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(this.baseDate, i);
      const slots = this.freeStudioSlots(day, tierId);
      for (const s of slots) {
        out.push(s);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /**
   * הצעת ימים פנויים לחלוטין לצילום אצל הלקוח (חוסם יום שלם).
   * @returns {Array} עד `limit` ימים פנויים.
   */
  proposeOnsiteDays(tierId, { limit = 3, horizonDays = 45 } = {}) {
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(this.baseDate, i);
      if (!isWorkingDay(day)) continue;
      if (this.getEventsForDate(day).length > 0) continue; // יום חייב להיות פנוי לגמרי
      out.push({
        date: new Date(day),
        dateKey: toDateKey(day),
        fullDay: true,
        startMin: WINDOW_START_MIN,
        endMin: WINDOW_END_MIN,
        startLabel: minutesToHHMM(WINDOW_START_MIN),
        endLabel: minutesToHHMM(WINDOW_END_MIN),
        dateLabel: formatDateHe(day),
      });
    }
    return out;
  }

  /**
   * קביעת מועד ביומן (במצב בדיקה — כתיבה לזיכרון).
   * מאמת מחדש את הזמינות לפני הכתיבה כדי למנוע התנגשות.
   * @returns {{ok: boolean, reason?: string}}
   */
  book(slot, title) {
    const date = slot.date;
    if (slot.fullDay) {
      if (this.getEventsForDate(date).length > 0) {
        return { ok: false, reason: 'היום כבר אינו פנוי לחלוטין' };
      }
      this._add(date, { fullDay: true, title });
      return { ok: true };
    }
    if (!this._isSlotFree(date, slot.startMin, slot.endMin)) {
      return { ok: false, reason: 'המשבצת נתפסה בינתיים' };
    }
    this._add(date, {
      startMin: slot.startMin,
      endMin: slot.endMin,
      title,
    });
    return { ok: true };
  }
}

module.exports = {
  MockCalendar,
  formatDateHe,
  toDateKey,
  addDays,
};
