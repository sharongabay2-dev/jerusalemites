'use strict';

/**
 * התראה לשרון על כל פנייה.
 * -------------------------------------------------------------
 * שלב בדיקה: ההתראה מודפסת ללוג בלבד.
 *
 * >>> נקודת חיבור עתידית <<<
 * כאן ייכנס בעתיד שליחת ההתראה האמיתית לשרון — למשל:
 *   - הודעת וואטסאפ למספר של שרון
 *   - מייל / SMS
 *   - הודעה לערוץ פנימי
 * השאירו את אותה חתימה: notifySharon(lead) ומלאו את גוף השליחה.
 */

const SHARON_CONTACT = {
  // פרטי היעד להתראה — יוזרקו בעתיד ממשתני סביבה / הגדרות.
  whatsapp: '972542000300',
  name: 'שרון גבאי',
};

const { formatPrice } = require('../config/pricing');

/**
 * @param {object} lead כל פרטי הפנייה שנאספו בשיחה.
 * @param {object} [opts]
 * @param {function} [opts.logger=console.log]
 */
function notifySharon(lead, opts = {}) {
  const log = opts.logger || console.log;

  const lines = [];
  lines.push('');
  lines.push('==================================================');
  lines.push('🔔 התראה לשרון — פנייה חדשה מהבוט');
  lines.push('   (שלב בדיקה: הדפסה ללוג בלבד)');
  lines.push('==================================================');
  const audienceLabel =
    lead.audience === 'team' ? 'מספר עובדים' : lead.audience === 'single' ? 'אדם אחד' : '—';
  const locationLabel =
    lead.location === 'studio' ? 'בסטודיו' : lead.location === 'onsite' ? 'בבית העסק' : '—';

  lines.push(`שם: ${lead.name || '—'}`);
  lines.push(`טלפון: ${lead.phone || '—'}`);
  lines.push(`אימייל: ${lead.email || '—'}`);
  if (lead.address) lines.push(`כתובת: ${lead.address}`);
  lines.push(`סוג הפנייה: ${audienceLabel}`);
  lines.push(`מיקום: ${locationLabel}`);

  if (lead.tier) {
    lines.push(
      `חבילה: ${lead.tier.label} — ${formatPrice(lead.tier.price)} ` +
        `(${lead.tier.photos} תמונות, ${lead.tier.sets} סטים)`
    );
  }
  if (lead.team) {
    const price =
      lead.team.perPerson === null
        ? 'הצעה אישית (40+ עובדים)'
        : `${formatPrice(lead.team.perPerson)} לעובד + ${formatPrice(1500)} הגעה והקמה`;
    lines.push(`צוות: ${lead.team.label} — ${price}`);
  }

  if (lead.booking) {
    lines.push('--------------------------------------------------');
    lines.push('📅 מועד שנקבע:');
    lines.push(`   ${lead.booking.dateLabel}`);
    lines.push(
      lead.booking.fullDay
        ? `   יום מלא (${lead.booking.startLabel}–${lead.booking.endLabel})`
        : `   ${lead.booking.startLabel}–${lead.booking.endLabel}`
    );
  }

  if (lead.outcome) {
    lines.push('--------------------------------------------------');
    lines.push(`סטטוס: ${lead.outcome}`);
  }

  if (lead.notes) {
    lines.push(`הערות: ${lead.notes}`);
  }

  lines.push('==================================================');
  lines.push('');

  log(lines.join('\n'));
  return { delivered: true, channel: 'log', to: SHARON_CONTACT };
}

module.exports = { notifySharon, SHARON_CONTACT };
