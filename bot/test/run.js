'use strict';

/**
 * בדיקות אוטומטיות (בלי תלויות) — תמחור, זמינות, זרימת השיחה החדשה,
 * הפעלה ידנית, ואחסון מתמיד.
 * הרצה:  npm test
 */

const assert = require('assert');
const { Brain } = require('../src/brain');
const { MockCalendar } = require('../src/calendar');
const { Dispatcher } = require('../src/dispatcher');
const { MemoryStore } = require('../src/store');
const { getTier, getTeamBracket, TEAM } = require('../src/config/pricing');
const {
  studioSlotsForDay,
  windowIsFree,
} = require('../src/scheduling');
const {
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  STUDIO_DURATION_MIN,
  isWorkingDay,
} = require('../src/config/availability');

const BASE = new Date('2026-06-21T00:00:00'); // ראשון
let passed = 0;
const _tests = [];
function test(name, fn) {
  _tests.push({ name, fn });
}

// ── עוזרי בדיקה לשיחה מלאה ──
function newBrain(leads) {
  const notify = leads ? (l) => leads.push(JSON.parse(JSON.stringify(l))) : () => {};
  return new Brain({ calendar: new MockCalendar(BASE), notify });
}
function toText(reply) {
  return reply.map((r) => (typeof r === 'string' ? r : r.text)).join('\n');
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
test('סטנדרט מומלצת', () => {
  assert.strictEqual(getTier('studio', 'standard').recommended, true);
});
test('מדרגות צוות + דמי הגעה', () => {
  assert.strictEqual(TEAM.arrivalFee, 1500);
  assert.strictEqual(getTeamBracket('b5').perPerson, 790);
  assert.strictEqual(getTeamBracket('b10').perPerson, 650);
  assert.strictEqual(getTeamBracket('b20').perPerson, 550);
  assert.strictEqual(getTeamBracket('b40').perPerson, 450);
  assert.strictEqual(getTeamBracket('b41').perPerson, null);
});

// ── זמינות (לוגיקה משותפת) ──
test('משבצות סטודיו בתוך החלון, במשך הנכון, לא חופפות', () => {
  for (const tier of ['base', 'standard', 'premium']) {
    const slots = studioSlotsForDay(BASE, tier, []);
    assert.ok(slots.length > 0);
    let prevEnd = -Infinity;
    for (const s of slots) {
      assert.ok(s.startMin >= WINDOW_START_MIN && s.endMin <= WINDOW_END_MIN, 'בתוך החלון');
      assert.strictEqual(s.endMin - s.startMin, STUDIO_DURATION_MIN[tier], 'משך נכון');
      assert.ok(s.startMin >= prevEnd, 'לא חופף את הקודם');
      prevEnd = s.endMin;
    }
  }
});
test('רווח 30 דק׳ נשמר מול אירוע תפוס', () => {
  const busy = [{ startMin: 10 * 60, endMin: 11 * 60 }]; // 10:00–11:00
  const slots = studioSlotsForDay(BASE, 'standard', busy); // 60 דק'
  // 9:30 חסום ע"י הרווח; המשבצת הראשונה האפשרית 11:30.
  assert.ok(!slots.some((s) => s.startMin === WINDOW_START_MIN), '9:30 חסום');
  assert.strictEqual(slots[0].startMin, 11 * 60 + 30, 'הראשונה 11:30');
});
test('windowIsFree מזהה יום חסום', () => {
  assert.strictEqual(windowIsFree([]), true);
  assert.strictEqual(windowIsFree([{ startMin: 0, endMin: 1440 }]), false);
  assert.strictEqual(windowIsFree([{ startMin: 8 * 60, endMin: 9 * 60 }]), true); // לפני החלון
});

// ── יומן בדיקה (אסינכרוני) ──
test('proposeStudioSlots מחזיר משבצות בימי עבודה בלבד', async () => {
  const cal = new MockCalendar(BASE);
  const slots = await cal.proposeStudioSlots('standard', { limit: 10 });
  assert.ok(slots.length > 0);
  for (const s of slots) assert.ok(isWorkingDay(s.date), 'יום עבודה');
});
test('proposeOnsiteDays מחזיר ימים פנויים לחלוטין', async () => {
  const cal = new MockCalendar(BASE);
  const days = await cal.proposeOnsiteDays('base', { limit: 5 });
  for (const d of days) {
    assert.ok(isWorkingDay(d.date));
    assert.ok(d.fullDay, 'יום מלא');
  }
});

// ── זרימת שיחה: אדם אחד · סטודיו · סטנדרט ──
test('אדם אחד · סטודיו · סטנדרט -> קביעה, מחיר ומדיניות', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['1', '1', '2', '1', 'דנה כהן', '0521234567', 'dana@x.com']);
  assert.ok(brain.isDone());
  assert.strictEqual(leads.length, 1);
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 1850);
  assert.strictEqual(lead.location, 'studio');
  assert.strictEqual(lead.email, 'dana@x.com');
  assert.ok(lead.booking && !lead.booking.fullDay);
  assert.ok(/1,850/.test(reply), 'מחיר באישור');
  assert.ok(/כליל החורש/.test(reply), 'כתובת הסטודיו באישור');
  assert.ok(/מדיניות ביטולים/.test(reply), 'מדיניות ביטולים באישור');
});

// ── אדם אחד · בית העסק · פרימיום · יום מלא + כתובת ──
test('אדם אחד · בית העסק · פרימיום -> יום מלא וכתובת לקוח', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, [
    '1', '2', '3', '1', 'יוסי לוי', '0501112233', 'y@x.com', 'הרצל 10, תל אביב',
  ]);
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 4200);
  assert.strictEqual(lead.location, 'onsite');
  assert.strictEqual(lead.address, 'הרצל 10, תל אביב');
  assert.ok(lead.booking.fullDay, 'יום מלא');
  assert.ok(/הרצל 10, תל אביב/.test(reply), 'כתובת הלקוח באישור');
});

// ── מספר עובדים · 11–20 ──
test('מספר עובדים · 11–20 -> תמחור 550 + 1,500 ויום מלא', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, [
    '2', '2', '1', '1', 'מיכל', '0521119999', 'm@x.com', 'ויצמן 5, רעננה',
  ]);
  const lead = leads[0];
  assert.strictEqual(lead.audience, 'team');
  assert.strictEqual(lead.team.perPerson, 550);
  assert.strictEqual(lead.location, 'onsite');
  assert.ok(lead.booking.fullDay);
  assert.ok(/550/.test(reply) && /1,500/.test(reply), 'תמחור צוות באישור');
});

// ── מספר עובדים · 40+ ──
test('מספר עובדים · 40+ -> הצעה אישית, ללא קביעה', async () => {
  const leads = [];
  const brain = newBrain(leads);
  const reply = await play(brain, ['2', '3', 'רונית', '0539998888', 'r@x.com']);
  assert.ok(brain.isDone());
  const lead = leads[0];
  assert.strictEqual(lead.team.perPerson, null);
  assert.ok(!lead.booking, 'אין קביעת מועד');
  assert.ok(/הצעה אישית/.test(reply), 'הודעת הצעה אישית');
});

// ── מעבר לשרון באמצע ──
test('בקשה לדבר עם שרון -> איסוף פרטים, ללא קביעה', async () => {
  const leads = [];
  const brain = newBrain(leads);
  await play(brain, ['1', 'אשמח לדבר עם שרון', 'רוני', '0547778888', 'roni@x.com']);
  assert.ok(brain.isDone());
  assert.ok(!leads[0].booking);
  assert.ok(/שיחה אישית|לדבר/.test(leads[0].outcome));
  assert.strictEqual(leads[0].email, 'roni@x.com');
});

// ── הפעלה ידנית (Dispatcher) ──
function makeDispatcher(autoReplyAll = false, store) {
  const sent = [];
  const greenapi = {
    sendMessage: async (chatId, message) => sent.push({ chatId, message }),
    sendButtons: async (chatId, message, buttons) => sent.push({ chatId, message, buttons }),
  };
  const makeBrain = () => new Brain({ calendar: new MockCalendar(BASE), notify: () => {} });
  const d = new Dispatcher({
    greenapi, makeBrain, store, autoReplyAll, logger: { log() {}, error() {} },
  });
  return { d, sent };
}
const CHAT = '972500000001@c.us';
const inc = (text) => ({ kind: 'message', direction: 'incoming', viaApi: false, chatId: CHAT, text });
const out = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: false, chatId: CHAT, text });
const botApi = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: true, chatId: CHAT, text });

test('ברירת מחדל: הבוט שותק להודעת לקוח', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('שלום'));
  assert.strictEqual(sent.length, 0);
});
test('"בוט" מהמכשיר של שרון מפעיל ומברך עם כפתורים', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  assert.strictEqual(sent.length, 1);
  assert.ok(/ברוכים הבאים/.test(sent[0].message), 'גוף הטקסט (גיבוי)');
  assert.ok(Array.isArray(sent[0].buttons) && sent[0].buttons.length === 2, 'נשלחו 2 כפתורים');
  assert.strictEqual(sent[0].buttons[0].id, '1');
});

test('לחיצת כפתור (buttonId) מתפקדת כמו הקלדת המספר', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('2')); // buttonId "2" = מספר עובדים -> שאלת כמות
  assert.ok(/כמה עובדים/.test(sent[sent.length - 1].message));
  assert.ok(Array.isArray(sent[sent.length - 1].buttons), 'גם השאלה הבאה בכפתורים');
});
test('הודעת לקוח "בוט" אינה מפעילה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('בוט'));
  assert.strictEqual(sent.length, 0);
});
test('הודעות API של הבוט מסוננות (אין לולאה)', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  const before = sent.length;
  await d.onEvent(botApi('שלום...'));
  assert.strictEqual(sent.length, before);
});
test('לאחר הפעלה הבוט מנהל את השיחה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(inc('1')); // אדם אחד -> שאלת מיקום
  assert.ok(/היכן/.test(sent[sent.length - 1].message));
});
test('normalize מזהה לחיצת כפתור ומחזיר את ה-buttonId', () => {
  const greenapiMod = require('../src/integrations/greenapi');
  const body = {
    typeWebhook: 'incomingMessageReceived',
    senderData: { chatId: CHAT },
    messageData: {
      typeMessage: 'buttonsResponseMessage',
      buttonsResponseMessage: { selectedButtonId: '2', selectedButtonText: 'מספר עובדים' },
    },
  };
  const evt = greenapiMod.normalize(body);
  assert.strictEqual(evt.kind, 'message');
  assert.strictEqual(evt.direction, 'incoming');
  assert.strictEqual(evt.text, '2', 'מחזיר את buttonId כטקסט');
});

test('"סיום" מחזיר שליטה לשרון', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(out('סיום'));
  const before = sent.length;
  await d.onEvent(inc('1'));
  assert.strictEqual(sent.length, before);
});
test('AUTO_REPLY_ALL עונה לכולם', async () => {
  const { d, sent } = makeDispatcher(true);
  await d.onEvent(inc('שלום'));
  assert.ok(/ברוכים הבאים/.test(sent[0].message));
});

// ── אחסון מתמיד: שרידות אחרי "אתחול" ──
test('שיחה פעילה שורדת אתחול (Dispatcher חדש, אותו store)', async () => {
  const store = new MemoryStore();
  const a = makeDispatcher(false, store);
  await a.d.onEvent(out('בוט'));
  await a.d.onEvent(inc('1')); // -> מיקום
  const b = makeDispatcher(false, store); // "אתחול"
  await b.d.onEvent(inc('1')); // בסטודיו -> חבילות
  assert.ok(/החבילות שלנו/.test(b.sent[b.sent.length - 1].message), 'המשיך מהשלב הנכון');
});
test('round-trip סריאליזציה מלא עד אישור', async () => {
  const store = new MemoryStore();
  const makeBrain = () => new Brain({ calendar: new MockCalendar(BASE), notify: () => {} });
  const sent = [];
  const greenapi = { sendMessage: async (c, m) => sent.push({ chatId: c, message: m }) };
  const fresh = () => new Dispatcher({ greenapi, makeBrain, store, logger: { log() {}, error() {} } });
  await fresh().onEvent(out('בוט'));
  for (const m of ['1', '1', '2', '1', 'דנה', '0521234567', 'dana@x.com']) {
    await fresh().onEvent(inc(m));
  }
  const last = sent[sent.length - 1].message;
  assert.ok(/ההזמנה נקלטה/.test(last), 'הגיע לאישור');
  assert.ok(/1,850/.test(last), 'מחיר נכון');
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
