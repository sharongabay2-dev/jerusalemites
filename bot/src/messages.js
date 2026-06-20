'use strict';

/**
 * כל טקסטי הבוט בעברית — טון מאופק, מקצועי ומכובד.
 * הערה: שרון הוא גבר — כל התייחסות אליו בלשון זכר.
 * הבחירות הן לפי מספרים (הלקוח בוחר); רק פרטי הקשר בסוף מוקלדים.
 */

const { PACKAGES, TEAM, formatPrice } = require('./config/pricing');
const business = require('./config/business');

const messages = {
  greeting() {
    return (
      'שלום, וברוכים הבאים לסטודיו של שרון גבאי. אני העוזר הדיגיטלי.\n' +
      'בכל שלב תוכלו לבקש לדבר עם שרון ישירות.\n' +
      'מוזמנים להתרשם מעבודות ומחוות דעת של לקוחות:\n' +
      `פורטפוליו › ${business.portfolioUrl}\n` +
      `ביקורות › ${business.reviewsUrl}\n\n` +
      'איזה צילום תרצו?\n' +
      '1 · צילום לאדם אחד\n' +
      '2 · צילום למספר עובדים'
    );
  },

  askLocation() {
    return (
      'היכן נוח לכם לצלם?\n' +
      `1 · בסטודיו של שרון, ב${business.studioShortLocation}\n` +
      '2 · בבית העסק — שרון מגיע ומקים סטודיו מלא אצלכם (תוצאה זהה; התעריף גבוה יותר)'
    );
  },

  presentPackages(location) {
    const loc = PACKAGES[location];
    const t = loc.tiers;
    const includes = loc.includes.join(', ');
    return (
      `החבילות שלנו ${loc.label}:\n` +
      `1 · בסיס — ${formatPrice(t.base.price)} (${t.base.photos} תמונות, ${t.base.sets} סטים)\n` +
      `2 · סטנדרט — ${formatPrice(t.standard.price)} (${t.standard.photos} תמונות, ${t.standard.sets} סטים) — מומלצת\n` +
      `3 · פרימיום — ${formatPrice(t.premium.price)} (${t.premium.photos} תמונות, ${t.premium.sets} סטים)\n` +
      `כולל: ${includes}.\n\n` +
      'איזו חבילה מתאימה לכם? (1 / 2 / 3)'
    );
  },

  askEmployees() {
    return (
      'כמה עובדים?\n' +
      '1 · עד 5\n' +
      '2 · 6–10\n' +
      '3 · 11–20\n' +
      '4 · 21–40\n' +
      '5 · יותר מ-40'
    );
  },

  teamPriced(bracket) {
    return (
      `לצילום ${bracket.label} בבית העסק:\n` +
      `${formatPrice(bracket.perPerson)} לעובד, בתוספת ${formatPrice(TEAM.arrivalFee)} דמי הגעה והקמה.\n` +
      'הסכום הסופי ייקבע לפי מספר העובדים בפועל, ושרון יאשר אותו אתכם.'
    );
  },

  teamCustom() {
    return (
      'לצוות של יותר מ-40 עובדים שרון מתאים הצעה אישית.\n' +
      'נשמח לכמה פרטים ושרון יחזור אליכם עם הצעה מותאמת.'
    );
  },

  presentStudioSlots(slots) {
    if (!slots.length) return messages.noSlots();
    const list = slots
      .map((s, i) => `${i + 1} · ${s.dateLabel}, בשעה ${s.startLabel}–${s.endLabel}`)
      .join('\n');
    return (
      'מצוין. אלה המועדים הפנויים הקרובים (ימים א׳–ה׳, בין 9:30 ל-13:30):\n' +
      list +
      '\n\nאיזה מועד מתאים לכם? (בחרו מספר)'
    );
  },

  presentOnsiteDays(days) {
    if (!days.length) return messages.noSlots();
    const list = days.map((d, i) => `${i + 1} · ${d.dateLabel}`).join('\n');
    return (
      'צילום בבית העסק שומר יום מלא ביומן של שרון. אלה הימים הפנויים הקרובים (ימים א׳–ה׳):\n' +
      list +
      '\n\nאיזה יום מתאים לכם? (בחרו מספר)'
    );
  },

  noSlots() {
    return 'כרגע לא נמצא מועד פנוי קרוב ביומן. אעביר את הפנייה לשרון והוא יתאם אתכם מועד באופן אישי.';
  },

  askName() {
    return 'מצוין. נסיים בכמה פרטים ליצירת קשר. מה השם המלא?';
  },
  askPhone() {
    return 'מספר טלפון ליצירת קשר?';
  },
  askEmail() {
    return 'כתובת אימייל (לשליחת זימון ליומן)?';
  },
  askAddress() {
    return 'מה הכתובת המלאה שבה יתקיים הצילום?';
  },

  // אישור הזמנה ללקוח.
  confirm(lead) {
    const lines = [];
    lines.push(`תודה, ${lead.name}. ההזמנה נקלטה.`);

    const b = lead.booking;
    const when = b.fullDay
      ? `${b.dateLabel} · יום מלא`
      : `${b.dateLabel} · ${b.startLabel}–${b.endLabel}`;
    lines.push(`${when} · ${priceLine(lead)}`);

    const place =
      lead.location === 'onsite' ? lead.address : business.studioAddress;
    lines.push(`מיקום: ${place}`);

    lines.push('מדיניות ביטולים:');
    for (const p of business.cancellationPolicy) lines.push(`· ${p}`);

    lines.push('שרון יחזור אליכם לאישור ולשיחת אפיון קצרה לפני הצילום.');
    return lines.join('\n');
  },

  teamCustomDone(name) {
    return (
      `תודה, ${name}. העברתי את הפרטים לשרון, והוא יחזור אליכם עם הצעה אישית מותאמת.`
    );
  },

  handoff(name) {
    const who = name ? `${name}, ` : '';
    return `${who}בהחלט. נשמח לכמה פרטים, ושרון ייצור אתכם קשר באופן אישי בהקדם.`;
  },

  handoffDone(name) {
    return `תודה, ${name}. העברתי את הפרטים לשרון, והוא יחזור אליכם בהקדם.`;
  },

  bookingFailed() {
    return 'מתנצל — נראה שהמועד נתפס בדיוק כעת. העברתי את הפנייה לשרון, והוא יתאם אתכם מועד חלופי באופן אישי.';
  },

  notUnderstood() {
    return 'סליחה, לא הבנתי. אפשר לבחור אחת מהאפשרויות לפי המספר.';
  },

  goodbye() {
    return 'תודה רבה, ויום טוב. אני כאן לכל שאלה נוספת.';
  },
};

// שורת החבילה/מחיר באישור — שונה בין אדם אחד לצוות.
function priceLine(lead) {
  if (lead.audience === 'team' && lead.team) {
    return (
      `${lead.team.label} — ${formatPrice(lead.team.perPerson)} לעובד + ` +
      `${formatPrice(TEAM.arrivalFee)} הגעה והקמה`
    );
  }
  const tier = lead.tier;
  return `חבילת ${tier.label} ${PACKAGES[lead.location].label} — ${formatPrice(tier.price)}`;
}

module.exports = messages;
