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
 * שמירת מצב: בזיכרון התהליך (Map לפי chatId). מתאים לעובד הרץ 24/7.
 * אם המצב נמחק (אתחול מחדש) — ברירת המחדל בטוחה: הבוט שב לשקט עד
 * שמפעילים אותו שוב.
 */

const { TRIGGER_WORD, STOP_WORD, AUTO_REPLY_ALL } = require('./config/bot');

class Dispatcher {
  /**
   * @param {object} deps
   * @param {object} deps.greenapi   ממשק שליחה (חייב sendMessage(chatId, text)).
   * @param {Function} deps.makeBrain מפעל שמחזיר מופע Brain חדש לכל שיחה.
   * @param {object} [deps.logger]
   * @param {boolean} [deps.autoReplyAll] עקיפת המתג (לבדיקות).
   */
  constructor({ greenapi, makeBrain, logger = console, autoReplyAll } = {}) {
    if (!greenapi || typeof greenapi.sendMessage !== 'function') {
      throw new Error('Dispatcher דורש greenapi עם sendMessage');
    }
    if (typeof makeBrain !== 'function') {
      throw new Error('Dispatcher דורש makeBrain');
    }
    this.greenapi = greenapi;
    this.makeBrain = makeBrain;
    this.logger = logger;
    this.autoReplyAll = autoReplyAll === undefined ? AUTO_REPLY_ALL : autoReplyAll;
    this.sessions = new Map(); // chatId -> { active, brain }
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
    if (!this._isActive(evt.chatId)) return; // שער ההפעלה הידנית.
    return this._respond(evt.chatId, text);
  }

  _isActive(chatId) {
    if (this.autoReplyAll) return true;
    const s = this.sessions.get(chatId);
    return !!(s && s.active);
  }

  async _activate(chatId) {
    const brain = this.makeBrain();
    this.sessions.set(chatId, { active: true, brain });
    this.logger.log(`[dispatcher] הופעל ידנית בשיחה ${chatId}`);
    await this._send(chatId, brain.start());
  }

  _deactivate(chatId) {
    this.sessions.delete(chatId);
    this.logger.log(`[dispatcher] הוחזרה שליטה לשרון בשיחה ${chatId}`);
  }

  async _respond(chatId, text) {
    let s = this.sessions.get(chatId);
    // במצב אוטומטי לכולם — יוצרים שיחה ומברכים בהודעה הראשונה.
    if (!s) {
      const brain = this.makeBrain();
      s = { active: true, brain };
      this.sessions.set(chatId, s);
      return this._send(chatId, brain.start());
    }
    const replies = s.brain.receive(text);
    await this._send(chatId, replies);
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
