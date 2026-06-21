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

const { greenapi, calendar, store } = require('../src/runtime');

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

    // אבחון: אילו משתני סביבה רלוונטיים (KV/Upstash/Redis) קיימים בפועל (שמות בלבד).
    if (url.searchParams.get('check') === 'env') {
      const { presentEnvNames } = require('../src/state-store');
      res.status(200).json({ ok: true, backend: store.backend, envNames: presentEnvNames() });
      return;
    }

    // אבחון: היסטוריית webhooks אחרונים (מבנה מלא, ללא קיצוץ לוגים).
    if (url.searchParams.get('check') === 'debug') {
      const events = (await store.get('debug:events')) || [];
      res.status(200).json({ ok: true, count: events.length, events });
      return;
    }
    if (url.searchParams.get('check') === 'debugclear') {
      await store.del('debug:events');
      res.status(200).json({ ok: true, cleared: true });
      return;
    }

    // בדיקת אחסון: כתיבה+קריאה דרך ה-store המשותף (KV בפרודקשן).
    if (url.searchParams.get('check') === 'store') {
      const k = '__selftest__' + Date.now();
      const val = { active: true, brain: null, t: Date.now() };
      await store.set(k, val);
      const readBack = await store.get(k);
      await store.del(k);
      const ok = !!(readBack && readBack.active === true && readBack.t === val.t);
      res.status(200).json({ ok, backend: store.backend, wrote: val, read: readBack });
      return;
    }

    // בדיקת חיבור היומן: קריאת זמינות אמיתית (גוגל בפרודקשן).
    if (url.searchParams.get('check') === 'calendar') {
      try {
        const slots = await calendar.proposeStudioSlots('standard');
        res.status(200).json({
          ok: true,
          backend: calendar.backend,
          slotsCount: slots.length,
          sample: slots.slice(0, 3).map((s) => ({ date: s.dateKey, start: s.startLabel, end: s.endLabel })),
        });
      } catch (e) {
        res.status(200).json({ ok: false, backend: calendar.backend, error: e && e.message });
      }
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
