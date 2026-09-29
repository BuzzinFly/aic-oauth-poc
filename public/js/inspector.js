// Flow inspector: an append-only log persisted in sessionStorage so it survives the login redirects.
const KEY = 'aicpoc.log.v1';
const MAX = 250;
let entries = [];
const subs = new Set();

try { entries = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { entries = []; }

function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX))); } catch {}
}

/** kind: flow | http | info | warn | error */
export function log(kind, title, detail) {
  const e = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(), kind, title, detail };
  entries.push(e);
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
  subs.forEach(fn => fn(e));
  return e;
}
export function getEntries() { return entries; }
export function clearLog() { entries = []; persist(); subs.forEach(fn => fn(null)); }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

const SECRET_KEYS = /^(access_token|id_token|refresh_token|code|code_verifier|client_secret|authorization|iPlanetDirectoryPro)$/i;

export function maskDeep(v, mask) {
  if (!mask) return v;
  const short = s => (typeof s === 'string' && s.length > 28) ? s.slice(0, 18) + '…[' + (s.length) + ' chars]' : s;
  const walk = (x, key) => {
    if (x == null) return x;
    if (typeof x === 'string') return (SECRET_KEYS.test(key || '') || /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(x)) ? short(x) : x;
    if (Array.isArray(x)) return x.map(i => walk(i, key));
    if (typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, walk(val, k)]));
    return x;
  };
  return walk(v);
}

export function toCurl(d) {
  if (!d || !d.request) return '';
  const r = d.request;
  const parts = [`curl -i -X ${r.method} '${r.url}'`];
  for (const [k, v] of Object.entries(r.headers || {})) parts.push(`  -H '${k}: ${v}'`);
  if (r.body) parts.push(`  --data '${typeof r.body === 'string' ? r.body.replace(/'/g, "'\\''") : JSON.stringify(r.body)}'`);
  return parts.join(' \\\n');
}
