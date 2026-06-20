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
const { createStore } = require('./store');

function makeBrain() {
  const calendar = new MockCalendar(new Date());
  return new Brain({ calendar, notify: notifySharon });
}

const store = createStore();

let dispatcher = null;
function getDispatcher() {
  if (!dispatcher) {
    dispatcher = new Dispatcher({ greenapi, makeBrain, store });
  }
  return dispatcher;
}

module.exports = { getDispatcher, greenapi, makeBrain, store };
