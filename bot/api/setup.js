'use strict';

/**
 * נקודת קצה חד-פעמית להגדרת Green API מתוך רשת Vercel.
 * נדרש כי הגדרת ה-webhook חייבת להתבצע מצד שיש לו גישה ל-Green API.
 *
 * שימוש (מוגן במפתח = ה-apiToken):
 *   GET /api/setup?key=<apiToken>
 *      -> מגדיר webhookUrl לכתובת הנוכחית (/api/webhook) ומפעיל התראות יוצאות.
 *   GET /api/setup?key=<apiToken>&show=1
 *      -> מציג את ההגדרות הנוכחיות בלבד.
 *   GET /api/setup?key=<apiToken>&url=<custom>   -> webhookUrl מותאם.
 */

const { greenapi } = require('../src/runtime');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const key = url.searchParams.get('key');

  if (!greenapi.matchesToken(key)) {
    res.status(401).json({ ok: false, error: 'unauthorized (bad or missing key)' });
    return;
  }

  try {
    if (url.searchParams.get('show')) {
      const settings = await greenapi.getSettings();
      res.status(200).json({ ok: true, settings });
      return;
    }

    const webhookUrl =
      url.searchParams.get('url') || `https://${req.headers.host}/api/webhook`;

    const settings = {
      webhookUrl,
      incomingWebhook: 'yes',
      outgoingMessageWebhook: 'yes', // נדרש לזיהוי "בוט" מהמכשיר של שרון
      outgoingAPIMessageWebhook: 'no', // לא לקבל חזרה את הודעות הבוט (מניעת לולאה)
      stateWebhook: 'no',
      deviceWebhook: 'no',
      markIncomingMessagesReaded: 'no',
    };

    const result = await greenapi.setSettings(settings);
    const after = await greenapi.getSettings();
    res.status(200).json({ ok: true, applied: settings, result, after });
  } catch (e) {
    res.status(500).json({ ok: false, error: e && e.message });
  }
};
