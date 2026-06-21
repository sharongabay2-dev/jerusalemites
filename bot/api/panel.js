'use strict';

/**
 * דף שליטה פרטי לשרון — הפעלה/כיבוי של הבוט per-chat, בלי לשלוח דבר ללקוח.
 * מוגן בסיסמה (PANEL_PASSWORD, ואם לא הוגדר — הטוקן של Green API).
 *
 *   GET  /api/panel                 -> דף ה-HTML
 *   GET  /api/panel?action=list     -> רשימת שיחות אחרונות + מצב הבוט בכל אחת
 *   POST /api/panel {chatId,action} -> action: 'on' (הפעל) | 'off' (עצור)
 *
 * ההפעלה/כיבוי משנים בדיוק את אותו דגל per-chat של "בוט"/"סיום",
 * דרך אותו אחסון מצב (store). אין שליחת הודעה ללקוח.
 */

const { greenapi, store, getDispatcher } = require('../src/runtime');

const PANEL_PASSWORD = process.env.PANEL_PASSWORD || '';

function getPw(req, url) {
  return req.headers['x-panel-pw'] || url.searchParams.get('pw') || '';
}
function authed(req, url) {
  const pw = getPw(req, url);
  if (PANEL_PASSWORD && pw === PANEL_PASSWORD) return true;
  return greenapi.matchesToken(pw); // גיבוי: הטוקן של Green API משמש כסיסמה
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
}

function lastText(m) {
  if (m.textMessage) return m.textMessage;
  if (m.extendedTextMessageData && m.extendedTextMessageData.text) return m.extendedTextMessageData.text;
  return '[' + (m.typeMessage || 'מדיה') + ']';
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const action = url.searchParams.get('action');

  // ── POST: הפעלה/כיבוי ──
  if (req.method === 'POST') {
    if (!authed(req, url)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    const body = await readJson(req);
    const chatId = body.chatId;
    const act = body.action;
    if (!chatId || !['on', 'off'].includes(act)) {
      return res.status(400).json({ ok: false, error: 'bad request' });
    }
    if (act === 'on') {
      // הפעלה: שולח מיד את הודעת הפתיחה ומתחיל את הזרימה (כמו "בוט").
      await getDispatcher().activate(chatId);
    } else {
      await getDispatcher().deactivate(chatId);
    }
    return res.status(200).json({ ok: true, chatId, active: act === 'on' });
  }

  // ── GET ?action=list: רשימת שיחות ──
  if (action === 'list') {
    if (!authed(req, url)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const minutes = Number(url.searchParams.get('minutes')) || 4320; // 3 ימים
      const msgs = await greenapi.lastIncomingMessages(minutes);
      const byChat = new Map();
      for (const m of msgs || []) {
        if (!m.chatId || !m.chatId.endsWith('@c.us')) continue; // שיחות אישיות בלבד (לא קבוצות)
        const prev = byChat.get(m.chatId);
        if (!prev || (m.timestamp || 0) >= (prev.timestamp || 0)) byChat.set(m.chatId, m);
      }
      const chats = [];
      for (const m of byChat.values()) {
        const s = await store.get(m.chatId);
        chats.push({
          chatId: m.chatId,
          name: m.senderName || m.chatName || m.chatId.replace('@c.us', ''),
          phone: m.chatId.replace('@c.us', ''),
          text: lastText(m),
          timestamp: m.timestamp || 0,
          active: !!(s && s.active),
        });
      }
      chats.sort((a, b) => b.timestamp - a.timestamp);
      return res.status(200).json({ ok: true, store: store.backend, chats });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e && e.message, store: store.backend });
    }
  }

  // ── GET: דף HTML ──
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.statusCode = 200;
  res.end(PAGE);
};

const PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>שליטת בוט — שרון גבאי</title>
<style>
  :root{--bg:#0f1115;--card:#1b1f27;--line:#2a2f3a;--txt:#eef1f5;--dim:#9aa3b2;--green:#1db954;--red:#e0364f;--blue:#3b82f6}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--txt)}
  header{position:sticky;top:0;background:#12151b;border-bottom:1px solid var(--line);padding:14px 16px;display:flex;align-items:center;gap:10px}
  header h1{font-size:18px;margin:0;flex:1}
  button{font-family:inherit;font-size:15px;border:0;border-radius:10px;padding:10px 14px;cursor:pointer}
  .refresh{background:var(--blue);color:#fff}
  .wrap{max-width:680px;margin:0 auto;padding:14px}
  .warn{background:#3a2a12;border:1px solid #6b4f1d;color:#f1d59a;padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
  .top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .name{font-weight:700;font-size:16px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .badge{font-size:12px;padding:3px 9px;border-radius:999px}
  .on{background:rgba(29,185,84,.18);color:#5be38a}
  .off{background:rgba(154,163,178,.16);color:var(--dim)}
  .phone{color:var(--dim);font-size:13px;direction:ltr;text-align:right}
  .msg{color:var(--dim);font-size:14px;margin:8px 0 12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .actions{display:flex;gap:10px}
  .actions button{flex:1}
  .start{background:var(--green);color:#04210f;font-weight:700}
  .stop{background:var(--red);color:#fff;font-weight:700}
  .muted{opacity:.45;pointer-events:none}
  .empty{color:var(--dim);text-align:center;padding:40px 0}
  #login{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:24px}
  #login input{font-size:16px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--txt);width:100%;max-width:320px;direction:ltr;text-align:center}
  #login button{background:var(--blue);color:#fff;width:100%;max-width:320px}
  .hint{color:var(--dim);font-size:13px;text-align:center;max-width:320px}
  .toast{position:fixed;bottom:18px;right:50%;transform:translateX(50%);background:#222831;border:1px solid var(--line);padding:10px 16px;border-radius:10px;opacity:0;transition:.2s}
  .toast.show{opacity:1}
</style>
</head>
<body>
<div id="login">
  <h2>שליטת בוט — שרון גבאי</h2>
  <input id="pw" type="password" placeholder="סיסמה" autocomplete="current-password">
  <button onclick="savePw()">כניסה</button>
  <div class="hint">הסיסמה היא הטוקן של Green API, או PANEL_PASSWORD אם הוגדר.</div>
</div>

<div id="app" style="display:none">
  <header>
    <h1>שיחות אחרונות</h1>
    <button class="refresh" onclick="load()">רענון</button>
  </header>
  <div class="wrap">
    <div id="warn" class="warn" style="display:none"></div>
    <div id="list"></div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
const $ = (s)=>document.querySelector(s);
let PW = localStorage.getItem('panelPw') || '';

function savePw(){ PW = $('#pw').value.trim(); localStorage.setItem('panelPw', PW); init(); }
function logout(){ localStorage.removeItem('panelPw'); location.reload(); }
function toast(t){ const el=$('#toast'); el.textContent=t; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),1600); }

async function api(path, opts={}){
  opts.headers = Object.assign({'x-panel-pw':PW,'Content-Type':'application/json'}, opts.headers||{});
  const r = await fetch(path, opts);
  if(r.status===401){ throw new Error('unauthorized'); }
  return r.json();
}

function esc(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function card(c){
  const badge = c.active ? '<span class="badge on">בוט פעיל</span>' : '<span class="badge off">כבוי</span>';
  return \`<div class="card" data-chat="\${esc(c.chatId)}">
    <div class="top"><div class="name">\${esc(c.name)}</div>\${badge}</div>
    <div class="phone">\${esc(c.phone)}</div>
    <div class="msg">\${esc(c.text)}</div>
    <div class="actions">
      <button class="start \${c.active?'muted':''}" onclick="toggle('\${esc(c.chatId)}','on')">הפעל בוט</button>
      <button class="stop \${c.active?'':'muted'}" onclick="toggle('\${esc(c.chatId)}','off')">עצור בוט</button>
    </div>
  </div>\`;
}

async function load(){
  try{
    const d = await api('/api/panel?action=list');
    if(!d.ok){ $('#list').innerHTML='<div class="empty">שגיאה בטעינת שיחות: '+esc(d.error||'')+'</div>'; }
    else{
      $('#warn').style.display = d.store==='memory' ? 'block':'none';
      if(d.store==='memory') $('#warn').textContent='שים לב: אחסון זמני (memory). לשליטה אמינה חברו Vercel KV — אחרת המצב עלול לא להישמר בין השרתים.';
      $('#list').innerHTML = d.chats.length ? d.chats.map(card).join('') : '<div class="empty">אין שיחות אחרונות.</div>';
    }
  }catch(e){
    if(e.message==='unauthorized'){ toast('סיסמה שגויה'); logout(); }
    else $('#list').innerHTML='<div class="empty">שגיאה: '+esc(e.message)+'</div>';
  }
}

async function toggle(chatId, action){
  try{
    const d = await api('/api/panel',{method:'POST',body:JSON.stringify({chatId,action})});
    if(d.ok){ toast(action==='on'?'הבוט הופעל':'הבוט נעצר'); load(); }
    else toast('שגיאה');
  }catch(e){ toast(e.message==='unauthorized'?'סיסמה שגויה':'שגיאה'); }
}

function init(){
  if(!PW){ $('#login').style.display='flex'; $('#app').style.display='none'; return; }
  $('#login').style.display='none'; $('#app').style.display='block';
  load();
}
init();
</script>
</body>
</html>`;
