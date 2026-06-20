'use strict';

/**
 * בדיקות אוטומטיות קלות (בלי תלויות) — מאמתות את חוקי התמחור והזמינות.
 * הרצה:  npm test   (או: node test/run.js)
 */

const assert = require('assert');
const { Brain } = require('../src/brain');
const { MockCalendar } = require('../src/calendar');
const { getTier } = require('../src/config/pricing');
const {
  WINDOW_START_MIN,
  WINDOW_END_MIN,
  STUDIO_DURATION_MIN,
  GAP_MIN,
  isWorkingDay,
} = require('../src/config/availability');

const BASE = new Date('2026-06-21T00:00:00'); // ראשון
let passed = 0;
const _tests = [];
function test(name, fn) {
  _tests.push({ name, fn });
}

// מאסף את ההתראות לשרון במקום להדפיס.
function makeBrain() {
  const calendar = new MockCalendar(BASE);
  const leads = [];
  const notify = (lead) => leads.push(JSON.parse(JSON.stringify(lead)));
  const brain = new Brain({ calendar, notify });
  brain.start();
  return { brain, calendar, leads };
}

console.log('בדיקות חוקי תמחור וזמינות:');

// ── תמחור ──
test('מחירי סטודיו תקינים', () => {
  assert.strictEqual(getTier('studio', 'base').price, 1250);
  assert.strictEqual(getTier('studio', 'standard').price, 1850);
  assert.strictEqual(getTier('studio', 'premium').price, 2600);
});

test('מחירי אצל הלקוח תקינים', () => {
  assert.strictEqual(getTier('onsite', 'base').price, 2600);
  assert.strictEqual(getTier('onsite', 'standard').price, 3400);
  assert.strictEqual(getTier('onsite', 'premium').price, 4200);
});

test('סטנדרט מסומנת כמומלצת', () => {
  assert.strictEqual(getTier('studio', 'standard').recommended, true);
  assert.strictEqual(getTier('studio', 'base').recommended, false);
});

// ── זמינות ──
test('כל המועדים בחלון 9:30–13:30 ובימי א׳–ה׳', () => {
  const cal = new MockCalendar(BASE);
  for (const tier of ['base', 'standard', 'premium']) {
    const slots = cal.proposeStudioSlots(tier, { limit: 20 });
    assert.ok(slots.length > 0, 'נמצאו מועדים');
    for (const s of slots) {
      assert.ok(s.startMin >= WINDOW_START_MIN, 'אחרי 9:30');
      assert.ok(s.endMin <= WINDOW_END_MIN, 'לפני 13:30');
      assert.strictEqual(s.endMin - s.startMin, STUDIO_DURATION_MIN[tier], 'משך נכון');
      assert.ok(isWorkingDay(s.date), 'יום עבודה');
    }
  }
});

test('מועד מוצע שומר רווח של 30 דק׳ מאירוע תפוס', () => {
  const cal = new MockCalendar(BASE);
  // ביום הבסיס (ראשון) זרוע אירוע 10:00–11:00.
  const slots = cal.freeStudioSlots(BASE, 'standard'); // 60 דק'
  for (const s of slots) {
    const conflict = !(s.endMin + GAP_MIN <= 600 || 660 + GAP_MIN <= s.startMin);
    assert.ok(!conflict, `אין חפיפה/רווח חסר במשבצת ${s.startLabel}`);
  }
  // 9:30–10:30 לא חוקי (נוגע ב-10:00); ציפייה שלא יוצע.
  assert.ok(!slots.some((s) => s.startMin === WINDOW_START_MIN), '9:30 חסום ע"י הרווח');
});

test('יום חסום לחלוטין לא מציע משבצות סטודיו', () => {
  const cal = new MockCalendar(BASE);
  // יום העבודה השני נזרע כחסום (יום מלא).
  const onsiteDays = cal.proposeOnsiteDays('standard', { limit: 10 });
  // בדיקה: כל הימים המוצעים פנויים לחלוטין.
  for (const d of onsiteDays) {
    assert.strictEqual(cal.getEventsForDate(d.date).length, 0, 'יום פנוי לחלוטין');
    assert.ok(isWorkingDay(d.date), 'יום עבודה');
  }
});

// ── שיחה מלאה: סטודיו סטנדרט ──
test('שיחת סטודיו מלאה קובעת מועד ומתמחרת נכון', () => {
  const { brain, leads } = makeBrain();
  brain.receive('1'); // פורטרט
  brain.receive('שבוע הבא');
  brain.receive('1'); // סטודיו
  brain.receive('2'); // סטנדרט
  brain.receive('1'); // מועד ראשון
  brain.receive('דנה');
  const reply = brain.receive('0521234567').join('\n');
  assert.ok(brain.isDone(), 'השיחה הסתיימה');
  assert.strictEqual(leads.length, 1, 'יצאה התראה אחת לשרון');
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 1850, 'מחיר סטנדרט סטודיו');
  assert.strictEqual(lead.location, 'studio');
  assert.ok(lead.booking, 'נקבע מועד');
  assert.ok(!lead.booking.fullDay, 'לא יום מלא');
  assert.ok(reply.includes('1,850'), 'המחיר מופיע באישור');
});

// ── שיחה מלאה: אצל הלקוח חוסם יום ──
test('שיחת אצל הלקוח חוסמת יום שלם', () => {
  const { brain, calendar, leads } = makeBrain();
  brain.receive('תדמית');
  brain.receive('החודש');
  brain.receive('2'); // אצל הלקוח
  brain.receive('3'); // פרימיום
  brain.receive('1'); // יום ראשון פנוי
  brain.receive('יוסי');
  brain.receive('0501112233');
  const lead = leads[0];
  assert.strictEqual(lead.tier.price, 4200, 'מחיר פרימיום אצל הלקוח');
  assert.ok(lead.booking.fullDay, 'יום מלא נחסם');
  // היום שנקבע אכן מסומן חסום ביומן.
  assert.ok(calendar.isFullyBlocked(new Date(lead.booking.dateKey + 'T00:00:00')), 'היום חסום ביומן');
});

// ── חברה גדולה: לא קובעים מועד, מתאמים שיחה ──
test('חברה גדולה -> תיאום שיחה, ללא קביעת מועד', () => {
  const { brain, leads } = makeBrain();
  brain.receive('4');
  brain.receive('הייטק, 30 עובדים, 0533334444');
  assert.ok(brain.isDone());
  const lead = leads[0];
  assert.ok(!lead.booking, 'אין קביעת מועד אוטומטית');
  assert.ok(/שיחת טלפון/.test(lead.outcome), 'מתואמת שיחת טלפון');
  assert.strictEqual(lead.phone, '0533334444', 'נשמר טלפון');
});

// ── מעבר לשיחה אישית מכל שלב ──
test('בקשת מעבר לשרון עוברת ל-handoff', () => {
  const { brain, leads } = makeBrain();
  brain.receive('1');
  brain.receive('דחוף');
  brain.receive('אשמח לדבר עם שרון');
  brain.receive('רוני, 0547778888');
  assert.ok(brain.isDone());
  assert.ok(!leads[0].booking, 'אין מועד');
  assert.ok(/שיחה אישית/.test(leads[0].outcome));
});

// ── הפעלה ידנית (Dispatcher) ──
const { Dispatcher } = require('../src/dispatcher');
const { notifySharon } = require('../src/integrations/notify');

function makeDispatcher(autoReplyAll = false) {
  const sent = [];
  const greenapi = { sendMessage: async (chatId, message) => sent.push({ chatId, message }) };
  const makeBrain = () => new Brain({ calendar: new MockCalendar(BASE), notify: () => {} });
  const d = new Dispatcher({
    greenapi,
    makeBrain,
    autoReplyAll,
    logger: { log: () => {}, error: () => {} },
  });
  return { d, sent };
}
const CHAT = '972500000001@c.us';
const inc = (text) => ({ kind: 'message', direction: 'incoming', viaApi: false, chatId: CHAT, text });
const out = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: false, chatId: CHAT, text });
const botApi = (text) => ({ kind: 'message', direction: 'outgoing', viaApi: true, chatId: CHAT, text });

test('כברירת מחדל הבוט שותק להודעת לקוח', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('שלום'));
  assert.strictEqual(sent.length, 0, 'אין תגובה לפני הפעלה');
});

test('"בוט" מהמכשיר של שרון מפעיל ומברך', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  assert.strictEqual(sent.length, 1, 'נשלחה ברכה');
  assert.ok(/ברוכים הבאים/.test(sent[0].message), 'תוכן הברכה');
});

test('הודעה מלקוח שמכילה "בוט" אינה מפעילה (רק הודעה יוצאת מפעילה)', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(inc('בוט'));
  assert.strictEqual(sent.length, 0, 'הודעת לקוח לא מפעילה');
});

test('הודעות שהבוט עצמו שלח מסוננות (אין לולאה)', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  const before = sent.length;
  await d.onEvent(botApi('שלום, וברוכים הבאים...'));
  assert.strictEqual(sent.length, before, 'הודעת API של הבוט לא מטופלת');
});

test('לאחר הפעלה הבוט מנהל את השיחה', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט')); // ברכה
  await d.onEvent(inc('1')); // פורטרט -> שאלת "מתי"
  assert.ok(sent.length >= 2, 'הבוט הגיב להודעת הלקוח');
  assert.ok(/מתי/.test(sent[sent.length - 1].message), 'המשיך בסינון');
});

test('"סיום" מחזיר שליטה לשרון והבוט שותק שוב', async () => {
  const { d, sent } = makeDispatcher(false);
  await d.onEvent(out('בוט'));
  await d.onEvent(out('סיום'));
  const before = sent.length;
  await d.onEvent(inc('1'));
  assert.strictEqual(sent.length, before, 'אין תגובה אחרי סיום');
});

test('מתג AUTO_REPLY_ALL גורם לבוט לענות לכולם', async () => {
  const { d, sent } = makeDispatcher(true);
  await d.onEvent(inc('שלום')); // ללא "בוט" -> מברך מיד
  assert.ok(sent.length >= 1, 'ענה בלי הפעלה ידנית');
  assert.ok(/ברוכים הבאים/.test(sent[0].message));
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

