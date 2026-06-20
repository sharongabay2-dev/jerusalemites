'use strict';

/**
 * מחירון העסק — מקור אמת יחיד למחירים, מספר תמונות וסטים.
 * כל שינוי מחיר עתידי נעשה כאן בלבד.
 *
 * שני מיקומים: 'studio' (בסטודיו) ו-'onsite' (אצל הלקוח).
 * שלוש חבילות: 'base', 'standard', 'premium'.
 */

const PACKAGES = {
  studio: {
    label: 'בסטודיו',
    tiers: {
      base: {
        id: 'base',
        label: 'בסיס',
        price: 1250,
        photos: 5,
        sets: 2,
        recommended: false,
      },
      standard: {
        id: 'standard',
        label: 'סטנדרט',
        price: 1850,
        photos: 10,
        sets: 4,
        recommended: true,
      },
      premium: {
        id: 'premium',
        label: 'פרימיום',
        price: 2600,
        photos: 15,
        sets: 6,
        recommended: false,
      },
    },
  },
  onsite: {
    // אצל הלקוח — כולל הקמת סטודיו מלא בשטח, תוצאה זהה לסטודיו.
    label: 'אצל הלקוח (כולל הקמת סטודיו מלא, תוצאה זהה)',
    tiers: {
      base: {
        id: 'base',
        label: 'בסיס',
        price: 2600,
        photos: 5,
        sets: 2,
        recommended: false,
      },
      standard: {
        id: 'standard',
        label: 'סטנדרט',
        price: 3400,
        photos: 10,
        sets: 4,
        recommended: true,
      },
      premium: {
        id: 'premium',
        label: 'פרימיום',
        price: 4200,
        photos: 15,
        sets: 6,
        recommended: false,
      },
    },
  },
};

// תמחור צוות עובדים — טווח לאדם (הצעת מחיר מדויקת נסגרת מול שרון).
const TEAM_PER_PERSON = { min: 400, max: 690 };

// מה שכל חבילה כוללת (מוצג ללקוח).
const PACKAGE_INCLUDES = [
  'שיחת אפיון לפני הצילום',
  'כל חומר הגלם מהצילום',
  'עריכה מקצועית של התמונות הנבחרות',
];

function getTier(location, tierId) {
  const loc = PACKAGES[location];
  if (!loc) return null;
  return loc.tiers[tierId] || null;
}

function formatPrice(amount) {
  return amount.toLocaleString('he-IL') + ' ₪';
}

module.exports = {
  PACKAGES,
  TEAM_PER_PERSON,
  PACKAGE_INCLUDES,
  getTier,
  formatPrice,
};
