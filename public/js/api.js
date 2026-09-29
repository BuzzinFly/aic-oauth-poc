// AIC API layer. Every call goes through http.request so it shows up in the flow inspector.
import { request } from './http.js';
import { effective } from './config.js';
import { getTokens, realmPath, decodeJwt, discover } from './oauth.js';

export function endpoints(cfg, sub) {
  const c = effective(cfg);
  const am = `${c.tenantUrl}/am`;
  const rp = realmPath(c.realm);
  const user = sub ? `${am}/json/${rp}/users/${encodeURIComponent(sub)}` : null;
  const managed = (c.realm && c.realm !== 'root' ? c.realm : 'realm') + '_user';
  return {
    am, rp,
    userinfo: `${am}/oauth2/${rp}/userinfo`,
    sessionInfo: `${am}/json/${rp}/sessions?_action=getSessionInfo`,
    apps: user && `${user}/oauth2/applications?_queryFilter=true`,
    devices: type => user && `${user}/devices/2fa/${type}?_queryFilter=true`,
    deviceItem: (type, id) => `${user}/devices/2fa/${type}/${encodeURIComponent(id)}`,
    profiles: user && `${user}/devices/profile?_queryFilter=true`,
    profileItem: id => `${user}/devices/profile/${encodeURIComponent(id)}`,
    trusted: user && `${user}/devices/trusted?_queryFilter=true`,
    trustedItem: id => `${user}/devices/trusted/${encodeURIComponent(id)}`,
    idmUser: sub && `${c.tenantUrl}/openidm/managed/${managed}/${encodeURIComponent(sub)}`,
  };
}

/**
 * Authenticated call. kind: 'oauth' (bearer only, e.g. userinfo/IDM) | 'am' (uses cfg.apiAuth for AM REST)
 */
export async function call(cfg, url, { method = 'GET', kind = 'am', headers = {}, body, label, version } = {}) {
  const c = effective(cfg);
  const t = getTokens();
  const h = { Accept: 'application/json', ...headers };
  if (version) h['Accept-API-Version'] = version;
  if (body != null && !h['Content-Type']) h['Content-Type'] = 'application/json';
  let credentials = 'omit';
  const mode = kind === 'oauth' ? 'bearer' : c.apiAuth;
  if ((mode === 'bearer' || mode === 'both') && t?.access_token) h.Authorization = `Bearer ${t.access_token}`;
  if (mode === 'cookie' || mode === 'both') credentials = 'include';
  return request(url, {
    method, headers: h, body: body != null && typeof body !== 'string' ? JSON.stringify(body) : body,
    credentials, label, useProxy: c.useProxy, step: '⑥',
  });
}

// ---- high level fetchers used by the dashboard cards -------------------------
export async function fetchUserinfo(cfg) {
  const ep = await discover(effective(cfg));
  return call(cfg, ep.userinfo_endpoint || endpoints(cfg).userinfo, { kind: 'oauth', label: 'GET userinfo' });
}

export async function fetchSession(cfg) {
  const e = endpoints(cfg);
  const r = await call(cfg, e.sessionInfo, { method: 'POST', body: '{}', version: 'resource=4.0', label: 'POST sessions?_action=getSessionInfo' });
  if (r.ok && r.json) return { source: 'AM session API', data: r.json };
  // Fallback: derive what we can from the ID token
  const t = getTokens();
  const d = t?.id_token && decodeJwt(t.id_token);
  if (d) {
    const p = d.payload;
    const iso = s => s ? new Date(s * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : undefined;
    return {
      source: 'derived from ID token (AM session API not reachable with this credential)',
      status: r.status,
      data: Object.fromEntries(Object.entries({
        username: p.sub, realm: '/' + (effective(cfg).realm || 'root'),
        authTime: iso(p.auth_time), issuedAt: iso(p.iat), tokenExpiry: iso(p.exp),
        sid: p.sid, acr: p.acr, amr: p.amr, azp: p.azp, iss: p.iss,
      }).filter(([, v]) => v !== undefined)),
    };
  }
  throw new Error(`HTTP ${r.status}`);
}

const list = r => (r.json?.result || []);

export async function fetchApps(cfg, sub) {
  const r = await call(cfg, endpoints(cfg, sub).apps, { version: 'resource=1.0', label: 'GET authorized OAuth2 apps' });
  if (!r.ok) throw httpErr(r); return list(r);
}

export async function deleteApp(cfg, sub, clientId) {
  const r = await call(cfg, `${endpoints(cfg, sub).apps.split('?')[0]}/${encodeURIComponent(clientId)}`, { method: 'DELETE', version: 'resource=1.0', label: 'DELETE authorized app (revoke grant)' });
  if (!r.ok) throw httpErr(r);
}

export const DEVICE_TYPES = [
  { key: 'oath', title: 'OATH' },
  { key: 'push', title: 'Push Notification' },
  { key: 'webauthn', title: 'Web Authentication' },
];
export async function fetchDevices(cfg, sub, type) {
  const r = await call(cfg, endpoints(cfg, sub).devices(type), { version: 'resource=1.0', label: `GET ${type} devices` });
  if (!r.ok) throw httpErr(r); return list(r);
}
export async function deleteDevice(cfg, sub, type, id) {
  const r = await call(cfg, endpoints(cfg, sub).deviceItem(type, id), { method: 'DELETE', version: 'resource=1.0', label: `DELETE ${type} device` });
  if (!r.ok) throw httpErr(r);
}
export async function fetchProfiles(cfg, sub) {
  const r = await call(cfg, endpoints(cfg, sub).profiles, { version: 'resource=1.0', label: 'GET device profiles' });
  if (!r.ok) throw httpErr(r); return list(r);
}
export async function deleteProfile(cfg, sub, id) {
  const r = await call(cfg, endpoints(cfg, sub).profileItem(id), { method: 'DELETE', version: 'resource=1.0', label: 'DELETE device profile' });
  if (!r.ok) throw httpErr(r);
}
export async function fetchTrusted(cfg, sub) {
  const r = await call(cfg, endpoints(cfg, sub).trusted, { version: 'resource=1.0', label: 'GET trusted devices' });
  if (!r.ok) throw httpErr(r); return list(r);
}
export async function deleteTrusted(cfg, sub, id) {
  const r = await call(cfg, endpoints(cfg, sub).trustedItem(id), { method: 'DELETE', version: 'resource=1.0', label: 'DELETE trusted device' });
  if (!r.ok) throw httpErr(r);
}
export async function fetchIdmUser(cfg, sub) {
  const r = await call(cfg, endpoints(cfg, sub).idmUser + '?_fields=userName,givenName,sn,mail,telephoneNumber,accountStatus,preferences', { kind: 'oauth', label: 'GET IDM managed user (fr:idm:*)' });
  if (!r.ok) throw httpErr(r); return r.json;
}

// ---- login activity + trusted devices, straight from the IDM managed user (bearer + fr:idm:*, no session cookie)
//  frIndexedMultivalued1 : one JSON string per login {date,lastSelectedDate,device:{identifier,metadata},location}
//  deviceProfiles        : one JSON string per TRUSTED device {identifier,metadata,location,alias,...}
const parseJ = raw => { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; } };
export async function fetchLoginActivity(cfg, sub) {
  const r = await call(cfg, endpoints(cfg, sub).idmUser + '?_fields=frIndexedMultivalued1,deviceProfiles', { kind: 'oauth', label: 'GET IDM user (login history + trusted devices)' });
  if (!r.ok) throw httpErr(r);
  const logins = (r.json.frIndexedMultivalued1 || []).map(raw => ({ raw, ...parseJ(raw) })).filter(x => x.device?.identifier);
  const trusted = (r.json.deviceProfiles || []).map(raw => ({ raw, ...parseJ(raw) })).filter(x => x.identifier);
  return { logins, trusted };
}
async function patchIdm(cfg, sub, ops, label) {
  const r = await call(cfg, endpoints(cfg, sub).idmUser, { method: 'PATCH', kind: 'oauth', body: ops, label });
  if (!r.ok) throw httpErr(r);
}
/** Removes every trusted-device entry with this identifier from the user's deviceProfiles. */
export async function removeTrustedDevice(cfg, sub, identifier) {
  const { trusted } = await fetchLoginActivity(cfg, sub);
  const keep = trusted.filter(x => x.identifier !== identifier).map(x => x.raw);
  await patchIdm(cfg, sub, [{ operation: 'replace', field: '/deviceProfiles', value: keep }], 'PATCH IDM user — remove trusted device');
}
export async function clearLoginHistory(cfg, sub) {
  await patchIdm(cfg, sub, [{ operation: 'replace', field: '/frIndexedMultivalued1', value: [] }], 'PATCH IDM user — clear login history');
}

function httpErr(r) {
  const e = new Error(r.json?.message || r.json?.error_description || `HTTP ${r.status}`);
  e.status = r.status; return e;
}
