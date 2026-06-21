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
 *
 * אם אין משתני סביבה (למשל פריסת Vercel ללא תמיכה בהזרקת סוד), נקרא גיבוי
 * מקובץ מקומי `src/config/secret.local.js` שאינו נכנס ל-git אך נארז עם הפריסה.
 */

// גיבוי סוד מקובץ מקומי (require סטטי כדי שמנגנון האריזה של Vercel יכלול אותו).
let _fileSecret = {};
try {
  _fileSecret = require('../config/secret.local');
} catch (_) {
  _fileSecret = {};
}
function readSecret(key) {
  return _fileSecret && _fileSecret[key] ? _fileSecret[key] : '';
}

const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE || readSecret('GREENAPI_ID_INSTANCE') || '7107658538';
const API_TOKEN = process.env.GREENAPI_API_TOKEN || readSecret('GREENAPI_API_TOKEN') || '';
// Green API מנתב לפי קידומת ה-instance (למשל 7107 -> 7107.api.greenapi.com).
const API_URL =
  process.env.GREENAPI_API_URL ||
  readSecret('GREENAPI_API_URL') ||
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

async function callApi(method, { httpMethod = 'POST', body, pathSuffix = '', query } = {}) {
  ensureToken();
  let url = methodUrl(method) + (pathSuffix ? `/${pathSuffix}` : '');
  if (query) url += '?' + new URLSearchParams(query).toString();
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

/**
 * שליחת הודעת כפתורים אינטראקטיביים (עד 3 כפתורים).
 * @param {string} chatId
 * @param {string} body טקסט השאלה (כולל אפשרויות ממוספרות כגיבוי).
 * @param {Array<{id:string,title:string}>} buttons
 */
async function sendButtons(chatId, body, buttons) {
  const payload = {
    chatId,
    body,
    buttons: buttons.slice(0, 3).map((b) => ({
      buttonId: String(b.id),
      buttonText: String(b.title).slice(0, 25),
    })),
  };
  return callApi('sendInteractiveButtonsReply', { body: payload });
}

/**
 * שליחת רשימה אינטראקטיבית (ליותר מ-3 אפשרויות).
 * @param {string} chatId
 * @param {string} body טקסט השאלה (כולל אפשרויות ממוספרות כגיבוי).
 * @param {Array<{id:string,title:string,description?:string}>} rows
 * @param {object} [opts] { buttonText, title }
 */
async function sendList(chatId, body, rows, opts = {}) {
  const payload = {
    chatId,
    message: body,
    buttonText: (opts.buttonText || 'בחירה').slice(0, 20),
    title: opts.title || '',
    sections: [
      {
        title: opts.title || ' ',
        rows: rows.map((r) => ({
          rowId: String(r.id),
          title: String(r.title).slice(0, 24),
          description: r.description ? String(r.description) : '',
        })),
      },
    ],
  };
  const method = process.env.GREENAPI_LIST_METHOD || 'sendListMessage';
  return callApi(method, { body: payload });
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

// ── רשימת ההודעות הנכנסות האחרונות (לדף השליטה) ──
async function lastIncomingMessages(minutes = 1440) {
  return callApi('lastIncomingMessages', { httpMethod: 'GET', query: { minutes } });
}

// ── פרטי איש קשר (שם שמור בוואטסאפ) ──
async function getContactInfo(chatId) {
  return callApi('getContactInfo', { body: { chatId } });
}

// ── פירוק התראה נכנסת (webhook או polling) לאירוע אחיד ──

// מחלץ את הטקסט/בחירה מכל סוגי ההודעות (טקסט, כפתורים, רשימה, תבנית, אינטראקטיבי).
function extractText(messageData) {
  if (!messageData || typeof messageData !== 'object') return '';
  const md = messageData;

  // טקסט רגיל
  if (md.textMessageData && typeof md.textMessageData.textMessage === 'string' && md.textMessageData.textMessage.trim()) {
    return md.textMessageData.textMessage.trim();
  }
  if (md.extendedTextMessageData && typeof md.extendedTextMessageData.text === 'string' && md.extendedTextMessageData.text.trim()) {
    return md.extendedTextMessageData.text.trim();
  }

  // תשובות אינטראקטיביות — מזהה הבחירה (id) או התווית (title) שנבחרה.
  const lrm = md.listResponseMessage || {};
  const containers = [
    md.buttonsResponseMessage,
    md.templateButtonReplyMessage,
    md.interactiveButtonsReply,
    md.interactiveButtonsReplyMessage,
    md.interactiveButtons,
    lrm,
    lrm.singleSelectReply, // ברשימה ה-rowId לעיתים מקונן כאן
  ];
  for (const c of containers) {
    if (!c || typeof c !== 'object') continue;
    const id = c.selectedButtonId || c.selectedId || c.buttonId || c.selectedRowId || c.rowId || c.id;
    if (id != null && String(id).trim() !== '') return String(id).trim();
    const title = c.title || c.selectedDisplayText || c.selectedButtonText || c.text;
    if (title != null && String(title).trim() !== '') return String(title).trim();
  }
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
    const md = body.messageData || {};
    const text = extractText(md) || (typeof body.text === 'string' ? body.text.trim() : '');
    return {
      kind: 'message',
      direction: meta.direction,
      viaApi: meta.viaApi,
      chatId: senderData.chatId || null,
      senderName: senderData.senderName || senderData.chatName || null,
      sender: senderData.sender || null,
      typeMessage: md.typeMessage || null,
      instanceWid: (body.instanceData && body.instanceData.wid) || null,
      text,
      raw: body,
    };
  }
  return { kind: 'other', type: type || null, raw: body };
}

module.exports = {
  ID_INSTANCE,
  API_URL,
  hasToken: () => !!API_TOKEN,
  matchesToken: (k) => !!API_TOKEN && k === API_TOKEN,
  sendMessage,
  sendButtons,
  sendList,
  getSettings,
  setSettings,
  receiveNotification,
  deleteNotification,
  lastIncomingMessages,
  getContactInfo,
  normalize,
};
