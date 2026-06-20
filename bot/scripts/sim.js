'use strict';

/**
 * סימולטור מקומי של אירועי Green API — בלי רשת ובלי מפתחות.
 * בודק את לוגיקת ההפעלה הידנית מקצה לקצה: מדמה הודעות יוצאות מהמכשיר
 * של שרון ("בוט" / "סיום") והודעות נכנסות מלקוח, ומדפיס מה הבוט שולח.
 *
 * הרצה:  npm run sim
 */

const { Dispatcher } = require('../src/dispatcher');
const { Brain } = require('../src/brain');
const { MockCalendar } = require('../src/calendar');
const { notifySharon } = require('../src/integrations/notify');

const CUSTOMER = '972500000001@c.us';

// greenapi מזויף — רק רושם/מדפיס מה היה נשלח ללקוח.
function fakeGreen() {
  return {
    async sendMessage(chatId, message) {
      console.log(`\n🤖 בוט → ${chatId}:\n${message}`);
    },
  };
}

// בונה אירוע "יוצא מהמכשיר של שרון".
const fromSharon = (chatId, text) => ({
  kind: 'message',
  direction: 'outgoing',
  viaApi: false,
  chatId,
  text,
});
// בונה אירוע "נכנס מלקוח".
const fromCustomer = (chatId, text) => ({
  kind: 'message',
  direction: 'incoming',
  viaApi: false,
  chatId,
  text,
});
// הודעה שהבוט עצמו שלח (אמורה להיות מסוננת).
const fromBotApi = (chatId, text) => ({
  kind: 'message',
  direction: 'outgoing',
  viaApi: true,
  chatId,
  text,
});

async function run() {
  const makeBrain = () =>
    new Brain({ calendar: new MockCalendar(new Date('2026-06-21T00:00:00')), notify: notifySharon });
  const dispatcher = new Dispatcher({
    greenapi: fakeGreen(),
    makeBrain,
    autoReplyAll: false,
    logger: { log: (m) => console.log('· ' + m), error: console.error },
  });

  const show = (label) => console.log(`\n──────── ${label} ────────`);

  show('1) לקוח כותב לפני הפעלה — הבוט שותק');
  console.log('🧑 לקוח: שלום, אפשר פרטים?');
  await dispatcher.onEvent(fromCustomer(CUSTOMER, 'שלום, אפשר פרטים?'));
  console.log('(אין תגובה מהבוט — כצפוי)');

  show('2) שרון שולח "בוט" מהמכשיר שלו — הבוט נכנס ומברך');
  console.log('📱 שרון (מהמכשיר): בוט');
  await dispatcher.onEvent(fromSharon(CUSTOMER, 'בוט'));

  show('3) הודעה שהבוט עצמו שלח (outgoingAPIMessageReceived) — מסוננת');
  await dispatcher.onEvent(fromBotApi(CUSTOMER, 'שלום, וברוכים הבאים...'));
  console.log('(אין לולאה — כצפוי)');

  show('4) הלקוח עונה — הבוט מנהל את השיחה');
  // אדם אחד · סטודיו · סטנדרט · מועד ראשון · ואז פרטי קשר
  const inputs = ['1', '1', '2', '1', 'דנה כהן', '052-1234567', 'dana@example.com'];
  for (const msg of inputs) {
    console.log('🧑 לקוח: ' + msg);
    await dispatcher.onEvent(fromCustomer(CUSTOMER, msg));
  }

  show('5) שרון שולח "סיום" — השליטה חוזרת אליו');
  console.log('📱 שרון (מהמכשיר): סיום');
  await dispatcher.onEvent(fromSharon(CUSTOMER, 'סיום'));
  console.log('🧑 לקוח: עוד שאלה?');
  await dispatcher.onEvent(fromCustomer(CUSTOMER, 'עוד שאלה?'));
  console.log('(הבוט שקט שוב — כצפוי)');

  console.log('\n✅ סוף הסימולציה.');
}

run();
