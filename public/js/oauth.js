// OAuth2 / OIDC client: Authorization Code + PKCE (public client), refresh, logout, JWT helpers.
import { log } from './inspector.js';
import { request } from './http.js';
import { effective } from './config.js';

const TOK = 'aicpoc.tokens.v1';
const PKCE = 'aicpoc.pkce.v1';
const DISC = 'aicpoc.discovery.v1';

// ---------- helpers ----------------------------------------------------------
export function realmPath(realm) {
  const r = (realm || '').replace(/^\/+|\/+$/g, '');
  return !r || r === 'root' ? 'realms/root' : `realms/root/realms/${r}`;
}
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

// Small SHA-256 fallback: crypto.subtle only exists on https/localhost; this lets LAN http demos work.
function sha256Fallback(bytes) {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l = bytes.length, padLen = ((l + 9 + 63) & ~63);
  const m = new Uint8Array(padLen); m.set(bytes); m[l] = 0x80;
  new DataView(m.buffer).setUint32(padLen - 4, l * 8, false);
  new DataView(m.buffer).setUint32(padLen - 8, Math.floor(l / 0x20000000), false);
  const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padLen; o += 64) {
    const dv = new DataView(m.buffer, o, 64);
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i-15],7) ^ rr(w[i-15],18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2],17) ^ rr(w[i-2],19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0]+=a; H[1]+=b; H[2]+=c; H[3]+=d; H[4]+=e; H[5]+=f; H[6]+=g; H[7]+=h;
  }
  const out = new Uint8Array(32), dv = new DataView(out.buffer);
  H.forEach((v, i) => dv.setUint32(i * 4, v, false));
  return out;
}
async function sha256(str) {
  const data = new TextEncoder().encode(str);
  if (globalThis.crypto?.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return sha256Fallback(data);
}

export function decodeJwt(token) {
  try {
    const [h, p] = token.split('.');
    const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
    return { header: dec(h), payload: dec(p) };
  } catch { return null; }
}

// ---------- token store ------------------------------------------------------
export function getTokens() { try { return JSON.parse(sessionStorage.getItem(TOK) || 'null'); } catch { return null; } }
function setTokens(t) { sessionStorage.setItem(TOK, JSON.stringify(t)); }
export function clearTokens() { sessionStorage.removeItem(TOK); }
export function isAuthed() { const t = getTokens(); return !!(t && t.access_token); }
export function grantedScopes() { const t = getTokens(); return t?.scope ? t.scope.split(/\s+/).filter(Boolean) : []; }

/** scope matching incl. wildcards: granted "fr:idm:*" satisfies required "fr:idm:foo" */
export function hasScope(required, granted = grantedScopes()) {
  if (!required) return true;
  return required.split(/\s+/).filter(Boolean).every(req =>
    granted.some(g => g === req || (g.endsWith('*') && req.startsWith(g.slice(0, -1)))));
}

// ---------- discovery --------------------------------------------------------
export function fallbackEndpoints(c) {
  const base = `${c.tenantUrl}/am/oauth2/${realmPath(c.realm)}`;
  return {
    issuer: `${c.tenantUrl}/am/oauth2/${c.realm && c.realm !== 'root' ? c.realm : ''}`.replace(/\/$/, ''),
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/access_token`,
    userinfo_endpoint: `${base}/userinfo`,
    end_session_endpoint: `${base}/connect/endSession`,
    jwks_uri: `${base}/connect/jwk_uri`,
    introspection_endpoint: `${base}/introspect`,
  };
}

export async function discover(cfg, { force = false } = {}) {
  const c = effective(cfg);
  const cacheKey = `${c.tenantUrl}|${c.realm}`;
  if (!force) { try { const d = JSON.parse(sessionStorage.getItem(DISC) || 'null'); if (d?.key === cacheKey) return d.doc; } catch {} }
  const url = `${c.tenantUrl}/am/oauth2/${realmPath(c.realm)}/.well-known/openid-configuration`;
  let doc;
  try {
    const r = await request(url, { label: 'OIDC discovery', step: '①', useProxy: c.useProxy });
    doc = r.ok && r.json ? r.json : null;
  } catch { doc = null; }
  if (!doc) {
    doc = fallbackEndpoints(c);
    log('warn', 'Discovery failed — using conventional AM endpoints', doc);
  }
  try { sessionStorage.setItem(DISC, JSON.stringify({ key: cacheKey, doc })); } catch {}
  return doc;
}

// ---------- login ------------------------------------------------------------
export async function login(cfg, { extraScopes = '', journey, prompt, loginHint } = {}) {
  const c = effective(cfg);
  if (!c.tenantUrl || !c.clientId) throw new Error('Tenant URL and Client ID are required');
  const ep = await discover(c);

  // keep whatever the user already granted (e.g. optional fr:idm:*) so re-auth for step-up or the
  // trust-device journey doesn't silently drop it
  const scopeSet = new Set(`${c.scopes} ${grantedScopes().join(' ')} ${extraScopes}`.split(/\s+/).filter(Boolean));
  const state = rand(16), nonce = rand(16), verifier = rand(48);
  const challenge = b64url(await sha256(verifier));

  const params = {
    client_id: c.clientId, response_type: 'code', redirect_uri: c.redirectUri,
    scope: [...scopeSet].join(' '), state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256',
  };
  const svc = journey ?? c.journey; if (svc) params.service = svc;
  if (c.acrValues) params.acr_values = c.acrValues;
  const pr = prompt ?? c.prompt; if (pr) params.prompt = pr;
  if (loginHint) params.login_hint = loginHint;

  const authUrl = ep.authorization_endpoint + '?' + new URLSearchParams(params).toString();
  sessionStorage.setItem(PKCE, JSON.stringify({ state, nonce, verifier, redirectUri: c.redirectUri, requestedScope: params.scope, at: Date.now() }));

  log('flow', '② Authorization request → browser redirect to AIC', {
    explanation: 'Authorization Code flow with PKCE. The app generates a random code_verifier, sends only its SHA-256 hash (code_challenge), and redirects the browser to AIC. state protects against CSRF, nonce binds the ID token to this request.',
    authorization_endpoint: ep.authorization_endpoint,
    parameters: params,
    pkce: { code_verifier: verifier, code_challenge_method: 'S256', code_challenge: challenge },
    fullUrl: authUrl,
  });
  // tiny delay so sessionStorage is flushed and the inspector can render
  await new Promise(r => setTimeout(r, 60));
  location.assign(authUrl);
}

// ---------- callback ---------------------------------------------------------
/** Returns { handled, error? } */
export async function handleRedirect(cfg) {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return { handled: false };
  const c = effective(cfg);
  const clean = () => history.replaceState(null, '', location.pathname + location.hash);

  if (q.has('error')) {
    const err = { error: q.get('error'), error_description: q.get('error_description') };
    log('error', '③ Authorization error returned by AIC', err);
    clean();
    return { handled: true, error: `${err.error}: ${err.error_description || ''}` };
  }

  const code = q.get('code'), state = q.get('state');
  let p; try { p = JSON.parse(sessionStorage.getItem(PKCE) || 'null'); } catch {}
  log('flow', '③ Redirect back with authorization code', {
    explanation: 'AIC authenticated the user (journey) and redirected back with a one-time code. The app verifies state, then exchanges the code + code_verifier at the token endpoint.',
    code, state, expected_state: p?.state, state_match: p?.state === state,
  });
  clean();
  if (!p || p.state !== state) { return { handled: true, error: 'State mismatch (or session lost) — restart the login.' }; }
  sessionStorage.removeItem(PKCE);

  const ep = await discover(c);
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: p.redirectUri,
    client_id: c.clientId, code_verifier: p.verifier,
  }).toString();
  const r = await request(ep.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body, label: 'Token exchange (authorization_code + PKCE)', step: '④', useProxy: c.useProxy,
  });
  if (!r.ok || !r.json?.access_token) {
    return { handled: true, error: `Token endpoint: ${r.json?.error || r.status} ${r.json?.error_description || ''}` };
  }
  const tok = { ...r.json, obtained_at: Date.now(), expires_at: Date.now() + (r.json.expires_in || 0) * 1000 };
  // AIC may omit "scope" in the response when identical to the request; fall back to what we asked for
  if (!tok.scope) tok.scope = (p.requestedScope || c.scopes);
  setTokens(tok);

  if (tok.id_token) await validateIdToken(tok.id_token, p.nonce, ep, c);
  return { handled: true };
}

export async function validateIdToken(idToken, nonce, ep, c) {
  const d = decodeJwt(idToken);
  if (!d) { log('warn', '⑤ ID token could not be decoded', {}); return false; }
  const { header, payload } = d;
  const checks = {
    nonce_match: nonce ? payload.nonce === nonce : 'n/a',
    aud_match: [].concat(payload.aud).includes(c.clientId),
    not_expired: payload.exp * 1000 > Date.now(),
    issuer: payload.iss,
    alg: header.alg,
    signature: 'not verified',
  };
  try {
    const jr = await request(ep.jwks_uri, { label: 'JWKS', step: '⑤', useProxy: c.useProxy });
    const key = jr.json?.keys?.find(k => k.kid === header.kid) || jr.json?.keys?.[0];
    if (key && globalThis.crypto?.subtle) {
      const algo = header.alg.startsWith('ES') ? { name: 'ECDSA', namedCurve: key.crv } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
      const ck = await crypto.subtle.importKey('jwk', key, algo, false, ['verify']);
      const [h, p, s] = idToken.split('.');
      const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), ch => ch.charCodeAt(0));
      const vAlgo = header.alg.startsWith('ES') ? { name: 'ECDSA', hash: header.alg === 'ES384' ? 'SHA-384' : header.alg === 'ES512' ? 'SHA-512' : 'SHA-256' } : algo;
      checks.signature = (await crypto.subtle.verify(vAlgo, ck, sig, new TextEncoder().encode(`${h}.${p}`))) ? 'valid ✓' : 'INVALID ✗';
    }
  } catch (e) { checks.signature = 'could not verify: ' + e.message; }
  log('flow', '⑤ ID token validation', { explanation: 'Client-side OIDC checks: nonce, audience, expiry and signature against the tenant JWKS.', header, claims: payload, checks });
  return true;
}

// ---------- refresh / logout -------------------------------------------------
export async function refresh(cfg) {
  const c = effective(cfg), t = getTokens();
  if (!t?.refresh_token) throw new Error('No refresh_token was issued (enable the refresh_token grant on the client).');
  const ep = await discover(c);
  const r = await request(ep.token_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: c.clientId }).toString(),
    label: 'Token refresh', step: '⟳', useProxy: c.useProxy,
  });
  if (!r.ok) throw new Error(r.json?.error_description || r.json?.error || 'refresh failed');
  setTokens({ ...t, ...r.json, refresh_token: r.json.refresh_token || t.refresh_token, obtained_at: Date.now(), expires_at: Date.now() + (r.json.expires_in || 0) * 1000, scope: r.json.scope || t.scope });
}

export async function logout(cfg) {
  const c = effective(cfg), t = getTokens();
  clearTokens();
  if (c.singleLogout && c.tenantUrl && c.clientId) {
    const ep = await discover(c);
    const p = { client_id: c.clientId, post_logout_redirect_uri: c.postLogoutUri };
    if (t?.id_token) p.id_token_hint = t.id_token;
    const url = (ep.end_session_endpoint || fallbackEndpoints(c).end_session_endpoint) + '?' + new URLSearchParams(p);
    log('flow', 'Logout → AIC end_session (single logout)', { url, parameters: p });
    await new Promise(r => setTimeout(r, 60));
    location.assign(url);
  } else {
    log('flow', 'Local logout only (tokens discarded; AIC session left intact)', {});
    location.hash = '#/';
    location.reload();
  }
}
