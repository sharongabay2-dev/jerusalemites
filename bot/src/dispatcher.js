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
      if (text === TRIGGER_WORD) return this._activate(evt.chatId);
      if (text === STOP_WORD) return this._deactivate(evt.chatId);
      return; // הודעה ידנית אחרת של שרון — לא נוגעים.
    }

    // הודעה נכנסת מלקוח.
    const session = await this.store.get(evt.chatId);
    const active = this.autoReplyAll || !!(session && session.active);
    if (!active) return; // שער ההפעלה הידנית.
    return this._respond(evt.chatId, text, session);
  }

  async _activate(chatId) {
    const brain = this.makeBrain();
    const replies = brain.start();
    await this.store.set(chatId, { active: true, brain: brain.toState() });
    this.logger.log(`[dispatcher] הופעל ידנית בשיחה ${chatId}`);
    await this._send(chatId, replies);
  }

  async _deactivate(chatId) {
    await this.store.del(chatId);
    this.logger.log(`[dispatcher] הוחזרה שליטה לשרון בשיחה ${chatId}`);
  }

  async _respond(chatId, text, session) {
    // שיחה קיימת — משחזרים את המוח מהמצב השמור וממשיכים.
    if (session && session.brain) {
      const brain = this.makeBrain().loadState(session.brain);
      const replies = await brain.receive(text);
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
      try {
        await this.greenapi.sendMessage(chatId, line);
      } catch (e) {
        this.logger.error(`[dispatcher] שליחה נכשלה ל-${chatId}: ${e.message}`);
      }
    }
  }
}

module.exports = { Dispatcher };
