'use strict';

/**
 * הדגמה אוטומטית — מריצה תרחישי שיחה מלאים לפי הזרימה החדשה,
 * כדי לראות שהבוט שואל, מתמחר ומדמה קביעת מועד נכון.
 * הרצה:  npm run demo
 */

const { Brain } = require('./brain');
const { MockCalendar } = require('./calendar');
const { notifySharon } = require('./integrations/notify');

const BASE_DATE = new Date('2026-06-21T00:00:00'); // ראשון

async function runScenario(title, userInputs) {
  console.log('\n\n##################################################');
  console.log('# תרחיש: ' + title);
  console.log('##################################################');

  const brain = new Brain({ calendar: new MockCalendar(BASE_DATE), notify: notifySharon });
  const show = (lines) =>
    lines.forEach((l) => {
      const text = typeof l === 'string' ? l : l.text;
      let extra = '';
      if (l && l.buttons) extra = '\n   [כפתורים: ' + l.buttons.map((b) => b.title).join(' | ') + ']';
      if (l && l.list) extra = '\n   [רשימה: ' + l.list.rows.map((r) => r.title).join(' | ') + ']';
      console.log('\n🤖 ' + text + extra + '\n');
    });

  show(brain.start());
  for (const input of userInputs) {
    console.log('🧑 ' + input);
    show(await brain.receive(input));
  }
}

(async () => {
  // 1) אדם אחד · סטודיו · סטנדרט · קביעת מועד
  await runScenario('אדם אחד · סטודיו · סטנדרט', [
    '1', // אדם אחד
    '1', // בסטודיו
    '2', // סטנדרט
    '1', // מועד ראשון
    'דנה כהן',
    '052-1234567',
    'dana@example.com',
  ]);

  // 2) אדם אחד · בית העסק · פרימיום · יום מלא + כתובת
  await runScenario('אדם אחד · בית העסק · פרימיום', [
    '1', // אדם אחד
    '2', // בבית העסק
    '3', // פרימיום
    '1', // יום ראשון פנוי
    'יוסי לוי',
    '0501112233',
    'yossi@example.com',
    'הרצל 10, תל אביב',
  ]);

  // 3) מספר עובדים · 11–20 · תמחור -> המשך -> יום מלא
  await runScenario('מספר עובדים · 11–20', [
    '2', // מספר עובדים
    '3', // 11 עד 20 -> 550 לעובד
    '1', // כן, נתקדם
    '1', // יום פנוי
    'מיכל כהן',
    '0521119999',
    'michal@example.com',
    'ויצמן 5, רעננה',
  ]);

  // 4) מספר עובדים · מעל 40 · הצעה אישית (שם+טלפון)
  await runScenario('מספר עובדים · מעל 40', [
    '2', // מספר עובדים
    '5', // מעל 40
    'רונית מנהלת',
    '0539998888',
  ]);

  // 5) תיק עבודות (אפשרות 3) -> חזרה לפתיחה -> אדם אחד
  await runScenario('תיק עבודות וחזרה לפתיחה', [
    '3', // קישורים + חזרה לפתיחה
    '1', // אדם אחד
    '1', // סטודיו
    '2', // סטנדרט
    '1', // מועד
    'דן',
    '0500000000',
    'dan@example.com',
  ]);

  console.log('\n\n✅ סוף ההדגמה.');
})();
