'use strict';

/**
 * אחסון מצב שיחות — מבוסס Upstash Redis (Vercel KV), עם נפילה לזיכרון.
 * -------------------------------------------------------------
 * מטרה: שמצב שיחה לא ייעלם בין הודעה להודעה (serverless).
 *
 * מפתח לכל שיחה: chatId. ערך: אובייקט ה-state. תפוגה: 24 שעות (מתחדשת בכל כתיבה).
 *
 * החיבור נקרא ממשתני הסביבה הקיימים בפרויקט (תומך בכמה שמות נפוצים):
 *   KV_REST_API_URL / KV_REST_API_TOKEN            (Vercel KV)
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   REDIS_REST_API_URL / REDIS_REST_API_TOKEN
 * אם אין — נופלים לזיכרון התהליך (לא שובר כלום).
 */

const TTL_SECONDS = parseInt(process.env.BOT_SESSION_TTL_SECONDS || '86400', 10); // 24 שעות
const PREFIX = process.env.BOT_SESSION_PREFIX || 'sharonbot:sess:';

function resolveCreds() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL ||
    '';
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN ||
    '';
  return { url, token };
}

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

class UpstashStore {
  constructor({ url, token, logger = console }) {
    const { Redis } = require('@upstash/redis');
    this.backend = 'redis';
    this.logger = logger;
    this.redis = new Redis({ url, token });
  }
  async get(key) {
    const k = PREFIX + key;
    try {
      const v = await this.redis.get(k); // @upstash מחזיר אובייקט מפוענח
      console.log(
        '[store][get] key=%s -> %s',
        k,
        v ? `active=${v.active} step=${v.brain && v.brain.step}` : '(null)'
      );
      return v;
    } catch (e) {
      this.logger.error('[state-store] get נכשל:', e.message);
      return null; // נפילה בטוחה
    }
  }
  async set(key, value) {
    const k = PREFIX + key;
    try {
      await this.redis.set(k, value, { ex: TTL_SECONDS });
      console.log(
        '[store][set] key=%s value=%s',
        k,
        value ? `active=${value.active} step=${value.brain && value.brain.step}` : '(null)'
      );
    } catch (e) {
      this.logger.error('[state-store] set נכשל:', e.message);
    }
  }
  async del(key) {
    try {
      await this.redis.del(PREFIX + key);
    } catch (e) {
      this.logger.error('[state-store] del נכשל:', e.message);
    }
  }
}

function createStore(logger = console) {
  const { url, token } = resolveCreds();
  if (url && token) {
    try {
      const store = new UpstashStore({ url, token, logger });
      if (logger.log) logger.log('[state-store] אחסון מתמיד פעיל (Upstash Redis)');
      return store;
    } catch (e) {
      (logger.error || console.error)('[state-store] חיבור Upstash נכשל, נופלים לזיכרון:', e.message);
    }
  }
  return new MemoryStore();
}

// רשימת שמות משתני סביבה רלוונטיים שקיימים בפועל (לאבחון, ללא ערכים).
function presentEnvNames() {
  return Object.keys(process.env).filter((k) => /KV|UPSTASH|REDIS/i.test(k));
}

module.exports = { createStore, MemoryStore, UpstashStore, TTL_SECONDS, presentEnvNames };
