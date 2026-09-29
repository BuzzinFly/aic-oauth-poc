import { publishConfig, exportConfig, loadConfig, getConfig, saveConfig, resetConfig, shareLink, effective, isConfigured, getServerInfo, DEFAULT_CARD_SCOPES } from './config.js';
import { log, getEntries, clearLog, subscribe, maskDeep, toCurl } from './inspector.js';
import * as oauth from './oauth.js';
import * as api from './api.js';
import { setLang, t, applyStatic } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const S = { timers: [], mask: true, live: null, map: null, layer: null };

/* ---------------------------------------------------------------- helpers */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const svg = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
const ICON = {
  user: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="5"/><path d="M2 22c0-5.5 4-9 10-9s10 3.5 10 9z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h10v4h-2V5H5v14h6v-2h2v4H3z"/><path d="M14 7l5 5-5 5v-3H8v-4h6z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l8 8 8-8"/></svg>',
  mac: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zm6 14h6l1 2H8z"/></svg>',
  up: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 10h4v11H2zm6 11V10l4-8c1.5 0 2.5 1 2 3l-1 4h6a2 2 0 012 2.3l-1.4 8A2 2 0 0117.6 21z"/></svg>',
  down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2 3h4v11H2zm6 0v11l4 8c1.5 0 2.5-1 2-3l-1-4h6a2 2 0 002-2.3l-1.4-8A2 2 0 0017.6 3z"/></svg>',
};

let toastTimer;
function toast(msg, err = false) {
  const el = $('#toast'); el.textContent = msg; el.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, err ? 6000 : 3000);
}
async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = h('textarea', {}, text); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(label);
}
const fmtDate = x => { if (x == null) return ''; const d = new Date(typeof x === 'string' && /^\d+$/.test(x) ? +x : x); return isNaN(d) ? String(x) : d.toLocaleString('en-GB', { hour12: false }).replace(',', ''); };
const once = fn => { let p; return () => (p ||= fn()); };

/* ---------------------------------------------------------------- JSON tree */
function prim(v) {
  if (v === null) return h('span', { class: 'z' }, 'null');
  if (typeof v === 'string') return h('span', { class: 's' }, JSON.stringify(v));
  if (typeof v === 'number') return h('span', { class: 'n' }, String(v));
  return h('span', { class: 'b' }, String(v));
}
function jnode(key, v, depth) {
  const k = key != null ? [h('span', { class: 'k' }, key + ': ')] : [];
  if (v !== null && typeof v === 'object') {
    const arr = Array.isArray(v);
    const d = h('details', {}, h('summary', {}, ...k, arr ? '[' : '{'));
    if (depth < 3) d.open = true;
    Object.entries(v).forEach(([kk, vv]) => d.append(jnode(arr ? null : kk, vv, depth + 1)));
    d.append(h('div', { class: 'l' }, arr ? ']' : '}'));
    return d;
  }
  return h('div', { class: 'l' }, ...k, prim(v));
}
const jsonTree = v => h('div', { class: 'jt' }, jnode(null, v, 0));

function kvTable(obj, { skip = [] } = {}) {
  const rows = Object.entries(obj || {}).filter(([k]) => !skip.includes(k)).map(([k, v]) =>
    h('tr', {}, h('td', {}, k), h('td', {}, v !== null && typeof v === 'object' ? jsonTree(v) : String(v))));
  return h('table', { class: 'kv' }, h('thead', {}, h('tr', {}, h('th', {}, t('field')), h('th', {}, t('value')))), h('tbody', {}, rows));
}

/* ---------------------------------------------------------------- theme / lang */
function applyTheme() {
  const c = getConfig();
  document.body.dataset.theme = c.theme === 'bank' ? 'bank' : 'regional';
  document.title = c.theme === 'bank' ? 'Meridian Bank' : 'Caja Vega Verde';
  setLang(c.lang); applyStatic();
  $('#insp-tab')?.toggleAttribute('hidden', !c.showInspectorTab);
}
function setTheme(theme) { saveConfig({ theme }); applyTheme(); if (!$('#drawer').hidden) buildDrawer(); }

/* ---------------------------------------------------------------- auth slots */
function displayName() {
  const tok = oauth.getTokens();
  const c = tok?.id_token ? oauth.decodeJwt(tok.id_token)?.payload : null;
  return S.userinfo?.given_name || S.userinfo?.name || c?.given_name || c?.name || c?.sub?.slice(0, 8) || 'User';
}
function renderAuthSlots() {
  document.querySelectorAll('.auth-slot').forEach(slot => {
    slot.replaceChildren();
    if (!oauth.isAuthed()) { slot.append(h('button', { class: 'btn btn-primary', 'data-action': 'login' }, t('login'))); return; }
    const menu = h('div', { class: 'menu', hidden: true },
      h('a', { href: '#/session' }, svg(ICON.user), t('mySession')),
      h('button', { 'data-action': 'logout' }, svg(ICON.out), t('logout')));
    const btn = h('button', { class: 'user-btn', onclick: e => { e.stopPropagation(); menu.hidden = !menu.hidden; } }, displayName(), svg(ICON.chev));
    slot.append(h('div', { class: 'usermenu' }, btn, menu));
  });
}
document.addEventListener('click', e => {
  document.querySelectorAll('.menu').forEach(m => { m.hidden = true; });
  const a = e.target.closest('[data-action]'); if (!a) return;
  if (a.dataset.action === 'login') { e.preventDefault(); oauth.isAuthed() ? (location.hash = '#/session') : doLogin(); }
  if (a.dataset.action === 'logout') { e.preventDefault(); stopLive(); oauth.logout(getConfig()); }
});

async function doLogin(opts) {
  const c = getConfig();
  if (!isConfigured(c)) { toast('Configure tenant URL and client ID first (bottom-left dot)', true); openDrawer(); return; }
  try { await oauth.login(c, opts); } catch (e) { toast('Login failed: ' + e.message, true); }
}

/* ---------------------------------------------------------------- routing */
function route() {
  const showApp = oauth.isAuthed() && location.hash === '#/session';
  document.body.classList.toggle('authed', showApp);
  $('#app').hidden = !showApp;
  if (showApp) renderApp(); else { cleanup(); }
  renderAuthSlots();
}
function cleanup() { S.timers.forEach(clearInterval); S.timers = []; stopLive(); if (S.map) { S.map.remove(); S.map = null; } }

/* ---------------------------------------------------------------- cards */
function makeCard(title, icon, cls = '') {
  const body = h('div', { class: 'body' });
  return { el: h('section', { class: 'card ' + cls }, h('h2', {}, h('span', {}, title), h('span', { class: 'ico' }, icon || '')), body), body };
}
function lockedView(req) {
  return h('div', { class: 'lock' },
    h('div', {}, `🔒 ${t('requiresScope')} `, h('code', {}, req), ` — ${t('notGranted')}`),
    h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn btn-line btn-sm', onclick: () => doLogin({ extraScopes: req }) }, t('requestScope'))));
}
function errView(e, retry) {
  let hint = '';
  if (e.status === 401 || e.status === 403) hint = 'AM REST endpoints (sessions, devices, apps) normally authenticate with the SSO session cookie (iPlanetDirectoryPro), not only an OAuth bearer. Try API auth = "Bearer + cookie" and make sure the app and tenant share a cookie domain (or third-party cookies are allowed). See the flow inspector for the raw response.';
  else if (e.status === 404) hint = 'Endpoint not found — check realm and tenant URL.';
  else if (!e.status) hint = 'Network/CORS error — add this origin under Tenant settings → Global Settings → CORS, or enable the server proxy.';
  return h('div', {}, h('div', { class: 'state err' }, `${e.message}`, hint && h('small', {}, hint)),
    retry && h('button', { class: 'btn btn-line btn-sm', style: 'margin-top:10px', onclick: retry }, t('retry')));
}
async function fill(card, key, fn) {
  const c = effective(getConfig());
  const req = c.scopeGating ? c.cardScopesMap[key] : '';
  if (req && !oauth.hasScope(req)) { card.body.replaceChildren(lockedView(req)); return; }
  card.body.replaceChildren(h('div', { class: 'state' }, t('loading')));
  try { card.body.replaceChildren(await fn()); } catch (e) { card.body.replaceChildren(errView(e, () => fill(card, key, fn))); }
}

/* ---------------------------------------------------------------- dashboard */
function renderApp() {
  cleanup();
  const app = $('#app'); app.replaceChildren();
  const cfg = getConfig();
  const tok = oauth.getTokens();
  const idc = tok?.id_token ? oauth.decodeJwt(tok.id_token)?.payload : {};

  const userinfoP = once(() => api.fetchUserinfo(cfg).then(r => { if (!r.ok) { const e = new Error(`userinfo: HTTP ${r.status}`); e.status = r.status; throw e; } return r.json; }));
  const subP = once(async () => idc?.sub || (await userinfoP()).sub);
  const profilesP = once(async () => api.fetchProfiles(cfg, await subP()));

  const title = h('h1', {}, `${t('welcome')} ${displayName()}`);
  app.append(title);
  userinfoP().then(u => { S.userinfo = u; title.textContent = `${t('welcome')} ${displayName()}`; renderAuthSlots(); }).catch(() => {});

  // profile + session
  const cProfile = makeCard(t('profileData'), '≡'), cSession = makeCard(t('sessionData'), '👤');
  app.append(h('div', { class: 'grid g13' }, cProfile.el, cSession.el));
  fill(cProfile, 'profile', async () => kvTable(await userinfoP()));
  fill(cSession, 'session', async () => {
    const r = await api.fetchSession(cfg);
    return h('div', {}, r.source !== 'AM session API' && h('div', { class: 'muted small', style: 'margin-bottom:8px' }, 'ⓘ ' + r.source), kvTable(r.data));
  });

  // token & scopes
  app.append(tokenCard(cfg, tok));

  // apps + devices
  const cApps = makeCard(t('authorizedApps'), '✓'), cDev = makeCard(t('authDevices'), '▯');
  app.append(h('div', { class: 'grid g2' }, cApps.el, cDev.el));
  const loadApps = () => fill(cApps, 'apps', async () => {
    const sub = await subP(), apps = await api.fetchApps(cfg, sub);
    if (!apps.length) return h('div', { class: 'state' }, t('none'));
    return h('div', {}, apps.map(a => {
      const sc = Array.isArray(a.scopes) ? a.scopes : Object.keys(a.scopes || {});
      return h('div', { class: 'box' },
        h('div', { style: 'display:flex;justify-content:space-between;gap:10px' },
          h('div', { class: 'lbl' }, `${t('sharing')}${a.name ? ' ' + a.name : ''}`),
          h('button', { class: 'btn btn-line btn-sm', onclick: async () => { if (!confirm(t('confirmRemove'))) return; try { await api.deleteApp(cfg, sub, a._id || a.name); toast('OK'); loadApps(); } catch (e) { toast(e.message, true); } } }, t('remove'))),
        h('div', { class: 'chips' }, sc.map(s => h('span', { class: 'chip' }, s))),
        h('div', { class: 'exp' }, `${t('expires')} ${a.expiryDateTime ? fmtDate(a.expiryDateTime) : ''}`));
    }));
  });
  loadApps();
  const loadDevices = () => fill(cDev, 'devices', async () => {
    const sub = await subP();
    const groups = await Promise.all(api.DEVICE_TYPES.map(async d => ({ d, items: await api.fetchDevices(cfg, sub, d.key).catch(e => { if (e.status === 404) return []; throw e; }) })));
    return h('div', {}, groups.map(({ d, items }) => h('div', {},
      h('h3', {}, d.title),
      items.length ? items.map(it => {
        const id = it.uuid || it._id;
        return h('div', { class: 'item' }, h('div', {}, h('span', { class: 'nm' }, it.deviceName || d.title), h('span', { class: 'id' }, `(${id})`)),
          h('button', { class: 'btn btn-dark', onclick: async () => { if (!confirm(t('confirmRemove'))) return; try { await api.deleteDevice(cfg, sub, d.key, id); toast('OK'); loadDevices(); } catch (e) { toast(e.message, true); } } }, '🗑 ' + t('remove')));
      }) : h('div', { class: 'muted small' }, t('none')))));
  });
  loadDevices();

  // device profile
  const cDP = makeCard(t('deviceProfile'), '☝');
  app.append(h('div', { class: 'grid' }, cDP.el));
  fill(cDP, 'deviceProfile', async () => {
    const list = (await profilesP()).slice().sort((a, b) => (b.lastSelectedDate || 0) - (a.lastSelectedDate || 0));
    if (!list.length) return h('div', { class: 'state' }, t('none'));
    const holder = h('div', {}, jsonTree(list[0]));
    const sel = h('select', { style: 'max-width:420px;margin-bottom:10px', onchange: () => holder.replaceChildren(jsonTree(list[+sel.value])) },
      list.map((p, i) => h('option', { value: i }, `${p.alias || p.identifier || 'device'} — ${fmtDate(p.lastSelectedDate)}`)));
    return h('div', {}, list.length > 1 && sel, holder);
  });

  // login activity + map
  app.append(activityCard(cfg, subP));

  // IDM + explorer
  const cIdm = makeCard(t('idmProfile'), '⚙');
  app.append(h('div', { class: 'grid' }, cIdm.el));
  fill(cIdm, 'idm', async () => kvTable(await api.fetchIdmUser(cfg, await subP())));
  app.append(explorerCard(cfg, subP));
}

/* ---- token & scopes card */
function tokenCard(cfg, tok) {
  const c = effective(cfg);
  const granted = oauth.grantedScopes();
  const requested = c.scopes.split(/\s+/).filter(Boolean);
  const missing = requested.filter(s => !oauth.hasScope(s, granted));
  const left = h('b', {});
  const tick = () => { const s = Math.max(0, Math.round((tok.expires_at - Date.now()) / 1000)); left.textContent = tok.expires_at ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'n/a'; };
  tick(); S.timers.push(setInterval(tick, 1000));
  const at = tok.access_token, atd = at.split('.').length === 3 ? oauth.decodeJwt(at) : null;
  const idd = tok.id_token && oauth.decodeJwt(tok.id_token);
  const extra = h('input', { placeholder: 'e.g. fr:idc:analytics:*' });
  const card = makeCard(t('tokenScopes'), '🔑');
  card.body.append(
    h('div', { class: 'small muted' }, t('granted')),
    h('div', { class: 'chips', style: 'margin:6px 0 10px' }, granted.length ? granted.map(s => h('span', { class: 'chip g' }, s)) : h('span', { class: 'muted' }, '—')),
    missing.length && h('div', {}, h('div', { class: 'small muted' }, t('missing')), h('div', { class: 'chips', style: 'margin:6px 0 10px' }, missing.map(s => h('span', { class: 'chip miss' }, s)))),
    h('div', { style: 'margin:8px 0 12px' }, `${t('expiresIn')} `, left, tok.refresh_token ? '' : h('span', { class: 'muted small' }, '  · no refresh_token issued')),
    h('div', { style: 'display:grid;grid-template-columns:1fr auto auto;gap:8px;max-width:760px' }, extra,
      h('button', { class: 'btn btn-line', onclick: () => doLogin({ extraScopes: extra.value }) }, t('stepUp')),
      h('button', { class: 'btn btn-line', disabled: !tok.refresh_token, onclick: async () => { try { await oauth.refresh(getConfig()); toast('Token refreshed'); renderApp(); } catch (e) { toast(e.message, true); } } }, t('refreshToken'))),
    h('details', { style: 'margin-top:14px' }, h('summary', { style: 'cursor:pointer' }, 'Access token / ID token'),
      h('div', { style: 'margin-top:8px' }, h('div', { class: 'small muted' }, 'access_token ' + (atd ? '(JWT)' : '(opaque)')), h('code', { style: 'word-break:break-all;display:block;margin:4px 0' }, at.length > 140 ? at.slice(0, 140) + '…' : at),
        h('button', { class: 'btn btn-line btn-sm', onclick: () => copy(at) }, 'Copy'), atd && jsonTree(atd),
        idd && [h('div', { class: 'small muted', style: 'margin-top:12px' }, 'id_token claims'), jsonTree(idd)])));
  return h('div', { class: 'grid' }, card.el);
}

/* ---- login activity + map */
const num = v => (v === null || v === '' || v === 'null' || !isFinite(v)) ? null : +v;
function activityCard(cfg, subP) {
  const list = h('div', { class: 'state' }, t('loading'));
  const mapEl = h('div', { id: 'map' });
  const liveBtn = h('button', { class: 'btn btn-dark', onclick: () => (S.live ? stopLive() : startLive()) }, t('watchLive'));
  S.liveBtn = liveBtn;
  const trustBtn = h('button', { class: 'btn btn-dark', onclick: () => {
    const j = getConfig().trustJourney;
    if (!j) { toast('Set "Trust-device journey" in the config panel (bottom-left dot)', true); return; }
    doLogin({ journey: j });
  } }, t('trustDevice'));
  const clearBtn = h('button', { class: 'link-u', onclick: async () => {
    if (!confirm(t('confirmRemove'))) return;
    try { await api.clearLoginHistory(cfg, await subP()); refresh(); } catch (e) { toast(e.message, true); }
  } }, t('clear'));
  const state = { logins: [], trusted: [] };

  async function refresh() {
    const c = effective(cfg);
    if (c.scopeGating && !oauth.hasScope(c.cardScopesMap.activity)) { list.className = ''; list.replaceChildren(lockedView(c.cardScopesMap.activity)); return; }
    try {
      const sub = await subP();
      const { logins, trusted } = await api.fetchLoginActivity(cfg, sub);
      state.logins = logins.sort((a, b) => (b.lastSelectedDate || 0) - (a.lastSelectedDate || 0)); state.trusted = trusted;
      drawList(sub); drawMap();
    } catch (e) { list.className = ''; list.replaceChildren(errView(e, refresh)); }
  }
  const devName = l => `${l.device.metadata?.platform?.deviceName || 'Device'} ${typeof l.device.metadata?.browser === 'string' ? l.device.metadata.browser : ''}`.trim();
  function drawList(sub) {
    const trustedIds = new Set(state.trusted.map(x => x.identifier));
    list.className = '';
    list.replaceChildren(...(state.logins.length ? state.logins.map(l => {
      const id = l.device.identifier, isT = trustedIds.has(id);
      return h('div', { class: 'act-row' }, svg(ICON.mac), h('div', { title: id }, devName(l)), h('div', { class: 'when' }, fmtDate(l.lastSelectedDate || l.date)),
        h('div', { class: 'tr' + (isT ? '' : ' un') }, isT ? t('trusted') : t('untrusted'), svg(isT ? ICON.up : ICON.down),
          isT && h('button', { class: 'trash', title: t('removeTrusted'), onclick: async () => { if (!confirm(t('confirmRemoveTrusted'))) return; try { await api.removeTrustedDevice(cfg, sub, id); toast('OK'); refresh(); } catch (e) { toast(e.message, true); } } }, '🗑')));
    }) : [h('div', { class: 'state' }, t('none'))]));
  }
  function drawMap() {
    if (!window.L) return;
    if (!S.map) {
      S.map = L.map(mapEl, { worldCopyJump: true }).setView([40, -3], 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(S.map);
      S.layer = L.layerGroup().addTo(S.map);
    }
    S.layer.clearLayers();
    const pts = [];
    state.logins.forEach(l => {
      const la = num(l.location?.latitude), lo = num(l.location?.longitude);
      if (la == null || lo == null) return;
      pts.push([la, lo]);
      L.marker([la, lo]).addTo(S.layer).bindPopup(`${devName(l)}<br>${fmtDate(l.lastSelectedDate || l.date)}`);
    });
    if (pts.length) S.map.fitBounds(pts, { maxZoom: 10, padding: [30, 30] });
    setTimeout(() => S.map.invalidateSize(), 50);
  }
  S.refreshActivity = refresh;
  setTimeout(refresh, 0);

  return h('div', { class: 'grid' }, h('section', { class: 'card flat', style: 'border-left:0' },
    h('h2', {}, 'Login Activity'),
    h('div', { class: 'grid g2', style: 'margin:0' },
      h('div', {}, h('div', { class: 'head-row' }, h('div', { class: 'muted' }, t('reviewActivity'), ' (', clearBtn, ')'), trustBtn), h('div', { class: 'box scroll', style: 'padding:6px' }, list)),
      h('div', {}, h('div', { class: 'head-row' }, h('div', { class: 'muted' }, t('seeWhere')), liveBtn), mapEl))));
}
function startLive() { S.liveBtn.textContent = t('stopLive') + ' ●'; S.live = setInterval(() => S.refreshActivity?.(), 5000); S.refreshActivity?.(); }
function stopLive() { if (S.live) { clearInterval(S.live); S.live = null; } if (S.liveBtn) S.liveBtn.textContent = t('watchLive'); }

/* ---- API explorer */
function explorerCard(cfg, subP) {
  const card = makeCard(t('explorer'), '⌘');
  const c = effective(cfg);
  const method = h('select', {}, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => h('option', {}, m)));
  const url = h('input', { placeholder: 'https://tenant/am/json/…' });
  const auth = h('select', { style: 'max-width:220px' }, h('option', { value: 'oauth' }, 'Bearer only'), h('option', { value: 'am' }, 'Per config (API auth mode)'), h('option', { value: 'none' }, 'No credentials'));
  const ver = h('input', { placeholder: 'Accept-API-Version e.g. resource=1.0' });
  const body = h('textarea', { placeholder: 'Request body (JSON) — optional' });
  const out = h('div');
  const preset = h('select', {}, h('option', { value: '' }, '— presets —'));
  subP().then(sub => {
    const e = api.endpoints(cfg, sub);
    const P = [
      ['userinfo', 'GET', e.userinfo, 'oauth', ''],
      ['session info', 'POST', e.sessionInfo, 'am', 'resource=4.0'],
      ['authorized apps', 'GET', e.apps, 'am', 'resource=1.0'],
      ['push devices', 'GET', e.devices('push'), 'am', 'resource=1.0'],
      ['device profiles', 'GET', e.profiles, 'am', 'resource=1.0'],
      ['trusted devices', 'GET', e.trusted, 'am', 'resource=1.0'],
      ['IDM managed user', 'GET', e.idmUser, 'oauth', ''],
      ['OIDC discovery', 'GET', `${c.tenantUrl}/am/oauth2/${e.rp}/.well-known/openid-configuration`, 'none', ''],
    ];
    P.forEach((p, i) => preset.append(h('option', { value: i }, p[0])));
    preset.onchange = () => { const p = P[+preset.value]; if (!p) return; method.value = p[1]; url.value = p[2]; auth.value = p[3]; ver.value = p[4]; };
  }).catch(() => {});
  const send = async () => {
    out.replaceChildren(h('div', { class: 'state' }, t('loading')));
    try {
      let r;
      if (auth.value === 'none') r = await (await import('./http.js')).request(url.value, { method: method.value, headers: { Accept: 'application/json', ...(ver.value ? { 'Accept-API-Version': ver.value } : {}) }, body: body.value || undefined, label: 'Explorer', useProxy: c.useProxy });
      else r = await api.call(cfg, url.value, { method: method.value, kind: auth.value, version: ver.value || undefined, body: body.value || undefined, label: 'Explorer ' + method.value });
      out.replaceChildren(h('div', { class: 'muted small' }, `HTTP ${r.status} · ${r.ms} ms`), r.json ? h('div', { style: 'margin-top:6px' }, jsonTree(r.json)) : h('pre', { class: 'out' }, r.text));
    } catch (e) { out.replaceChildren(errView(e)); }
  };
  card.body.append(h('div', { class: 'form-row' }, method, url, h('button', { class: 'btn btn-primary', onclick: send }, t('send'))),
    h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px' }, preset, auth, ver), body, out);
  return h('div', { class: 'grid' }, card.el);
}

/* ---------------------------------------------------------------- inspector */
function buildInspector() {
  const el = $('#inspector');
  const list = h('div', { class: 'ib' });
  const maskCb = h('input', { type: 'checkbox', onchange: () => { S.mask = maskCb.checked; paint(); } }); maskCb.checked = S.mask;
  el.replaceChildren(
    h('div', { class: 'ih' }, h('b', {}, 'OAuth2 flow inspector'), h('label', {}, maskCb, 'Mask tokens'),
      h('button', { onclick: () => { clearLog(); } }, 'Clear'),
      h('button', { onclick: () => { const b = new Blob([JSON.stringify(getEntries(), null, 2)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: 'oauth-flow-log.json' }); a.click(); } }, 'Download'),
      h('button', { onclick: () => toggleInspector(false) }, 'Hide ✕')),
    list);
  function evNode(e) {
    const d = e.detail || {};
    const rest = { ...d }; delete rest.explanation; delete rest.hint; delete rest.request; delete rest.response;
    const pre = v => h('pre', {}, typeof v === 'string' ? v : JSON.stringify(maskDeep(v, S.mask), null, 2));
    const det = h('details', { class: 'ev ' + e.kind }, h('summary', {}, h('time', {}, e.ts.slice(11, 19)), h('span', { class: 'k' }, e.kind), h('span', {}, e.title)));
    if (['flow', 'error'].includes(e.kind)) det.open = true;
    if (d.explanation) det.append(h('div', { class: 'ex' }, d.explanation));
    if (d.hint) det.append(h('div', { class: 'hint' }, '⚠ ' + d.hint));
    if (d.request) {
      const r = d.request;
      det.append(h('h5', {}, 'Request' + (r.viaProxy ? ' (via server proxy)' : '')), pre(`${r.method} ${r.url}\n` + Object.entries(maskDeep(r.headers || {}, S.mask)).map(([k, v]) => `${k}: ${v}`).join('\n') + (r.body ? `\n\n${S.mask ? String(r.body).replace(/(code_verifier|code|refresh_token)=([^&]{12})[^&]*/g, '$1=$2…') : r.body}` : '')));
      det.append(h('button', { onclick: () => copy(toCurl(d), 'curl copied') }, 'Copy as curl'));
    }
    if (d.response) det.append(h('h5', {}, `Response ${d.response.status} · ${d.response.ms} ms`), pre({ headers: d.response.headers, body: d.response.body }));
    if (Object.keys(rest).length) det.append(pre(rest));
    return det;
  }
  function paint() { list.replaceChildren(...getEntries().map(evNode)); if (!getEntries().length) list.append(h('div', { class: 'state' }, 'No events yet. Click Login to start the flow.')); list.scrollTop = list.scrollHeight; }
  paint();
  subscribe(e => { if (e === null) paint(); else { list.querySelector('.state')?.remove(); list.append(evNode(e)); list.scrollTop = list.scrollHeight; } });
}
function toggleInspector(on) {
  const el = $('#inspector'); on = on ?? el.hidden;
  el.hidden = !on; document.body.classList.toggle('inspector-open', on);
}

/* ---------------------------------------------------------------- config drawer */
function openDrawer() { buildDrawer(); $('#drawer').hidden = false; }
function closeDrawer() { $('#drawer').hidden = true; }
function buildDrawer() {
  const d = $('#drawer'), cfg = getConfig(), c = effective(cfg);
  const inp = (key, label, { ph = '', hint = '', type = 'text' } = {}) => {
    const i = h('input', { type, placeholder: ph, value: cfg[key] ?? '', onchange: () => {
      let v = i.value.trim();
      if (key === 'tenantUrl' && v) { try { v = new URL(v).origin; i.value = v; } catch {} }
      saveConfig({ [key]: v }); refreshRuri();
    } });
    return h('div', {}, h('label', {}, label), i, hint && h('div', { class: 'hint' }, hint));
  };
  const chk = (key, label, hint) => { const i = h('input', { type: 'checkbox', onchange: () => { saveConfig({ [key]: i.checked }); applyTheme(); } }); i.checked = !!cfg[key]; return h('label', { class: 'chk' }, i, h('span', {}, label, hint && h('div', { class: 'hint' }, hint))); };
  const ruri = h('div', { class: 'ruri mono' });
  const refreshRuri = () => { const e = effective(getConfig()); ruri.textContent = e.redirectUri; };
  refreshRuri();
  const cardScopes = h('textarea', { onchange: () => { try { JSON.parse(cardScopes.value); saveConfig({ cardScopes: cardScopes.value }); toast('Saved'); } catch { toast('Invalid JSON', true); } } }, JSON.stringify({ ...DEFAULT_CARD_SCOPES, ...(() => { try { return JSON.parse(cfg.cardScopes); } catch { return {}; } })() }, null, 2));
  const apiAuth = h('select', { onchange: () => saveConfig({ apiAuth: apiAuth.value }) }, [['both', 'Bearer + session cookie'], ['bearer', 'Bearer token only'], ['cookie', 'Session cookie only']].map(([v, l]) => h('option', { value: v }, l)));
  apiAuth.value = cfg.apiAuth;
  const lang = h('select', { onchange: () => { saveConfig({ lang: lang.value }); applyTheme(); renderAuthSlots(); if (!$('#app').hidden) renderApp(); } }, h('option', { value: 'es' }, 'Español'), h('option', { value: 'en' }, 'English')); lang.value = cfg.lang;

  d.replaceChildren(
    h('div', { class: 'dh' }, h('h2', {}, 'POC controls'), h('button', { class: 'btn btn-line btn-sm', onclick: closeDrawer }, 'Close ✕')),
    h('div', { class: 'hint' }, 'Shortcuts: Alt+Shift+C config · Alt+Shift+T switch site · Alt+Shift+I inspector'),
    h('h4', {}, 'Landing page'),
    h('div', { class: 'theme-sw' },
      h('button', { class: cfg.theme === 'bank' ? 'on' : '', onclick: () => setTheme('bank') }, 'Generic bank'),
      h('button', { class: cfg.theme !== 'bank' ? 'on' : '', onclick: () => setTheme('regional') }, 'Regional bank')),
    h('label', {}, 'Language'), lang,
    h('h4', {}, 'PingOne Advanced Identity Cloud'),
    inp('tenantUrl', 'Tenant URL', { ph: 'https://openam-xxxx.forgeblocks.com', hint: 'Or your custom domain. Origin only, no /am path.' }),
    inp('realm', 'Realm', { ph: 'alpha' }),
    inp('clientId', 'OAuth 2.0 client ID', { ph: 'poc-web-app' }),
    inp('scopes', 'Scopes (space separated)'),
    h('label', {}, 'Redirect URI to register on the client'), ruri,
    h('div', { class: 'btns', style: 'margin-top:8px' }, h('button', { class: 'btn btn-line btn-sm', onclick: () => copy(effective(getConfig()).redirectUri) }, 'Copy redirect URI')),
    inp('redirectUri', 'Redirect URI override (optional)'),
    inp('postLogoutUri', 'Post-logout redirect URI override (optional)'),
    h('h4', {}, 'Flow options'),
    inp('journey', 'Journey / service (optional)', { ph: 'Login', hint: 'Sent as &service= on the authorize request.' }),
    inp('trustJourney', '“Trust this device” journey', { ph: 'TrustDevice' }),
    inp('acrValues', 'acr_values (optional)'), inp('prompt', 'prompt (optional)', { ph: 'login | none | consent' }),
    chk('singleLogout', 'Logout also ends the AIC session (end_session)'),
    h('h4', {}, 'API access'),
    h('label', {}, 'AM REST authentication (sessions, devices, apps)'), apiAuth,
    chk('useProxy', 'Use this server\'s /proxy for tenant calls (avoids CORS)', getServerInfo().proxyAvailable ? 'Cookie mode always goes direct from the browser.' : 'Proxy not available on this host (static hosting).'),
    chk('scopeGating', 'Enforce scope checks per card (scope-based authorisation)'),
    h('label', {}, 'Required scope per card (JSON)'), cardScopes,
    chk('showInspectorTab', 'Show “Flow inspector” tab'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn btn-primary btn-sm', onclick: async () => { const cc = getConfig(); if (!cc.tenantUrl) { toast('Enter a tenant URL', true); return; } toggleInspector(true); try { const doc = await oauth.discover(cc, { force: true }); toast('Discovery OK: ' + (doc.issuer || 'endpoints resolved')); } catch (e) { toast(e.message, true); } } }, 'Test connection'),
      h('button', { class: 'btn btn-line btn-sm', onclick: () => copy(shareLink(), 'Share link copied') }, 'Copy share link'),
      h('button', { class: 'btn btn-line btn-sm', onclick: () => { const b = new Blob([JSON.stringify(exportConfig(), null, 2)], { type: 'application/json' }); h('a', { href: URL.createObjectURL(b), download: 'config.json' }).click(); } }, 'Download config.json'),
      getServerInfo().adminEnabled && h('button', { class: 'btn btn-primary btn-sm', onclick: async () => {
        let tk = sessionStorage.getItem('aicpoc.admin') || prompt('Admin token (ADMIN_TOKEN on the server)');
        if (!tk) return;
        try { await publishConfig(tk); sessionStorage.setItem('aicpoc.admin', tk); toast('Published: new visitors will use these settings'); } catch (e) { sessionStorage.removeItem('aicpoc.admin'); toast(e.message, true); }
      } }, 'Publish as default for all users'),
      h('button', { class: 'btn btn-line btn-sm', onclick: () => { if (confirm('Reset to server defaults?')) { resetConfig(); location.reload(); } } }, 'Reset')));
}

/* ---------------------------------------------------------------- init */
async function init() {
  await loadConfig();
  applyTheme();

  // inspector tab
  document.body.append(h('button', { id: 'insp-tab', class: 'btn btn-dark btn-sm', style: 'position:fixed;right:14px;bottom:14px;z-index:940;opacity:.85', onclick: () => toggleInspector() }, '{ } Flow inspector'));
  buildInspector();
  applyTheme();

  // hidden triggers
  $('#poc-dot').addEventListener('click', () => ($('#drawer').hidden ? openDrawer() : closeDrawer()));
  let clicks = 0, tm; document.querySelectorAll('[data-logo]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); location.hash = '#/'; clicks++; clearTimeout(tm); tm = setTimeout(() => { clicks = 0; }, 700); if (clicks >= 3) { clicks = 0; openDrawer(); } }));
  document.addEventListener('keydown', e => {
    if (!(e.altKey && e.shiftKey)) return;
    if (e.code === 'KeyT') { e.preventDefault(); setTheme(getConfig().theme === 'bank' ? 'regional' : 'bank'); toast('Theme: ' + getConfig().theme); }
    if (e.code === 'KeyC') { e.preventDefault(); $('#drawer').hidden ? openDrawer() : closeDrawer(); }
    if (e.code === 'KeyI') { e.preventDefault(); toggleInspector(); }
  });
  window.addEventListener('hashchange', route);

  // OAuth callback?
  const res = await oauth.handleRedirect(getConfig());
  if (res.handled && res.error) { toast(res.error, true); toggleInspector(true); }
  if (res.handled && !res.error) { history.replaceState(null, '', location.pathname + '#/session'); toast('✓ Authenticated'); }
  else if (oauth.isAuthed() && !location.hash) history.replaceState(null, '', location.pathname + '#/session');

  route();
  if (!isConfigured(getConfig()) && !oauth.isAuthed()) setTimeout(openDrawer, 400);
}
init();
