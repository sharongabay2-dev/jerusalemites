'use strict';

/**
 * חיבור יומן גוגל — נקודת חיבור עתידית (Placeholder).
 * -------------------------------------------------------------
 * בשלב הזה משתמשים ב-MockCalendar (src/calendar.js) שחי בזיכרון.
 *
 * >>> כך יחובר יומן גוגל אמיתי בעתיד <<<
 * ממשו מחלקה עם אותו ממשק כמו MockCalendar והזריקו אותה ל-brain:
 *   - getEventsForDate(date)
 *   - freeStudioSlots(date, tierId)
 *   - proposeStudioSlots(tierId, opts)
 *   - proposeOnsiteDays(tierId, opts)
 *   - book(slot, title)
 *
 * מאחורי הקלעים המחלקה תשתמש ב-Google Calendar API:
 *   - freebusy.query / events.list -> קריאת זמינות אמיתית.
 *   - events.insert -> קביעת מועד אמיתי (רק בזמן פנוי!).
 * חוקי הזמינות (ימים, חלון שעות, משכים, רווחים) נשארים ב-config/availability.js
 * ומשותפים גם ליומן האמיתי.
 */

/* eslint-disable no-unused-vars */

class GoogleCalendar {
  constructor(options = {}) {
    // בעתיד: אימות OAuth, calendarId, אזור זמן וכו'.
    throw new Error(
      'חיבור יומן גוגל עדיין לא מומש — בשלב הבדיקה נעשה שימוש ב-MockCalendar. ' +
        'ראו הוראות בקובץ src/integrations/google-calendar.js.'
    );
  }
}

module.exports = { GoogleCalendar };
