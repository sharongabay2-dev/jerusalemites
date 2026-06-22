'use strict';

/**
 * כל טקסטי הבוט בעברית — גרסה סופית מאושרת. אין לשנות ניסוחים.
 * הבחירות מוצגות ככפתורים (עד 3) או רשימה אינטראקטיבית (יותר מ-3),
 * ותמיד גם כטקסט ממוספר בגוף ההודעה כגיבוי.
 */

const { PACKAGES, TEAM, formatPrice, getTeamBracket } = require('./config/pricing');
const business = require('./config/business');

const PORTFOLIO = business.portfolioUrl;
const REVIEWS = business.reviewsUrl;

// ── בוני הודעות אינטראקטיביות ──
function buttonsMsg(text, buttons) {
  return { text, buttons };
}
function listMsg(text, rows, opts = {}) {
  return { text, list: { buttonText: opts.buttonText || 'לבחירה', title: opts.title || '', rows } };
}
// עד 3 → כפתורים | יותר מ-3 → רשימה.
function choiceMsg(text, options, opts) {
  return options.length <= 3 ? buttonsMsg(text, options) : listMsg(text, options, opts);
}

const messages = {
  // 1 · פתיחה
  greeting() {
    const text =
      'שלום ותודה שפנית לסטודיו של שרון גבאי.\n' +
      'אני העוזר הדיגיטלי של שרון וכאן כדי לעזור לכם לתאם צילומים בקלות.\n' +
      '(בכל שלב תוכלו לכתוב "נציג" או "שרון" כדי לעבור למענה אנושי).\n\n' +
      'עבור מי מיועדים הצילומים?\n' +
      '1 · צילום תדמית ליחיד\n' +
      '2 · מספר עובדים / הנהלה\n' +
      '3 · צפייה בתיק עבודות וביקורות';
    return buttonsMsg(text, [
      { id: '1', title: 'צילום תדמית ליחיד' },
      { id: '2', title: 'מספר עובדים / הנהלה' },
      { id: '3', title: 'תיק עבודות וביקורות' },
    ]);
  },

  portfolioLinks() {
    return `פורטפוליו: ${PORTFOLIO} | ביקורות: ${REVIEWS}`;
  },

  // 2 · אדם אחד → מיקום
  askLocation() {
    const text =
      'איפה תעדיפו לקיים את הצילומים?\n' +
      '1 · בסטודיו של שרון במושב נס הרים\n' +
      '2 · אצלכם בעסק (שרון מגיע אליכם ומקים סטודיו מקצועי ומלא במקום)';
    return buttonsMsg(text, [
      { id: '1', title: 'בסטודיו בנס הרים' },
      { id: '2', title: 'אצלכם בעסק' },
    ]);
  },

  // 3 · חבילות
  presentPackages(location) {
    const t = PACKAGES[location].tiers;
    const header =
      location === 'studio'
        ? 'אלו חבילות הצילום שלנו בסטודיו. לפני שתבחרו, מוזמנים להציץ בפורטפוליו ממש כאן: ' +
          PORTFOLIO +
          '\n\nכל חבילה כוללת שיחת אפיון מדויקת, קבלת כל התמונות המקוריות שצולמו, ועריכה אמנותית מתקדמת של התמונות הנבחרות.'
        : 'אלו חבילות הצילום אצלכם במשרד. לפני שתבחרו, מוזמנים להציץ בפורטפוליו ממש כאן: ' +
          PORTFOLIO +
          '\n\nהתעריף כולל הגעה, הקמת סטודיו נייד מלא, שיחת אפיון, קבלת כל התמונות המקוריות שצולמו, ועריכה אמנותית מתקדמת של התמונות הנבחרות.';

    const line = (i, tier, rec) =>
      `${i} · ${tier.label} — ${formatPrice(tier.price)} (${tier.photos} תמונות נבחרות, ${tier.sets} סטים)${rec ? ' · מומלצת' : ''}`;
    const text =
      header +
      '\n' +
      line(1, t.base, false) +
      '\n' +
      line(2, t.standard, true) +
      '\n' +
      line(3, t.premium, false);

    return buttonsMsg(text, [
      { id: '1', title: `בסיס · ${formatPrice(t.base.price)}` },
      { id: '2', title: `סטנדרט · ${formatPrice(t.standard.price)}` },
      { id: '3', title: `פרימיום · ${formatPrice(t.premium.price)}` },
    ]);
  },

  // 4 · בחירת מועד
  presentSlots(slots) {
    if (!slots.length) return messages.noSlots();
    const body = slots
      .map((s, i) =>
        s.fullDay
          ? `${i + 1} · ${s.dateLabel}`
          : `${i + 1} · ${s.dateLabel}, בשעה ${s.startLabel}–${s.endLabel}`
      )
      .join('\n');
    const text = 'אלו המועדים הפנויים הקרובים:\n' + body;
    const options = slots.map((s, i) => ({
      id: String(i + 1),
      title: shortSlotLabel(s),
    }));
    return choiceMsg(text, options, { buttonText: 'בחירת מועד' });
  },

  noSlots() {
    return 'כרגע לא נמצא מועד פנוי קרוב ביומן. אעביר את הפנייה לשרון והוא יתאם אתכם מועד באופן אישי.';
  },

  // 5 · פרטי קשר (הזמנה מלאה)
  askName() {
    return 'מעולה! כדי לשריין את המועד, אצטרך רק כמה פרטים אחרונים:\nמה השם המלא שלכם?';
  },
  askPhone() {
    return 'מה מספר הטלפון לחזרה?';
  },
  askEmail() {
    return 'מה כתובת האימייל שלכם? (לשם יישלח זימון ליומן)';
  },
  askAddress() {
    return 'מה הכתובת המלאה אליה שרון יגיע?';
  },

  // 6 · אישור
  confirm(lead) {
    const place = lead.location === 'onsite' ? lead.address : business.studioAddress;
    return (
      `תודה רבה, ${lead.name}! הבקשה נקלטה בהצלחה.\n` +
      `שרינו עבורכם צילומים בתאריך ${whenText(lead.booking)} במסלול ${packageLabel(lead)}.\n` +
      `מיקום: ${place}.\n\n` +
      'שרון יצור איתכם קשר בהקדם לשיחת אפיון קצרה לקראת הצילומים, ובה נעבור גם על הסדר התשלום ומדיניות ביטולים.\n' +
      'נתראה בקרוב!'
    );
  },

  // 7 · כמות עובדים (רשימה — 5 אפשרויות)
  askEmployees() {
    const text =
      'כמה אנשי צוות או הנהלה תרצו לצלם?\n' +
      '1 · עד 5 עובדים\n' +
      '2 · 6 עד 10 עובדים\n' +
      '3 · 11 עד 20 עובדים\n' +
      '4 · 21 עד 40 עובדים\n' +
      '5 · מעל 40 עובדים';
    const ids = ['b5', 'b10', 'b20', 'b40', 'b41'];
    const rows = ids.map((id, i) => ({ id: String(i + 1), title: getTeamBracket(id).label }));
    return listMsg(text, rows, { buttonText: 'בחירת כמות' });
  },

  // 8 · הצגת מחיר (עד 40)
  teamPrice(bracket) {
    const text =
      `עבור ${bracket.range} עובדים, התעריף הוא ${bracket.perPerson} ₪ לכל עובד, ` +
      `בתוספת ${formatPrice(TEAM.arrivalFee)} עלות הגעה והקמת סטודיו מקצועי ומלא אצלכם במשרד.\n` +
      'האם תרצו להמשיך לבחירת תאריך ליום צילום?\n' +
      '1 · כן, בואו נתקדם\n' +
      '2 · אשמח ששרון יחזור אליי';
    return buttonsMsg(text, [
      { id: '1', title: 'כן, בואו נתקדם' },
      { id: '2', title: 'שרון יחזור אליי' },
    ]);
  },

  // 9 · צוות מעל 40
  teamCustom() {
    return (
      'לצוות בסדר גודל כזה, שרון בונה הצעת מחיר ויום צילומים מותאם אישית.\n' +
      'אשמח לקחת את הפרטים שלכם ושרון יחזור אליכם בהקדם.'
    );
  },

  // איסוף לחזרה (שם + טלפון בלבד)
  askCallbackName() {
    return 'כדי ששרון יחזור אליכם, אשאיר לו שם וטלפון:\nמה השם המלא שלכם?';
  },
  askCallbackPhone() {
    return 'מה מספר הטלפון?';
  },
  callbackDone() {
    return 'תודה! העברתי את הפרטים לשרון, והוא יחזור אליכם בהקדם.';
  },

  // מעבר למענה אנושי
  humanHandoff() {
    return 'אעביר את פנייתכם לשרון, והוא יחזור אליכם בהקדם.';
  },

  bookingFailed() {
    return 'מתנצל — נראה שהמועד נתפס בדיוק כעת. העברתי את הפנייה לשרון, והוא יתאם אתכם מועד חלופי באופן אישי.';
  },
  notUnderstood() {
    return 'סליחה, לא הבנתי. אפשר לבחור אחת מהאפשרויות לפי המספר.';
  },
  goodbye() {
    return 'תודה רבה, ויום טוב.';
  },
};

// ── עזרי תצוגה ──
function shortSlotLabel(s) {
  // תווית קצרה לכפתור/רשימה (עד 25 תווים).
  const dm = s.dateLabel.replace('יום ', '').replace(/,.*?(\d{2}\/\d{2})/, ' $1'); // "ראשון 21/06"
  return s.fullDay ? dm : `${dm} ${s.startLabel}`;
}

function whenText(booking) {
  if (!booking) return '';
  return booking.fullDay
    ? `${booking.dateLabel} (יום מלא)`
    : `${booking.dateLabel} בשעה ${booking.startLabel}–${booking.endLabel}`;
}

function packageLabel(lead) {
  if (lead.audience === 'team' && lead.team) return `צוות (${lead.team.label})`;
  return lead.tier ? lead.tier.label : '';
}

module.exports = messages;
