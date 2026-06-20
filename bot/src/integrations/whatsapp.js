'use strict';

/**
 * חיבור וואטסאפ — נקודת חיבור עתידית (Placeholder).
 * -------------------------------------------------------------
 * בשלב הזה אין חיבור אמיתי לוואטסאפ ואין מפתחות.
 * מצב הבדיקה רץ בטרמינל (ראו src/cli.js) ומשתמש ישירות ב-brain.
 *
 * >>> כך יחובר וואטסאפ בעתיד <<<
 * ספק אפשרי: WhatsApp Cloud API (Meta) / Twilio / 360dialog / whatsapp-web.js.
 * הזרימה תהיה:
 *   1. webhook נכנס -> הודעת לקוח חדשה (טקסט + מספר טלפון).
 *   2. טוענים/יוצרים מצב שיחה לפי מספר הטלפון (session store).
 *   3. brain.handle(state, text) -> מחזיר הודעות הבוט + מצב חדש.
 *   4. שולחים את הודעות הבוט חזרה דרך ה-API.
 *
 * החתימות למטה מגדירות את הממשק שצריך לממש. גוף הפונקציות ריק בכוונה.
 */

/* eslint-disable no-unused-vars */

/**
 * שליחת הודעת טקסט ללקוח בוואטסאפ.
 * @param {string} to מספר טלפון בפורמט בינלאומי (למשל 9725...).
 * @param {string} text תוכן ההודעה.
 */
async function sendMessage(to, text) {
  throw new Error(
    'חיבור וואטסאפ עדיין לא מומש — זהו שלב הבדיקה המקומי. ' +
      'ראו את ההוראות בקובץ src/integrations/whatsapp.js.'
  );
}

/**
 * עיבוד webhook נכנס מספק הוואטסאפ -> אובייקט הודעה אחיד.
 * @param {object} payload גוף ה-webhook הגולמי.
 * @returns {{from: string, text: string}|null}
 */
function parseIncoming(payload) {
  throw new Error('פירוק webhook של וואטסאפ עדיין לא מומש.');
}

module.exports = { sendMessage, parseIncoming };
