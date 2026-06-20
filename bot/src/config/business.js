'use strict';

/**
 * פרטי העסק וטקסטים שניתן לערוך בקלות.
 *
 * >>> שרון: ודאו שהקישורים נכונים <<<
 * אם הכתובות שונות באתר — עדכנו כאן (או דרך משתני סביבה PORTFOLIO_URL / REVIEWS_URL).
 */

module.exports = {
  studioAddress: 'רחוב כליל החורש 279, מושב נס הרים',
  studioShortLocation: 'מושב נס הרים',

  // קישורים שמוצגים בפתיחה. ניתן לעקוף עם משתני סביבה.
  portfolioUrl: process.env.PORTFOLIO_URL || 'https://www.sharongabay.com/portfolio',
  reviewsUrl: process.env.REVIEWS_URL || 'https://www.sharongabay.com/reviews',

  // מדיניות ביטולים (מוצגת באישור ההזמנה).
  cancellationPolicy: [
    'התראה של 7 ימים ומעלה — ללא תשלום',
    'בין 48 שעות ל-7 ימים — 25% ממחיר העבודה המלא',
    'פחות מ-48 שעות — 50% ממחיר העבודה המלא',
  ],
};
