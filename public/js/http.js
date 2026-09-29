// fetch wrapper: optional server proxy, timing, and inspector logging.
import { log } from './inspector.js';

/**
 * opts: { method, headers, body, credentials, label, step, useProxy }
 * returns { status, ok, headers, text, json, ms }
 */
export async function request(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const headers = { ...(opts.headers || {}) };
  const viaProxy = !!opts.useProxy && opts.credentials !== 'include';
  const finalUrl = viaProxy ? `proxy?url=${encodeURIComponent(url)}` : url;
  const init = { method, headers, credentials: opts.credentials || 'omit' };
  if (opts.body != null && method !== 'GET') init.body = opts.body;

  const reqLog = { method, url, headers: { ...headers }, body: opts.body ?? undefined, viaProxy, credentials: init.credentials };
  const t0 = performance.now();
  let resp;
  try {
    resp = await fetch(finalUrl, init);
  } catch (e) {
    log('error', `${opts.step ? opts.step + ' ' : ''}${opts.label || method + ' ' + url} — network/CORS error`, {
      request: reqLog,
      error: e.message,
      hint: 'The browser blocked the call (usually CORS). In AIC: Tenant settings → Global Settings → Cross-origin resource sharing — add this app\'s origin, or enable "Use server proxy" in the config panel.',
    });
    throw e;
  }
  const text = await resp.text();
  const ms = Math.round(performance.now() - t0);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  const respHeaders = {};
  resp.headers.forEach((v, k) => { respHeaders[k] = v; });

  log(resp.ok ? 'http' : 'error', `${opts.step ? opts.step + ' ' : ''}${opts.label || method + ' ' + new URL(url).pathname} → ${resp.status}`, {
    request: reqLog,
    response: { status: resp.status, statusText: resp.statusText, ms, headers: respHeaders, body: json ?? text },
  });
  return { status: resp.status, ok: resp.ok, headers: respHeaders, text, json, ms };
}
