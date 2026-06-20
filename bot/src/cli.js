'use strict';

/**
 * מצב בדיקה מקומי — שיחה מלאה עם הבוט בטרמינל.
 * הרצה:  npm run bot   (או: node src/cli.js)
 *
 * זהו תחליף הבדיקה לערוץ הוואטסאפ: אותו "מוח" בדיוק (Brain),
 * רק שהקלט/פלט עוברים דרך הטרמינל במקום דרך וואטסאפ.
 */

const readline = require('readline');
const { Brain } = require('./brain');
const { MockCalendar } = require('./calendar');
const { notifySharon } = require('./integrations/notify');

function printBot(lines) {
  for (const line of lines) {
    console.log('\n🤖 בוט:\n' + line + '\n');
  }
}

function main() {
  // ניתן לקבע "היום" עבור הדגמה דטרמיניסטית: BOT_TODAY=2026-06-21
  const todayEnv = process.env.BOT_TODAY;
  const baseDate = todayEnv ? new Date(todayEnv + 'T00:00:00') : new Date();

  const calendar = new MockCalendar(baseDate);
  const brain = new Brain({ calendar, notify: notifySharon });

  console.log('==================================================');
  console.log(' מצב בדיקה — בוט הצילום של שרון גבאי (טרמינל)');
  console.log(` יום הבסיס לחישוב מועדים: ${baseDate.toISOString().slice(0, 10)}`);
  console.log(' הקלידו "יציאה" כדי לסיים.');
  console.log('==================================================');

  printBot(brain.start());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '🧑 אתם: ',
  });
  rl.prompt();

  rl.on('line', (line) => {
    const text = line.trim();
    if (['יציאה', 'exit', 'quit', 'q'].includes(text.toLowerCase())) {
      console.log('\nלהתראות! 👋');
      rl.close();
      return;
    }

    printBot(brain.receive(text));

    if (brain.isDone()) {
      console.log('\n— השיחה הסתיימה. הקלידו "יציאה" לסגירה, או המשיכו לכתוב. —\n');
    }
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
