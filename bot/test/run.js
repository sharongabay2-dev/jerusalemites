'use strict';

/**
 * בדיקות אוטומטיות (בלי תלויות) — תמחור, זמינות, הזרימה הסופית,
 * הפעלה ידנית, כפתורים/רשימות, מעבר למענה אנושי, ואחסון מתמיד.
 * הרצה:  npm test
 */

const assert = require('assert');
const { Brain } = require('../src/brain');
const { MockCalendar } = require('../src/calendar');
const { Dispatcher } = require('../src/dispatcher');
const { MemoryStore } = require('../src/store');
const { getTier, getTeamBracket, TEAM } = require('../src/config/pricing');
const { studioSlotsForDay, windowIsFree } = require('../src/scheduling');
const {
  WINDOW_START_MIN, WINDOW_END_MIN, STUDIO_DURATION_MIN, isWorkingDay,
} = require('../src/config/availability');

const BASE = new Date('2026-06-21T00:00:00'); // ראשון
let passed = 0;
const _tests = [];
function test(name, fn) { _tests.push({ name, fn }); }

function toText(reply) {
  return reply.map((r) => (typeof r === 'string' ? r : r.text)).join('\n');
}
function newBrain(leads) {
  const notify = leads ? (l) => leads.push(JSON.parse(JSON.stringify(l))) : () => {};
  return new Brain({ calendar: new MockCalendar(BASE), notify });
}
async function play(brain, inputs) {
  let last = brain.start();
  for (const i of inputs) last = await brain.receive(i);
  return toText(last);
}

console.log('בדיקות:');

// ── תמחור ──
test('מחירי סטודיו', () => {
  assert.strictEqual(getTier('studio', 'base').price, 1250);
  assert.strictEqual(getTier('studio', 'standard').price, 1850);
  assert.strictEqual(getTier('studio', 'premium').price, 2600);
});
test('מחירי בית העסק', () => {
  assert.strictEqual(getTier('onsite', 'base').price, 2600);
  assert.strictEqual(getTier('onsite', 'standard').price, 3400);
  assert.strictEqual(getTier('onsite', 'premium').price, 4200);
});
test('מדרגות צוות', () => {
  assert.strictEqual(TEAM.arrivalFee, 1500);
  assert.strictEqual(getTeamBracket('b5').perPerson, 790);
  assert.strictEqual(getTeamBracket('b20').perPerson, 550);
  assert.strictEqual(getTeamBracket('b40').perPerson, 450);
  assert.strictEqual(getTeamBracket('b41').perPerson, null);
});

// ── זמינות ──
test('משבצות סטודיו: חלון, משך, ללא חפיפה, רווח 30', () => {
  const slots = studioSlotsForDay(BASE, 'standard', [{ startMin: 600, endMin: 660 }]);
  for (const s of slots) {
    assert.ok(s.startMin >= WINDOW_START_MIN && s.endMin <= WINDOW_END_MIN);
    assert.strictEqual(s.endMin - s.startMin, STUDIO_DURATION_MIN.standard);
  }
  assert.strictEqual(slots[0].startMin, 11 * 60 + 30, 'ראשונה 11:30 (רווח מהאירוע)');
});
test('windowIsFree', () => {
  assert.strictEqual(windowIsFree([]), true);
  assert.strictEqual(windowIsFree([{ startMin: 0, endMin: 1440 }]), false);
});
test('proposeOnsiteDays — ימי עבודה פנויים', async () => {
  const cal = new MockCalendar(BASE);
  const days = await cal.proposeOnsiteDays('base', { limit: 5 });
  for (const d of days) { assert.ok(isWorkingDay(d.date)); assert.ok(d.fullDay); }
});

// ── זרימה: אדם אחד · סטודיו · סטנדרט ──
test('אדם אחד · סטודיו · סטנדרט', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['1', '1', '2', '1', 'דנה', '0521234567', 'dana@x.com']);
  assert.ok(brain.isDone());
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 1850);
  assert.strictEqual(lead.location, 'studio');
  assert.ok(lead.booking && !lead.booking.fullDay);
  assert.ok(/הבקשה נקלטה בהצלחה/.test(reply));
  assert.ok(/במסלול סטנדרט/.test(reply));
  assert.ok(/כליל החורש/.test(reply));
});

// ── אדם אחד · בית העסק · פרימיום ──
test('אדם אחד · בית העסק · פרימיום (יום מלא + כתובת)', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['1', '2', '3', '1', 'יוסי', '0501112233', 'y@x.com', 'הרצל 10, תל אביב']);
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 4200);
  assert.strictEqual(lead.address, 'הרצל 10, תל אביב');
  assert.ok(lead.booking.fullDay);
  assert.ok(/הרצל 10, תל אביב/.test(reply));
  assert.ok(/יום מלא/.test(reply));
});

// ── תיק עבודות (אפשרות 3) חוזר לפתיחה ──
test('אפשרות 3 שולחת קישורים וחוזרת לפתיחה', async () => {
  const brain = newBrain();
  brain.start();
  const r = await brain.receive('3');
  const txt = toText(r);
  assert.ok(/פורטפוליו:/.test(txt) && /ביקורות:/.test(txt));
  assert.ok(/עבור מי מיועדים הצילומים/.test(txt), 'חוזר לשאלת הפתיחה');
  assert.strictEqual(brain.step, 'audience');
});

// ── מספר עובדים · 11–20 · המשך לקביעה ──
test('צוות 11–20 -> מחיר -> המשך -> קביעת יום מלא', async () => {
  const leads = [];
  const brain = newBrain(leads);
  // 2=צוות, 3=11–20, 1=כן נתקדם, 1=יום, ואז פרטים מלאים
  const reply = await play(brain, ['2', '3', '1', '1', 'מיכל', '0521119999', 'm@x.com', 'ויצמן 5, רעננה']);
  const lead = leads[0];
  assert.strictEqual(lead.audience, 'team');
  assert.strictEqual(lead.team.perPerson, 550);
  assert.ok(lead.booking.fullDay);
  assert.ok(/צוות \(11 עד 20 עובדים\)/.test(reply));
  assert.ok(/ויצמן 5, רעננה/.test(reply));
});

// ── מספר עובדים · "שרון יחזור אליי" (איסוף שם+טלפון בלבד) ──
test('צוות -> בקשת חזרה -> שם+טלפון בלבד, ללא קביעה', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['2', '3', '2', 'מיכל', '0521119999']);
  assert.ok(brain.isDone());
  const lead = leads[0];
  assert.ok(!lead.booking, 'אין קביעת מועד');
  assert.strictEqual(lead.email, null, 'לא נאסף אימייל');
  assert.ok(/העברתי את הפרטים/.test(reply));
});

// ── מספר עובדים · מעל 40 ──
test('צוות מעל 40 -> הצעה אישית, איסוף שם+טלפון', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['2', '5', 'רונית', '0539998888']);
  assert.ok(brain.isDone());
  assert.strictEqual(leads[0].team.perPerson, null);
  assert.ok(!leads[0].booking);
  assert.ok(/מעל 40/.test(leads[0].outcome));
  assert.ok(/העברתי את הפרטים/.test(reply));
});

// ── הפעלה ידנית (Dispatcher) ──
function makeDispatcher(autoReplyAll = false, store) {
  const sent = [];
  const greenapi = {
    sendMessage: async (chatId, message) => sent.push({ chatId, message }),
    sendButtons: async (chatId, message, buttons) => sent.push({ chatId, message, buttons }),
    sendList: async (chatId, message, rows) => sent.push({ chatId, message, list: rows }),
  };
  const makeBrain = () => new Brain({ calendar: new MockCalendar(BASE), notify: () => {} });
  const d = new Dispatcher({ greenapi, makeBrain, store, autoReplyAll, logger: { log() {}, error() {} } });
  return { d, sent };
}
const CHAT = '972500000001@c.us';
const inc = (text) => ({ kind: 'message', direction: 'incoming', viaApi: false, chatId: CHAT, text });
const out = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: false, chatId: CHAT, text });
const botApi = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: true, chatId: CHAT, text });
const last = (sent) => sent[sent.length - 1];

test('ברירת מחדל: הבוט שותק', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('שלום'));
  assert.strictEqual(sent.length, 0);
});
test('"בוט" מפעיל ומברך עם 3 כפתורים', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  assert.ok(/שלום ותודה שפנית/.test(sent[0].message));
  assert.ok(Array.isArray(sent[0].buttons) && sent[0].buttons.length === 3);
});
test('הודעת לקוח "בוט" אינה מפעילה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('בוט'));
  assert.strictEqual(sent.length, 0);
});
test('הודעות API של הבוט מסוננות', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  const before = sent.length;
  await d.onEvent(botApi('...'));
  assert.strictEqual(sent.length, before);
});
test('שאלת מספר עובדים נשלחת כרשימה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('2')); // מספר עובדים
  assert.ok(/כמה אנשי צוות/.test(last(sent).message));
  assert.ok(Array.isArray(last(sent).list) && last(sent).list.length === 5, 'רשימה עם 5 שורות');
});
test('לחיצת כפתור (buttonId) = הקלדת מספר', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('1')); // אדם אחד -> מיקום
  assert.ok(/איפה תעדיפו/.test(last(sent).message));
});
test('"סיום" מחזיר שליטה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(out('סיום'));
  const before = sent.length;
  await d.onEvent(inc('1'));
  assert.strictEqual(sent.length, before);
});
test('לקוח שכותב "נציג" -> מענה אנושי והבוט מפסיק', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('נציג'));
  assert.ok(/אעביר את פנייתכם לשרון/.test(last(sent).message));
  const before = sent.length;
  await d.onEvent(inc('1')); // אחרי מענה אנושי הבוט שותק
  assert.strictEqual(sent.length, before);
});
test('"שרון כהן" (לא מילה בודדת) אינו מפעיל מענה אנושי', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('1')); // מיקום
  const before = sent.length;
  await d.onEvent(inc('שרון כהן')); // לא תואם בדיוק -> מטופל כקלט רגיל (לא מובן)
  assert.ok(sent.length > before, 'הבוט הגיב (לא מענה אנושי)');
  assert.ok(!/אעביר את פנייתכם/.test(last(sent).message));
});
test('AUTO_REPLY_ALL עונה לכולם', async () => {
  const { d, sent } = makeDispatcher(true);
  await d.onEvent(inc('שלום'));
  assert.ok(/שלום ותודה שפנית/.test(sent[0].message));
});

// ── פירוק לחיצות (normalize) ──
test('normalize מזהה לחיצת כפתור', () => {
  const g = require('../src/integrations/greenapi');
  const evt = g.normalize({
    typeWebhook: 'incomingMessageReceived', senderData: { chatId: CHAT },
    messageData: { typeMessage: 'buttonsResponseMessage', buttonsResponseMessage: { selectedButtonId: '2' } },
  });
  assert.strictEqual(evt.text, '2');
});
test('normalize מזהה בחירת רשימה (מקונן)', () => {
  const g = require('../src/integrations/greenapi');
  const evt = g.normalize({
    typeWebhook: 'incomingMessageReceived', senderData: { chatId: CHAT },
    messageData: { typeMessage: 'listResponseMessage', listResponseMessage: { singleSelectReply: { selectedRowId: '4' } } },
  });
  assert.strictEqual(evt.text, '4');
});

// ── דף השליטה: הדגל מהדף מתנהג כמו "בוט"/"סיום" ──
test('הפעלה מהדף (דגל active ב-store) גורמת לבוט לענות', async () => {
  const store = new MemoryStore();
  const { d, sent } = makeDispatcher(false, store);
  await store.set(CHAT, { active: true, brain: null }); // כמו לחיצת "הפעל בוט"
  await d.onEvent(inc('היי')); // הבוט מברך בהודעה הבאה, בלי ששרון כתב "בוט"
  assert.ok(/שלום ותודה שפנית/.test(last(sent).message));
});
test('כיבוי מהדף (מחיקת דגל) משתיק את הבוט', async () => {
  const store = new MemoryStore();
  const { d, sent } = makeDispatcher(false, store);
  await store.set(CHAT, { active: true, brain: null });
  await d.onEvent(inc('היי'));
  await store.del(CHAT); // כמו לחיצת "עצור בוט"
  const before = sent.length;
  await d.onEvent(inc('1'));
  assert.strictEqual(sent.length, before, 'אחרי כיבוי הבוט שותק');
});
test('הפעלה מהדף שומרת התקדמות קיימת (brain)', async () => {
  const store = new MemoryStore();
  const { d, sent } = makeDispatcher(false, store);
  await d.onEvent(out('בוט'));      // הופעל, brain בשלב audience
  await d.onEvent(inc('1'));        // -> מיקום
  const saved = await store.get(CHAT);
  // לוגיקת "הפעל בוט" בדף: שומרת brain קיים
  await store.set(CHAT, { active: true, brain: saved.brain });
  await d.onEvent(inc('1'));        // ממשיך -> חבילות (לא מתחיל מחדש)
  assert.ok(/אלו חבילות הצילום/.test(last(sent).message));
});

// ── אחסון מתמיד ──
test('שיחה שורדת אתחול (store משותף)', async () => {
  const store = new MemoryStore();
  const a = makeDispatcher(false, store);
  await a.d.onEvent(out('בוט'));
  await a.d.onEvent(inc('1')); // -> מיקום
  const b = makeDispatcher(false, store);
  await b.d.onEvent(inc('1')); // בסטודיו -> חבילות
  assert.ok(/אלו חבילות הצילום/.test(last(b.sent).message));
});
test('round-trip מלא עד אישור', async () => {
  const store = new MemoryStore();
  const makeBrain = () => new Brain({ calendar: new MockCalendar(BASE), notify: () => {} });
  const sent = [];
  const greenapi = {
    sendMessage: async (c, m) => sent.push({ chatId: c, message: m }),
    sendButtons: async (c, m, b) => sent.push({ chatId: c, message: m, buttons: b }),
    sendList: async (c, m, r) => sent.push({ chatId: c, message: m, list: r }),
  };
  const fresh = () => new Dispatcher({ greenapi, makeBrain, store, logger: { log() {}, error() {} } });
  await fresh().onEvent(out('בוט'));
  for (const m of ['1', '1', '2', '1', 'דנה', '0521234567', 'dana@x.com']) await fresh().onEvent(inc(m));
  assert.ok(/הבקשה נקלטה בהצלחה/.test(last(sent).message));
});

(async () => {
  for (const t of _tests) {
    try {
      await t.fn();
      passed++;
      console.log('  ✓ ' + t.name);
    } catch (e) {
      console.error('  ✗ ' + t.name + '\n    ' + e.message);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\n✅ כל ${passed} הבדיקות עברו.`);
})();
