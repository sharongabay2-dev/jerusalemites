'use strict';

/**
 * עובד רץ 24/7 בשיטת polling (חלופה ל-webhook).
 * מתאים לאירוח על שירות שמריץ תהליך מתמשך (Render Worker / Railway /
 * Fly.io / VPS / Docker). שומר מצב שיחה בזיכרון — פשוט ואמין.
 *
 * הרצה:  npm run worker   (דורש GREENAPI_API_TOKEN)
 *
 * לשימוש בעובד הזה אין צורך ב-webhookUrl; יש לוודא שהתראות מופעלות
 * (ראו scripts/setup-greenapi.js עם --mode poll).
 */

const { getDispatcher, greenapi } = require('./runtime');

let running = true;

async function loop() {
  const dispatcher = getDispatcher();
  console.log(
    `[worker] התחיל. instance=${greenapi.ID_INSTANCE} ` +
      `token=${greenapi.hasToken() ? 'מוגדר' : 'חסר!'}`
  );

  while (running) {
    let note;
    try {
      note = await greenapi.receiveNotification();
    } catch (e) {
      console.error('[worker] receiveNotification נכשל:', e.message);
      await sleep(3000);
      continue;
    }

    if (!note) continue; // אין התראות — long-poll החזיר ריק, ממשיכים.

    try {
      const evt = greenapi.normalize(note.body);
      await dispatcher.onEvent(evt);
    } catch (e) {
      console.error('[worker] טיפול בהתראה נכשל:', e.message);
    } finally {
      try {
        await greenapi.deleteNotification(note.receiptId);
      } catch (e) {
        console.error('[worker] deleteNotification נכשל:', e.message);
      }
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

process.on('SIGTERM', () => {
  running = false;
});
process.on('SIGINT', () => {
  running = false;
  process.exit(0);
});

loop().catch((e) => {
  console.error('[worker] קריסה:', e);
  process.exit(1);
});
