'use strict';

/**
 * הגדרת חיבור Green API — הפעלת התראות נכנסות *ויוצאות* + webhook.
 * חובה: התראות יוצאות (outgoingMessageWebhook) דרושות לזיהוי המילה "בוט"
 * שנשלחת מהמכשיר של שרון.
 *
 * דורש GREENAPI_API_TOKEN במשתני הסביבה.
 *
 * שימוש:
 *   # מצב webhook (Vercel וכד'):
 *   node scripts/setup-greenapi.js --mode webhook --url https://<your-app>/api/webhook
 *
 *   # מצב polling (עובד רץ 24/7):
 *   node scripts/setup-greenapi.js --mode poll
 *
 *   # בדיקת ההגדרות הנוכחיות בלבד:
 *   node scripts/setup-greenapi.js --show
 */

const greenapi = require('../src/integrations/greenapi');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(name);

async function main() {
  if (has('--show')) {
    const s = await greenapi.getSettings();
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  const mode = arg('--mode') || 'webhook';
  const url = arg('--url') || process.env.WEBHOOK_URL || '';

  // ההגדרות המשותפות: מפעילים נכנסות + יוצאות-מהמכשיר, ומכבים יוצאות-API
  // (כדי שהבוט לא יקבל חזרה את ההודעות ששלח בעצמו).
  const settings = {
    incomingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'no',
    stateWebhook: 'no',
    deviceWebhook: 'no',
    markIncomingMessagesReaded: 'no',
  };

  if (mode === 'webhook') {
    if (!url) {
      console.error('חסר --url לכתובת ה-webhook (למשל https://<app>/api/webhook)');
      process.exit(1);
    }
    settings.webhookUrl = url;
  } else if (mode === 'poll') {
    // ללא webhookUrl — ההתראות נצברות בתור ונקראות ע"י העובד.
    settings.webhookUrl = '';
  }

  console.log('מעדכן הגדרות Green API:', JSON.stringify(settings, null, 2));
  const res = await greenapi.setSettings(settings);
  console.log('תשובת השרת:', JSON.stringify(res));
  console.log('בודק הגדרות לאחר העדכון...');
  const after = await greenapi.getSettings();
  console.log(JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error('שגיאה:', e.message);
  process.exit(1);
});
