// Configuration: defaults < /config.json (server env) < localStorage < URL params
const KEY = 'aicpoc.config.v1';

export const DEFAULT_CARD_SCOPES = {
  profile: 'profile',
  session: 'openid',
  apps: 'fr:idm:*',
  devices: 'fr:idm:*',
  deviceProfile: 'fr:idm:*',
  activity: 'fr:idm:*',
  idm: 'fr:idm:*',
};

export const DEFAULTS = {
  tenantUrl: '',            // https://openam-xxxx.forgeblocks.com
  realm: 'alpha',
  clientId: '',
  scopes: 'openid profile email address phone fr:idm:* fr:idc:analytics:*',
  redirectUri: '',          // empty => this page
  postLogoutUri: '',        // empty => this page
  journey: '',              // optional: forces an AIC journey via &service=
  trustJourney: '',         // optional: journey used by "Trust this device"
  acrValues: '',
  prompt: '',
  singleLogout: true,       // call AIC end_session on logout
  useProxy: false,          // route calls through this server's /proxy (avoids CORS)
  apiAuth: 'both',          // bearer | cookie | both  (for AM REST endpoints)
  scopeGating: true,        // enforce per-card scope checks in the UI
  cardScopes: JSON.stringify(DEFAULT_CARD_SCOPES),
  showInspectorTab: true,   // small "Flow inspector" tab bottom-right
  theme: 'regional',        // bank | regional
  lang: 'es',
};

export function defaultRedirect() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

let cfg = { ...DEFAULTS };
let serverInfo = {};

export function getConfig() { return cfg; }
export function getServerInfo() { return serverInfo; }

export async function loadConfig() {
  let fromServer = {};
  try {
    const r = await fetch('config.json', { cache: 'no-store' });
    if (r.ok) fromServer = await r.json();
  } catch { /* static host without config.json is fine */ }
  serverInfo = { proxyAvailable: !!fromServer.proxyAvailable, adminEnabled: !!fromServer.adminEnabled, rev: fromServer._rev || null };
  delete fromServer.proxyAvailable; delete fromServer.adminEnabled; delete fromServer._rev;

  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  // If the published server defaults changed since this browser saved its overrides, drop the overrides
  // so every user follows the tenant configured by the host.
  if ((stored._srvrev || null) !== serverInfo.rev) stored = {};

  cfg = { ...DEFAULTS, ...fromServer, ...stored, _srvrev: serverInfo.rev };

  // URL overrides: ?theme=bank&lang=en  and  ?cfg=<base64url json> (shareable link)
  const q = new URLSearchParams(location.search);
  let changed = false;
  if (q.get('cfg')) {
    try { cfg = { ...cfg, ...JSON.parse(decodeURIComponent(escape(atob(q.get('cfg').replace(/-/g, '+').replace(/_/g, '/'))))) }; changed = true; } catch {}
    q.delete('cfg');
  }
  for (const k of ['theme', 'lang']) if (q.get(k)) { cfg[k] = q.get(k); changed = true; q.delete(k); }
  // Only strip our own params; keep OAuth callback params (code/state/error) intact
  if (changed && !q.get('code') && !q.get('error')) {
    const qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    saveConfig(cfg);
  }
  return cfg;
}

export function saveConfig(patch) {
  cfg = { ...cfg, ...patch, _srvrev: serverInfo.rev };
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  return cfg;
}

export function resetConfig() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function shareLink() {
  const c = { ...cfg }; delete c._srvrev;
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, '-').replace(/\//g, '_');
  return location.origin + location.pathname + '?cfg=' + b64;
}

export function effective(c = cfg) {
  const tenant = (c.tenantUrl || '').replace(/\/+$/, '');
  return {
    ...c,
    tenantUrl: tenant,
    redirectUri: c.redirectUri || defaultRedirect(),
    postLogoutUri: c.postLogoutUri || c.redirectUri || defaultRedirect(),
    cardScopesMap: (() => { try { return { ...DEFAULT_CARD_SCOPES, ...JSON.parse(c.cardScopes || '{}') }; } catch { return DEFAULT_CARD_SCOPES; } })(),
  };
}

export function isConfigured(c = cfg) { return !!(c.tenantUrl && c.clientId); }

/** Config without internal keys, as it would be published/downloaded. */
export function exportConfig() { const c = { ...cfg }; delete c._srvrev; return c; }

/** Publish current settings as the server-wide default (needs ADMIN_TOKEN on the server). */
export async function publishConfig(token) {
  const r = await fetch('api/config', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: JSON.stringify(exportConfig()) });
  if (!r.ok) throw new Error(r.status === 401 ? 'Wrong admin token' : `Publish failed: HTTP ${r.status}`);
  return r.json();
}
