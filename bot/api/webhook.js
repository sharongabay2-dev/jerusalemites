'use strict';

/**
 * נקודת קצה ל-webhook של Green API (פונקציית serverless ל-Vercel).
 * Green API שולח לכאן כל הודעה נכנסת/יוצאת, והבוט מגיב.
 *
 * GET  -> בדיקת בריאות (health check).
 * POST -> טיפול בהתראת Green API.
 */

const { getDispatcher, greenapi, store, calendar } = require('../src/runtime');
const { AUTO_REPLY_ALL, TRIGGER_WORD, STOP_WORD } = require('../src/config/bot');

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      service: 'sharon-photography-bot',
      idInstance: greenapi.ID_INSTANCE,
      tokenConfigured: greenapi.hasToken(),
      mode: AUTO_REPLY_ALL ? 'auto-reply-all' : 'manual',
      triggerWord: TRIGGER_WORD,
      stopWord: STOP_WORD,
      stateStore: store.backend, // 'redis' = מתמיד | 'memory' = זמני
      calendar: calendar.backend, // 'google' = יומן אמיתי | 'mock' = בדיקה
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const evt = greenapi.normalize(body);
    // --- אבחון זמני מפורט: כל הודעה (להסרה אחרי אימות) ---
    try {
      const sd = (body && body.senderData) || {};
      const md = (body && body.messageData) || {};
      console.log(
        '[diag][msg] dir=%s kind=%s storeChatId=%s typeWebhook=%s typeMessage=%s textMessage=%j sender=%s senderChatId=%s viaApi=%s',
        evt.direction,
        evt.kind,
        evt.chatId,
        body && body.typeWebhook,
        md.typeMessage,
        evt.text,
        sd.sender,
        sd.chatId,
        evt.viaApi
      );
      // המבנה המלא של messageData — לראות שדות לא צפויים (כפתורים/ציטוט)
      console.log('[diag][msgData] %s', JSON.stringify(md));
    } catch (_) {}
    await getDispatcher().onEvent(evt);
  } catch (e) {
    // מחזירים 200 כדי ש-Green API לא יציף בניסיונות חוזרים; שגיאות ללוג.
    console.error('[webhook] שגיאה:', e && e.message);
  }
  res.status(200).json({ ok: true });
};
