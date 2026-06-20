'use strict';

/**
 * חיבור ל-Green API (וואטסאפ).
 * -------------------------------------------------------------
 * עוטף את ה-REST API של Green API: שליחת הודעות, קריאת התראות,
 * עדכון הגדרות (webhook + הפעלת התראות יוצאות), ופירוק התראות נכנסות.
 *
 * הרשאות / סודות מגיעים ממשתני סביבה בלבד — שום מפתח לא נשמר בקוד:
 *   GREENAPI_ID_INSTANCE   (ברירת מחדל: 7107658538)
 *   GREENAPI_API_TOKEN     (חובה — מוזרק כסוד)
 *   GREENAPI_API_URL       (אופציונלי — נגזר אוטומטית מה-idInstance)
 */

const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE || '7107658538';
const API_TOKEN = process.env.GREENAPI_API_TOKEN || '';
// Green API מנתב לפי קידומת ה-instance (למשל 7107 -> 7107.api.greenapi.com).
const API_URL =
  process.env.GREENAPI_API_URL ||
  `https://${ID_INSTANCE.slice(0, 4)}.api.greenapi.com`;

function ensureToken() {
  if (!API_TOKEN) {
    throw new Error(
      'חסר GREENAPI_API_TOKEN — הגדירו את הסוד במשתני הסביבה לפני הפעלה מול Green API.'
    );
  }
}

function methodUrl(method) {
  return `${API_URL}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN}`;
}

async function callApi(method, { httpMethod = 'POST', body, pathSuffix = '' } = {}) {
  ensureToken();
  const url = methodUrl(method) + (pathSuffix ? `/${pathSuffix}` : '');
  const opts = { method: httpMethod, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Green API ${method} נכשל (${res.status}): ${text}`);
  }
  return data;
}

// ── שליחה ──
async function sendMessage(chatId, message) {
  return callApi('sendMessage', { body: { chatId, message } });
}

// ── הגדרות החיבור (כולל הפעלת התראות יוצאות + webhook) ──
async function getSettings() {
  return callApi('getSettings', { httpMethod: 'GET' });
}

async function setSettings(settings) {
  return callApi('setSettings', { body: settings });
}

// ── קריאת התראות בשיטת polling (לעובד הרץ 24/7) ──
async function receiveNotification() {
  // מחזיר { receiptId, body } או null כשאין התראות.
  return callApi('receiveNotification', { httpMethod: 'GET' });
}

async function deleteNotification(receiptId) {
  return callApi('deleteNotification', {
    httpMethod: 'DELETE',
    pathSuffix: String(receiptId),
  });
}

// ── פירוק התראה נכנסת (webhook או polling) לאירוע אחיד ──
function extractText(messageData) {
  if (!messageData) return '';
  const td = messageData.textMessageData;
  if (td && typeof td.textMessage === 'string') return td.textMessage;
  const ext = messageData.extendedTextMessageData;
  if (ext && typeof ext.text === 'string') return ext.text;
  return '';
}

/**
 * @param {object} body גוף ההתראה מ-Green API.
 * @returns {object} אירוע אחיד:
 *   { kind:'message', direction:'incoming'|'outgoing', viaApi:boolean,
 *     chatId, senderName, text, raw }  או  { kind:'other', type, raw }
 */
function normalize(body) {
  if (!body || typeof body !== 'object') return { kind: 'other', type: null, raw: body };
  const type = body.typeWebhook;

  const MESSAGE_TYPES = {
    incomingMessageReceived: { direction: 'incoming', viaApi: false },
    outgoingMessageReceived: { direction: 'outgoing', viaApi: false }, // נשלח מהמכשיר של שרון
    outgoingAPIMessageReceived: { direction: 'outgoing', viaApi: true }, // נשלח ע"י הבוט עצמו
  };

  const meta = MESSAGE_TYPES[type];
  if (meta) {
    const senderData = body.senderData || {};
    return {
      kind: 'message',
      direction: meta.direction,
      viaApi: meta.viaApi,
      chatId: senderData.chatId || null,
      senderName: senderData.senderName || senderData.chatName || null,
      instanceWid: (body.instanceData && body.instanceData.wid) || null,
      text: extractText(body.messageData),
      raw: body,
    };
  }
  return { kind: 'other', type: type || null, raw: body };
}

module.exports = {
  ID_INSTANCE,
  API_URL,
  hasToken: () => !!API_TOKEN,
  sendMessage,
  getSettings,
  setSettings,
  receiveNotification,
  deleteNotification,
  normalize,
};
