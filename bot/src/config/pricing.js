'use strict';

/**
 * מחירון העסק — מקור אמת יחיד.
 *
 * שני מסלולים:
 *  - אדם אחד: צילום בסטודיו או בבית העסק, שלוש חבילות (base/standard/premium).
 *  - מספר עובדים: תמיד בבית העסק, תמחור לפי מדרגות + דמי הגעה והקמה קבועים.
 */

const PACKAGES = {
  studio: {
    label: 'בסטודיו',
    includes: ['שיחת אפיון', 'כל חומר הגלם', 'עריכה מקצועית'],
    tiers: {
      base: { id: 'base', label: 'בסיס', price: 1250, photos: 5, sets: 2, recommended: false },
      standard: { id: 'standard', label: 'סטנדרט', price: 1850, photos: 10, sets: 4, recommended: true },
      premium: { id: 'premium', label: 'פרימיום', price: 2600, photos: 15, sets: 6, recommended: false },
    },
  },
  onsite: {
    label: 'בבית העסק',
    includes: ['הקמת סטודיו מלא בשטח', 'שיחת אפיון', 'כל חומר הגלם', 'עריכה מקצועית'],
    tiers: {
      base: { id: 'base', label: 'בסיס', price: 2600, photos: 5, sets: 2, recommended: false },
      standard: { id: 'standard', label: 'סטנדרט', price: 3400, photos: 10, sets: 4, recommended: true },
      premium: { id: 'premium', label: 'פרימיום', price: 4200, photos: 15, sets: 6, recommended: false },
    },
  },
};

// צילום מספר עובדים (תמיד בבית העסק).
const TEAM = {
  arrivalFee: 1500, // דמי הגעה והקמה — נוספים תמיד.
  // מדרגות לפי מספר העובדים. perPerson=null => הצעה אישית (לא מתומחר אוטומטית).
  brackets: [
    { id: 'b5', label: 'עד 5 עובדים', range: 'עד 5', perPerson: 790 },
    { id: 'b10', label: '6 עד 10 עובדים', range: '6 עד 10', perPerson: 650 },
    { id: 'b20', label: '11 עד 20 עובדים', range: '11 עד 20', perPerson: 550 },
    { id: 'b40', label: '21 עד 40 עובדים', range: '21 עד 40', perPerson: 450 },
    { id: 'b41', label: 'מעל 40 עובדים', range: 'מעל 40', perPerson: null },
  ],
};

function getTier(location, tierId) {
  const loc = PACKAGES[location];
  if (!loc) return null;
  return loc.tiers[tierId] || null;
}

function getTeamBracket(id) {
  return TEAM.brackets.find((b) => b.id === id) || null;
}

function formatPrice(amount) {
  return amount.toLocaleString('he-IL') + ' ₪';
}

module.exports = {
  PACKAGES,
  TEAM,
  getTier,
  getTeamBracket,
  formatPrice,
};
