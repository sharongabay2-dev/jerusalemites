'use strict';

/**
 * הגדרות הפעלת הבוט — שליטה ידנית מול אוטומטית.
 *
 * AUTO_REPLY_ALL הוא "המתג" היחיד: ברירת המחדל false — הבוט שקט,
 * ועונה רק בשיחות שהופעלו ידנית (שרון שולח "בוט" מהמכשיר שלו).
 * כדי להפוך את הבוט לאוטומטי שעונה לכולם — מגדירים משתנה סביבה:
 *   BOT_AUTO_REPLY_ALL=true
 * בלי לגעת בקוד.
 */

module.exports = {
  // המילה שמפעילה את הבוט בשיחה (נשלחת ע"י שרון מהמכשיר שלו).
  TRIGGER_WORD: process.env.BOT_TRIGGER_WORD || 'בוט',
  // המילה שמחזירה את השליטה לשרון.
  STOP_WORD: process.env.BOT_STOP_WORD || 'סיום',
  // המתג: false = הפעלה ידנית בלבד | true = הבוט עונה לכל אחד.
  AUTO_REPLY_ALL:
    String(process.env.BOT_AUTO_REPLY_ALL || 'false').toLowerCase() === 'true',
};
