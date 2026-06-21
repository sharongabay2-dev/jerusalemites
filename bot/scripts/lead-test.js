'use strict';

/**
 * בדיקת "ליד חדש" — מדמה הודעת וואטסאפ נכנסת מלקוח חדש דרך כל הלוגיקה
 * של הבוט (Dispatcher + Brain + יומן אמיתי), בלי טלפון ובלי שליחה אמיתית.
 * מדפיס בדיוק מה הבוט היה משיב, כולל כפתורים/רשימות.
 *
 * הרצה:  npm run lead-test
 */

const { Dispatcher } = require('../src/dispatcher');
const { Brain } = require('../src/brain');
const { createCalendar } = require('../src/calendar-factory');

const LEAD = '972539999999@c.us'; // מספר דמה של ליד חדש

// Green API מזויף — לא שולח כלום, רק מדפיס ורושם מה היה נשלח.
function recorder() {
  const sent = [];
  const print = (label, chatId, text, extra) => {
    console.log(`\n🤖 הבוט משיב ל-${chatId}:\n${text}${extra || ''}`);
  };
  return {
    sent,
    api: {
      async sendMessage(chatId, message) {
        sent.push({ type: 'text', message });
        print('text', chatId, message);
      },
      async sendButtons(chatId, body, buttons) {
        sent.push({ type: 'buttons', message: body, buttons });
        print('buttons', chatId, body, '\n   🔘 כפתורים: ' + buttons.map((b) => b.title).join(' | '));
      },
      async sendList(chatId, body, rows) {
        sent.push({ type: 'list', message: body, list: rows });
        print('list', chatId, body, '\n   📋 רשימה: ' + rows.map((r) => r.title).join(' | '));
      },
    },
  };
}

const incoming = (text) => ({ kind: 'message', direction: 'incoming', viaApi: false, chatId: LEAD, text });
const fromSharon = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: false, chatId: LEAD, text });

async function main() {
  const calendar = createCalendar();
  const leadAlerts = [];
  const makeBrain = () => new Brain({ calendar, notify: (l) => leadAlerts.push(l) });

  const rec = recorder();
  const dispatcher = new Dispatcher({
    greenapi: rec.api,
    makeBrain,
    logger: { log: () => {}, error: (m) => console.log('שגיאה: ' + m) },
  });

  console.log('==================================================');
  console.log(' בדיקת ליד חדש — סימולציה מלאה (בלי שליחה אמיתית)');
  console.log(` יומן בשימוש: ${calendar.backend === 'google' ? 'גוגל (אמיתי)' : 'בדיקה (מקומי)'}`);
  console.log('==================================================');

  // 1) ליד חדש שולח הודעה ראשונה — במצב ידני הבוט שותק עד ששרון מפעיל.
  console.log('\n🧑 ליד חדש: "היי, ראיתי את המודעה. אפשר פרטים על צילומי תדמית?"');
  await dispatcher.onEvent(incoming('היי, ראיתי את המודעה. אפשר פרטים על צילומי תדמית?'));
  if (rec.sent.length === 0) console.log('   (הבוט שותק — כצפוי במצב ידני, עד ש"שרון" שולח "בוט")');

  // 2) שרון מפעיל את הבוט בשיחה הזו.
  console.log('\n📱 שרון (מהמכשיר שלו): "בוט"');
  await dispatcher.onEvent(fromSharon('בוט'));

  // 3) הליד מתקדם בלחיצות (1=אדם אחד, 1=סטודיו, 2=סטנדרט) עד הצגת מועדים מהיומן.
  for (const tap of ['1', '1', '2']) {
    console.log(`\n🧑 ליד (לחיצה): "${tap}"`);
    await dispatcher.onEvent(incoming(tap));
  }

  // ── סיכום בדיקה ──
  console.log('\n\n================= סיכום הבדיקה =================');
  const greeting = rec.sent.find((m) => /שלום ותודה שפנית/.test(m.message));
  const slotsMsg = rec.sent.find((m) => /המועדים הפנויים הקרובים/.test(m.message));

  const checks = [];
  checks.push(['הבוט שותק לליד לפני הפעלה ידנית', rec.sent.indexOf(greeting) === 0]);
  checks.push(['הפתיחה נשלחה עם 3 כפתורים', !!greeting && greeting.type === 'buttons' && greeting.buttons.length === 3]);
  checks.push(['הוצגו מועדים פנויים מהיומן', !!slotsMsg]);

  let slotCount = 0;
  if (slotsMsg) slotCount = slotsMsg.type === 'list' ? slotsMsg.list.length : (slotsMsg.buttons || []).length;
  checks.push(['היומן החזיר לפחות מועד אחד', slotCount > 0]);

  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) allOk = false;
  }
  console.log(`\nיומן: ${calendar.backend}  |  מועדים שהוצעו: ${slotCount}`);
  console.log(allOk ? '\n✅ הבוט עונה נכון.' : '\n❌ יש בעיה — ראו לעיל.');
  if (!allOk) process.exitCode = 1;
}

main();
