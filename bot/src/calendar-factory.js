'use strict';

/**
 * בחירת היומן בזמן ריצה: יומן גוגל אמיתי אם הוגדרו ההרשאות, אחרת יומן בדיקה.
 * כך הבוט עובד גם בלי יומן גוגל, והיומן האמיתי נכנס אוטומטית כשמחברים אותו.
 */

const { MockCalendar } = require('./calendar');
const { googleConfigured, createGoogleCalendar } = require('./integrations/google-calendar');

function createCalendar(logger = console) {
  if (googleConfigured()) {
    if (logger.log) logger.log('[calendar] יומן גוגל פעיל');
    return createGoogleCalendar();
  }
  return new MockCalendar(new Date());
}

module.exports = { createCalendar };
