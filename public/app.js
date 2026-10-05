import { connect } from './ws.js';

const $ = (id) => document.getElementById(id);

if (navigator.userAgent.includes('OBS')) {
  const warn = document.createElement('div');
  warn.className = 'warn';
  warn.textContent = 'This dashboard is for the streamer only. Remove it from OBS now.';
  document.body.replaceChildren(warn);
} else {
  init();
}

async function api(path, method = 'GET', body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return res.json();
}

async function init() {
  let active;
  try {
    active = await api('/sessions/active');
  } catch {
    location.replace('/setup.html');
    return;
  }
  const session = await api(`/sessions/${active.id}`);
  let paused = false;
  $('app').hidden = false;
  $('title').textContent = `${session.title} · ${session.category}`;

  const chat = $('chat');
  const rendered = new Map();

  function render(msg) {
    let el = rendered.get(msg.id);
    if (!el) {
      el = document.createElement('div');
      el.addEventListener('click', () => ack(msg.id));
      rendered.set(msg.id, el);
      const stick = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
      chat.append(el);
      if (stick) chat.scrollTop = chat.scrollHeight;
    }
    el.className = `msg ${msg.kind}${msg.acknowledged_at ? ' acked' : ''}`;
    el.style.setProperty('--c', msg.persona_color);
    const badge = Object.assign(document.createElement('span'), { className: 'sim', textContent: 'SIM' });
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: msg.persona_name });
    const text = Object.assign(document.createElement('span'), { textContent: msg.text });
    if (msg.kind === 'question') text.classList.add('q');
    el.replaceChildren(badge, name, text);
  }

  async function ack(id) {
    render(await api(`/messages/${id}/ack`, 'POST'));
  }

  function applyStatus(s) {
    paused = s.paused;
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    $('rate').value = s.rate;
    if (document.activeElement !== $('topic')) $('topic').value = s.topic;
    if (s.ended) location.replace('/setup.html');
  }

  (await api(`/sessions/${active.id}/messages`)).forEach(render);
  chat.scrollTop = chat.scrollHeight;
  applyStatus(session);
  connect(active.id, ({ type, data }) => {
    if (type === 'message') render(data);
    else if (type === 'status') applyStatus(data);
  });

  const patch = (body) => api(`/sessions/${active.id}`, 'PATCH', body).then(applyStatus);
  $('topic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') patch({ topic: e.target.value }).then(() => e.target.blur());
  });
  $('rate').addEventListener('change', (e) => patch({ rate: e.target.value }));
  $('pause').addEventListener('click', () => patch({ paused: !paused }));
  $('end').addEventListener('click', async () => {
    if (confirm('End this session?')) {
      await api(`/sessions/${active.id}/end`, 'POST');
      location.replace('/setup.html');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Space') { e.preventDefault(); patch({ paused: !paused }); }
    if (e.key.toLowerCase() === 't') { e.preventDefault(); $('topic').focus(); }
  });

  setInterval(() => {
    const s = Math.floor((Date.now() - session.started_at) / 1000);
    const p = (n) => String(n).padStart(2, '0');
    $('timer').textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }, 1000);
}
