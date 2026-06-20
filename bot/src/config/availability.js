'use strict';

/**
 * חוקי הזמינות וקביעת המועד — מקור אמת יחיד.
 *
 * - ימי עבודה: ראשון–חמישי.
 * - חלון שעות: 9:30–13:30.
 * - משכי צילום בסטודיו לפי חבילה, עם רווח של 30 דק' בין צילום לצילום.
 * - צילום אצל הלקוח חוסם יום שלם.
 */

// ימי השבוע ב-JS: ראשון=0 ... שבת=6. ימי עבודה: ראשון(0)–חמישי(4).
const WORKING_DAYS = [0, 1, 2, 3, 4];

// חלון השעות בדקות מתחילת היום.
const WINDOW_START_MIN = 9 * 60 + 30; // 09:30 => 570
const WINDOW_END_MIN = 13 * 60 + 30; // 13:30 => 810

// משך צילום בסטודיו (דקות) לפי חבילה.
const STUDIO_DURATION_MIN = {
  base: 30,
  standard: 60,
  premium: 90,
};

// רווח חובה בין צילום לצילום (דקות).
const GAP_MIN = 30;

// קפיצת זמן בין מועדים מוצעים (דקות).
const SLOT_STEP_MIN = 30;

function isWorkingDay(date) {
  return WORKING_DAYS.includes(date.getDay());
}

function minutesToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

module.exports = {
  WORKING_DAYS,
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  STUDIO_DURATION_MIN,
  GAP_MIN,
  SLOT_STEP_MIN,
  isWorkingDay,
  minutesToHHMM,
};
