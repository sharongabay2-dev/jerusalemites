'use strict';

/**
 * אחסון מצב שיחות — מתמיד (Redis) עם נפילה אוטומטית לזיכרון.
 * -------------------------------------------------------------
 * מטרה: שמצב שיחה פעילה לא ייעלם גם אחרי הפסקה ארוכה או אתחול של
 * מופע ה-serverless ב-Vercel.
 *
 * זיהוי אוטומטי לפי משתני סביבה (כל אחד מהזוגות עובד):
 *   - Vercel KV / Upstash:  KV_REST_API_URL + KV_REST_API_TOKEN
 *   - Upstash ישיר:         UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * אם אין — נופלים לזיכרון התהליך (כמו קודם), בלי לשבור כלום.
 *
 * הערכים נשמרים כ-JSON, עם תפוגה (TTL) שמתרעננת בכל כתיבה, כך ששיחה
 * פעילה נשמרת כל עוד יש בה פעילות, ושיחות נטושות מתנקות מעצמן.
 */

const TTL_SECONDS = parseInt(process.env.BOT_SESSION_TTL_SECONDS || '1209600', 10); // 14 יום
const PREFIX = process.env.BOT_SESSION_PREFIX || 'sharonbot:sess:';

class MemoryStore {
  constructor() {
    this.backend = 'memory';
    this.map = new Map();
  }
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async set(key, value) {
    this.map.set(key, value);
  }
  async del(key) {
    this.map.delete(key);
  }
}

class RedisRestStore {
  constructor({ url, token, logger = console }) {
    this.backend = 'redis';
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.logger = logger;
  }

  async _cmd(command) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      throw new Error(`Redis REST ${command[0]} נכשל (${res.status})`);
    }
    const data = await res.json();
    return data.result;
  }

  async get(key) {
    try {
      const raw = await this._cmd(['GET', PREFIX + key]);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      // נפילה בטוחה: אם ה-Redis לא זמין, מתנהגים כאילו אין מצב שמור.
      this.logger.error('[store] GET נכשל, מתעלם:', e.message);
      return null;
    }
  }

  async set(key, value) {
    try {
      await this._cmd(['SET', PREFIX + key, JSON.stringify(value), 'EX', String(TTL_SECONDS)]);
    } catch (e) {
      this.logger.error('[store] SET נכשל:', e.message);
    }
  }

  async del(key) {
    try {
      await this._cmd(['DEL', PREFIX + key]);
    } catch (e) {
      this.logger.error('[store] DEL נכשל:', e.message);
    }
  }
}

function createStore(logger = console) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    logger.log && logger.log('[store] אחסון מתמיד פעיל (Redis REST)');
    return new RedisRestStore({ url, token, logger });
  }
  return new MemoryStore();
}

module.exports = { createStore, MemoryStore, RedisRestStore, TTL_SECONDS };
