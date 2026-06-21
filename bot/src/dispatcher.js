'use strict';

/**
 * Dispatcher — מקשר בין אירועי Green API ל"מוח" הבוט (Brain),
 * ומיישם את לוגיקת ההפעלה הידנית.
 * -------------------------------------------------------------
 * כללי ההפעלה:
 *  - ברירת מחדל: הבוט שקט ולא עונה לאף אחד.
 *  - שרון שולח את המילה "בוט" *מהמכשיר שלו* (הודעה יוצאת) בתוך שיחה ->
 *    הבוט נכנס ומנהל את אותה שיחה בלבד.
 *  - שרון שולח "סיום" מהמכשיר שלו -> השליטה חוזרת אליו, הבוט יוצא.
 *  - הזיהוי הוא של הודעה *יוצאת מהמכשיר* (outgoingMessageReceived),
 *    ולא של הודעת לקוח, ולא של הודעות שהבוט עצמו שלח (outgoingAPIMessageReceived).
 *  - מתג BOT_AUTO_REPLY_ALL=true הופך את הבוט לאוטומטי שעונה לכולם.
 *
 * שמירת מצב: דרך `store` (אחסון מתמיד כמו Redis, עם נפילה לזיכרון).
 * כך שיחה פעילה לא נשכחת גם אחרי הפסקה ארוכה או אתחול מופע serverless.
 * אם אין מצב שמור (או שהאחסון לא זמין) — ברירת המחדל בטוחה: הבוט שותק
 * עד שמפעילים אותו שוב.
 */

const { TRIGGER_WORD, STOP_WORD, AUTO_REPLY_ALL } = require('./config/bot');
const { MemoryStore } = require('./store');
const messages = require('./messages');

// מילים שהלקוח שולח כדי לעבור למענה אנושי (מילה בודדת בדיוק).
const HUMAN_WORDS = ['נציג', 'שרון'];
// הערה: המרת לחיצת כפתור/רשימה (שמגיעה כטקסט התווית) למספר הבחירה נעשית
// בתוך ה-Brain עצמו (לפי השלב הנוכחי) — כך שזה עובד תמיד, ללא תלות במצב שמור.

class Dispatcher {
  /**
   * @param {object} deps
   * @param {object} deps.greenapi   ממשק שליחה (חייב sendMessage(chatId, text)).
   * @param {Function} deps.makeBrain מפעל שמחזיר מופע Brain חדש לכל שיחה.
   * @param {object} [deps.store]     אחסון מצב (get/set/del). ברירת מחדל: זיכרון.
   * @param {object} [deps.logger]
   * @param {boolean} [deps.autoReplyAll] עקיפת המתג (לבדיקות).
   */
  constructor({ greenapi, makeBrain, store, logger = console, autoReplyAll } = {}) {
    if (!greenapi || typeof greenapi.sendMessage !== 'function') {
      throw new Error('Dispatcher דורש greenapi עם sendMessage');
    }
    if (typeof makeBrain !== 'function') {
      throw new Error('Dispatcher דורש makeBrain');
    }
    this.greenapi = greenapi;
    this.makeBrain = makeBrain;
    this.store = store || new MemoryStore();
    this.logger = logger;
    this.autoReplyAll = autoReplyAll === undefined ? AUTO_REPLY_ALL : autoReplyAll;
  }

  /** נקודת הכניסה: מקבלת אירוע אחיד מ-greenapi.normalize(). */
  async onEvent(evt) {
    if (!evt || evt.kind !== 'message' || !evt.chatId) return;
    const text = (evt.text || '').trim();

    if (evt.direction === 'outgoing') {
      // הודעות שהבוט עצמו שלח — להתעלם (מניעת לולאה).
      if (evt.viaApi) return;
      // הודעה יוצאת מהמכשיר של שרון = פקודת שליטה ידנית.
      if (text === TRIGGER_WORD) return this.activate(evt.chatId);
      if (text === STOP_WORD) return this.deactivate(evt.chatId);
      return; // הודעה ידנית אחרת של שרון — לא נוגעים.
    }

    // הודעה נכנסת מלקוח.
    const session = await this.store.get(evt.chatId);
    const active = this.autoReplyAll || !!(session && session.active);
    // --- אבחון זמני ---
    this.logger.log(
      `[dispatcher][diag] נכנסת chat=${evt.chatId} active=${active} hasLastOptions=${!!(session && session.lastOptions)} text=${JSON.stringify(text)}`
    );
    if (!active) return; // שער ההפעלה הידנית.

    // מעבר למענה אנושי: הלקוח כתב בדיוק "נציג" או "שרון" (מילה בודדת).
    if (HUMAN_WORDS.includes(text)) {
      await this._send(evt.chatId, [messages.humanHandoff()]);
      await this.deactivate(evt.chatId); // הבוט מפסיק להגיב; שרון ממשיך ידנית.
      return;
    }

    return this._respond(evt.chatId, text, session);
  }

  /**
   * הפעלת הבוט בשיחה — שולח מיד את הודעת הפתיחה ומתחיל את הזרימה.
   * משמש גם את המילה "בוט" וגם את כפתור "הפעל בוט" בדף השליטה.
   */
  async activate(chatId) {
    const brain = this.makeBrain();
    const replies = brain.start();
    await this.store.set(chatId, { active: true, brain: brain.toState() });
    this.logger.log(`[dispatcher] הופעל בשיחה ${chatId}`);
    await this._send(chatId, replies);
  }

  /** כיבוי הבוט בשיחה (מחזיר שליטה לשרון). */
  async deactivate(chatId) {
    await this.store.del(chatId);
    this.logger.log(`[dispatcher] הוחזרה שליטה לשרון בשיחה ${chatId}`);
  }

  async _respond(chatId, text, session) {
    // שיחה קיימת — משחזרים את המוח מהמצב השמור וממשיכים.
    if (session && session.brain) {
      const brain = this.makeBrain().loadState(session.brain);
      const replies = await brain.receive(text); // ה-Brain ממיר תווית-כפתור למספר בעצמו
      await this.store.set(chatId, { active: true, brain: brain.toState() });
      return this._send(chatId, replies);
    }
    // מצב אוטומטי לכולם, הודעה ראשונה — מברכים ופותחים שיחה.
    const brain = this.makeBrain();
    const replies = brain.start();
    await this.store.set(chatId, { active: true, brain: brain.toState() });
    return this._send(chatId, replies);
  }

  async _send(chatId, lines) {
    for (const line of lines || []) {
      // תשובה יכולה להיות מחרוזת, הודעת כפתורים { text, buttons } או רשימה { text, list }.
      const isObj = line && typeof line === 'object';
      const isButtons = isObj && Array.isArray(line.buttons);
      const isList = isObj && line.list && Array.isArray(line.list.rows);
      const text = isObj ? line.text : line;
      try {
        if (isButtons && typeof this.greenapi.sendButtons === 'function') {
          await this.greenapi.sendButtons(chatId, text, line.buttons);
        } else if (isList && typeof this.greenapi.sendList === 'function') {
          await this.greenapi.sendList(chatId, text, line.list.rows, {
            buttonText: line.list.buttonText,
            title: line.list.title,
          });
        } else {
          // גיבוי: אם אינטראקטיבי לא נתמך — שולחים את גוף הטקסט הממוספר.
          await this.greenapi.sendMessage(chatId, text);
        }
      } catch (e) {
        this.logger.error(`[dispatcher] שליחה נכשלה ל-${chatId}: ${e.message}`);
        // גיבוי: אם שליחת ההודעה האינטראקטיבית נכשלה, ננסה טקסט רגיל.
        if (isButtons || isList) {
          try {
            await this.greenapi.sendMessage(chatId, text);
          } catch (_) {}
        }
      }
    }
  }
}

module.exports = { Dispatcher };
