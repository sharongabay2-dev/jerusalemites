'use strict';

/**
 * יומן בדיקה מדומה (Mock Calendar).
 * -------------------------------------------------------------
 * חי בזיכרון בלבד, מאותחל עם כמה אירועים תפוסים להדגמה.
 * מממש את אותו ממשק כמו GoogleCalendar, כך ש-Brain לא מבחין ביניהם:
 *   - proposeStudioSlots(tierId)   (async)
 *   - proposeOnsiteDays(tierId)    (async)
 *   - book(slot, info)             (async) -> { ok }
 *
 * לוגיקת הזמינות עצמה משותפת ב-src/scheduling.js.
 */

const { isWorkingDay } = require('./config/availability');
const {
  toDateKey,
  addDays,
  studioSlotsForDay,
  windowIsFree,
  fullDaySlot,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
} = require('./scheduling');

class MockCalendar {
  constructor(baseDate = new Date()) {
    this.backend = 'mock';
    this.baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    this.events = new Map(); // dateKey -> [{ startMin, endMin, fullDay, title }]
    this._seed();
  }

  _seed() {
    const workdays = [];
    let cursor = this.baseDate;
    while (workdays.length < 4) {
      if (isWorkingDay(cursor)) workdays.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    this._add(workdays[0], { startMin: 10 * 60, endMin: 11 * 60, title: 'צילום (תפוס)' });
    this._add(workdays[1], { fullDay: true, title: 'יום חסום' });
    this._add(workdays[2], { startMin: 12 * 60, endMin: 12 * 60 + 30, title: 'צילום (תפוס)' });
  }

  _add(date, ev) {
    const key = toDateKey(date);
    if (!this.events.has(key)) this.events.set(key, []);
    this.events.get(key).push(ev);
  }

  _busyFor(date) {
    return (this.events.get(toDateKey(date)) || []).map((e) =>
      e.fullDay ? { startMin: 0, endMin: 1440 } : { startMin: e.startMin, endMin: e.endMin }
    );
  }

  async proposeStudioSlots(tierId, { limit = 6, horizonDays = 14 } = {}) {
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(this.baseDate, i);
      if (!isWorkingDay(day)) continue;
      // משבצת אחת ליום — פיזור על פני ימים שונים.
      const daySlots = studioSlotsForDay(day, tierId, this._busyFor(day));
      if (daySlots.length) out.push(daySlots[0]);
    }
    return out;
  }

  async proposeOnsiteDays(_tierId, { limit = 3, horizonDays = 45 } = {}) {
    const out = [];
    for (let i = 0; i < horizonDays && out.length < limit; i++) {
      const day = addDays(this.baseDate, i);
      if (!isWorkingDay(day)) continue;
      if (!windowIsFree(this._busyFor(day))) continue;
      out.push(fullDaySlot(day));
    }
    return out;
  }

  async book(slot, info = {}) {
    const date = slot.date instanceof Date ? slot.date : new Date(slot.date);
    const title = typeof info === 'string' ? info : info.title || 'צילום';
    const busy = this._busyFor(date);
    if (slot.fullDay) {
      if (!windowIsFree(busy)) return { ok: false, reason: 'היום כבר אינו פנוי' };
      this._add(date, { startMin: WINDOW_START_MIN, endMin: WINDOW_END_MIN, fullDay: true, title });
      return { ok: true };
    }
    const free = busy.every(
      (b) => slot.endMin + 30 <= b.startMin || b.endMin + 30 <= slot.startMin
    );
    if (!free) return { ok: false, reason: 'המשבצת נתפסה' };
    this._add(date, { startMin: slot.startMin, endMin: slot.endMin, title });
    return { ok: true };
  }
}

module.exports = { MockCalendar };
