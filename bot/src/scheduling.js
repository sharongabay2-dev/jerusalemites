'use strict';

/**
 * לוגיקת זמינות משותפת — מחושבת זהה גם ליומן הבדיקה וגם ליומן גוגל האמיתי.
 * עובדת על "מרווחים תפוסים" (busy intervals) בדקות מתחילת היום (לפי שעון מקומי),
 * ומחילה את חוקי החלון/משך/רווח מ-config/availability.
 */

const {
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  STUDIO_DURATION_MIN,
  GAP_MIN,
  SLOT_STEP_MIN,
  minutesToHHMM,
} = require('./config/availability');

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

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

function formatDateHe(date) {
  const day = HE_WEEKDAYS[date.getDay()];
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `יום ${day}, ${d}/${m}`;
}

function slotIsFree(startMin, endMin, busy) {
  for (const b of busy) {
    const free = endMin + GAP_MIN <= b.startMin || b.endMin + GAP_MIN <= startMin;
    if (!free) return false;
  }
  return true;
}

function makeSlot(date, startMin, endMin) {
  return {
    date: new Date(date),
    dateKey: toDateKey(date),
    startMin,
    endMin,
    startLabel: minutesToHHMM(startMin),
    endLabel: minutesToHHMM(endMin),
    dateLabel: formatDateHe(date),
  };
}

/**
 * משבצות סטודיו פנויות ליום נתון — נפרדות, לא חופפות, עם רווח חובה.
 * @param {Date} date
 * @param {string} tierId
 * @param {Array<{startMin:number,endMin:number}>} busy
 */
function studioSlotsForDay(date, tierId, busy) {
  const duration = STUDIO_DURATION_MIN[tierId];
  if (!duration) return [];
  const slots = [];
  let start = WINDOW_START_MIN;
  while (start + duration <= WINDOW_END_MIN) {
    const end = start + duration;
    if (slotIsFree(start, end, busy)) {
      slots.push(makeSlot(date, start, end));
      start = end + GAP_MIN; // המשבצת הבאה ללא חפיפה.
    } else {
      start += SLOT_STEP_MIN;
    }
  }
  return slots;
}

/** האם חלון העבודה (9:30–13:30) פנוי לחלוטין ביום זה (לצילום שסוגר יום מלא). */
function windowIsFree(busy) {
  for (const b of busy) {
    const overlaps = b.startMin < WINDOW_END_MIN && b.endMin > WINDOW_START_MIN;
    if (overlaps) return false;
  }
  return true;
}

function fullDaySlot(date) {
  return Object.assign(makeSlot(date, WINDOW_START_MIN, WINDOW_END_MIN), { fullDay: true });
}

// "עכשיו" באזור זמן נתון: { dateKey: 'YYYY-MM-DD', minutes: דקות מתחילת היום }.
function nowInTz(timeZone = 'Asia/Jerusalem') {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  for (const x of fmt.formatToParts(new Date())) p[x.type] = x.value;
  const hour = p.hour === '24' ? 0 : parseInt(p.hour, 10);
  return { dateKey: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + parseInt(p.minute, 10) };
}

// האם המשבצת בעתיד (היום — רק אם זמן ההתחלה גדול מ-now + leadMin).
function isFutureSlot(slot, leadMin, now) {
  if (!slot || !slot.dateKey) return true;
  if (slot.dateKey > now.dateKey) return true; // יום עתידי
  if (slot.dateKey < now.dateKey) return false; // יום שעבר
  return slot.startMin >= now.minutes + leadMin; // היום — רק חלונות עתידיים
}

module.exports = {
  HE_WEEKDAYS,
  toDateKey,
  addDays,
  formatDateHe,
  slotIsFree,
  makeSlot,
  studioSlotsForDay,
  windowIsFree,
  fullDaySlot,
  nowInTz,
  isFutureSlot,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
};
