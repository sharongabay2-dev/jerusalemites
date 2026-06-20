'use strict';

/**
 * חיווט משותף לזמן ריצה: בונה Dispatcher יחיד (singleton) עם החיבורים
 * האמיתיים. משמש גם את ה-webhook (Vercel) וגם את העובד הרץ (polling).
 *
 * שימו לב: בשלב זה היומן הוא MockCalendar (בדיקה מדומה) וההתראה לשרון
 * מודפסת ללוג. יומן גוגל ומפתח קלוד יחוברו בנפרד בהמשך — ראו integrations/.
 */

const greenapi = require('./integrations/greenapi');
const { Dispatcher } = require('./dispatcher');
const { Brain } = require('./brain');
const { MockCalendar } = require('./calendar');
const { notifySharon } = require('./integrations/notify');

function makeBrain() {
  const calendar = new MockCalendar(new Date());
  return new Brain({ calendar, notify: notifySharon });
}

let dispatcher = null;
function getDispatcher() {
  if (!dispatcher) {
    dispatcher = new Dispatcher({ greenapi, makeBrain });
  }
  return dispatcher;
}

module.exports = { getDispatcher, greenapi, makeBrain };
