#!/usr/bin/env node
/**
 * Zero-dependency server for the AIC OAuth2 POC app.
 *  - serves ./public
 *  - GET /config.json   -> defaults from public/config.json overridden by env vars
 *  - ANY /proxy?url=... -> optional CORS-avoiding pass-through to the AIC tenant (host allow-list)
 *  - GET /healthz
 *
 * Env:
 *  PORT (8080)  HOST (0.0.0.0)
 *  AIC_TENANT_URL, AIC_REALM, AIC_CLIENT_ID, AIC_SCOPES, AIC_REDIRECT_URI, AIC_POST_LOGOUT_URI,
 *  APP_THEME (bank|regional), APP_LANG (es|en), APP_USE_PROXY (true|false)
 *  PROXY_ALLOWED_HOSTS  comma list, wildcards allowed (default: AIC/PingOne domains + host of AIC_TENANT_URL)
 *  PROXY_DISABLED=true  disables /proxy completely
 *  ADMIN_TOKEN          enables POST /api/config ("Publish as default" button in the config panel)
 *  CONFIG_FILE          where published defaults are stored (default ./data/config.json; mount a volume in Docker)
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};

const CONFIG_FILE = process.env.CONFIG_FILE || path.join(__dirname, 'data', 'config.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
// precedence: public/config.json < CONFIG_FILE (published from the UI) < environment variables
function fileConfig() { return { ...readJson(path.join(PUBLIC, 'config.json')), ...readJson(CONFIG_FILE) }; }
const ALLOWED_KEYS = ['tenantUrl','realm','clientId','scopes','redirectUri','postLogoutUri','journey','trustJourney','acrValues','prompt','singleLogout','useProxy','apiAuth','scopeGating','cardScopes','showInspectorTab','theme','lang'];

async function handlePublish(req, res) {
  if (!ADMIN_TOKEN) return send(res, 404, 'publishing disabled (set ADMIN_TOKEN)');
  const given = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const want = Buffer.from(ADMIN_TOKEN);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(res, 401, 'unauthorized');
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 20000) return send(res, 413, 'too large'); }
  let body; try { body = JSON.parse(raw); } catch { return send(res, 400, 'bad json'); }
  const clean = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_KEYS.includes(k)));
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(clean, null, 2));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, saved: Object.keys(clean).length }));
}
function envConfig() {
  const m = {
    AIC_TENANT_URL: 'tenantUrl', AIC_REALM: 'realm', AIC_CLIENT_ID: 'clientId', AIC_SCOPES: 'scopes',
    AIC_REDIRECT_URI: 'redirectUri', AIC_POST_LOGOUT_URI: 'postLogoutUri', APP_THEME: 'theme', APP_LANG: 'lang',
  };
  const out = {};
  for (const [e, k] of Object.entries(m)) if (process.env[e]) out[k] = process.env[e];
  if (process.env.APP_USE_PROXY) out.useProxy = /^(1|true|yes)$/i.test(process.env.APP_USE_PROXY);
  return out;
}

// ---- proxy allow-list -------------------------------------------------------
function allowedPatterns() {
  const list = (process.env.PROXY_ALLOWED_HOSTS ||
    '*.forgeblocks.com,*.id.forgerock.io,*.pingone.com,*.pingone.eu,*.pingone.asia,*.pingone.ca,*.pingidentity.com,localhost')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  try { if (process.env.AIC_TENANT_URL) list.push(new URL(process.env.AIC_TENANT_URL).hostname.toLowerCase()); } catch {}
  return list;
}
function hostAllowed(hostname) {
  hostname = hostname.toLowerCase();
  return allowedPatterns().some(p => {
    if (p.startsWith('*.')) return hostname.endsWith(p.slice(1)) && hostname.length > p.length - 1;
    return hostname === p;
  });
}

const FORWARD_REQ_HEADERS = ['authorization', 'content-type', 'accept', 'accept-api-version', 'if-match', 'if-none-match', 'x-requested-with', 'accept-language'];

async function handleProxy(req, res, urlObj) {
  if (/^(1|true|yes)$/i.test(process.env.PROXY_DISABLED || '')) return send(res, 404, 'proxy disabled');
  const target = urlObj.searchParams.get('url');
  let t;
  try { t = new URL(target); } catch { return send(res, 400, 'invalid url'); }
  if (!['https:', 'http:'].includes(t.protocol)) return send(res, 400, 'bad protocol');
  if (t.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(t.hostname)) return send(res, 400, 'https required');
  if (!hostAllowed(t.hostname)) return send(res, 403, `host not allowed: ${t.hostname} (set PROXY_ALLOWED_HOSTS)`);

  const headers = {};
  for (const h of FORWARD_REQ_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];
  let body;
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }
  try {
    const r = await fetch(t, { method: req.method, headers, body, redirect: 'manual' });
    const out = {};
    r.headers.forEach((v, k) => { if (!['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v; });
    out['x-proxied-to'] = t.origin;
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    send(res, 502, 'upstream error: ' + e.message);
  }
}

// ---- static -----------------------------------------------------------------
function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA fallback
      if (!path.extname(rel)) return serveFile(res, path.join(PUBLIC, 'index.html'));
      return send(res, 404, 'not found');
    }
    serveFile(res, file);
  });
}
function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (u.pathname === '/healthz') return send(res, 200, 'ok');
    if (u.pathname === '/config.json') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      const merged = { ...fileConfig(), ...envConfig() };
      const _rev = crypto.createHash('sha1').update(JSON.stringify(merged)).digest('hex').slice(0, 10);
      return res.end(JSON.stringify({ ...merged, _rev, adminEnabled: !!ADMIN_TOKEN, proxyAvailable: !/^(1|true|yes)$/i.test(process.env.PROXY_DISABLED || '') }));
    }
    if (u.pathname === '/proxy') return await handleProxy(req, res, u);
    if (u.pathname === '/api/config' && req.method === 'POST') return await handlePublish(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'method not allowed');
    return serveStatic(req, res, u.pathname);
  } catch (e) {
    send(res, 500, 'server error: ' + e.message);
  }
}).listen(PORT, HOST, () => {
  console.log(`AIC OAuth2 POC app listening on http://localhost:${PORT}`);
});
