# עובד הבוט הרץ 24/7 (polling) — מתאים ל-Render / Railway / Fly.io / VPS.
FROM node:20-alpine
WORKDIR /app
# אין תלויות חיצוניות — מעתיקים את הקוד בלבד.
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production
# נדרשים משתני סביבה בזמן ריצה: GREENAPI_API_TOKEN (ואופציונלית
# GREENAPI_ID_INSTANCE, BOT_AUTO_REPLY_ALL).
CMD ["node", "src/worker.js"]
