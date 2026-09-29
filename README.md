# AIC OAuth2 POC app

Single-page OAuth2 client (Authorization Code + PKCE, public client) for PingOne Advanced Identity Cloud.
Two switchable landing pages (generic bank / regional cooperative bank), scope-gated dashboard, and a hideable OAuth2 flow inspector.

## Run
    node server.js            # Node 18+, no dependencies -> http://localhost:8080
    docker compose up --build # or Docker
Static hosting also works (serve `public/`); only the optional `/proxy` and env-var config need `server.js`.
Env vars: see header of `server.js` (AIC_TENANT_URL, AIC_REALM, AIC_CLIENT_ID, AIC_SCOPES, APP_THEME, APP_LANG, PROXY_ALLOWED_HOSTS...).

## Config persistence (hosting for other users)
Defaults come from `public/config.json` (pre-filled with the POC tenant, client `mock-bank-login`, optional `fr:idm:*`), then `data/config.json`, then env vars.
Set `ADMIN_TOKEN` and use **Publish as default for all users** in the config panel to write `data/config.json` (`CONFIG_FILE`; mount a volume in Docker).
Whenever the published defaults change, browsers drop their own local overrides, so everyone follows your tenant. On plain static hosting, edit `public/config.json` (or use *Download config.json*).

## Hidden controls
Tiny near-invisible dot bottom-left, or triple-click the logo, or Alt+Shift+C (config), Alt+Shift+T (switch site), Alt+Shift+I (inspector).
`?theme=bank|regional&lang=es|en` also works; "Copy share link" in the panel encodes the whole config.

## AIC setup
1. Applications -> Add -> **Native / SPA** (public client, token auth method `none`).
2. Redirect URI: shown in the config panel (e.g. `http://localhost:8080/`). Add post-logout URI too.
3. Grant types: Authorization Code (+ Refresh Token). Scopes: `openid profile email address phone fr:idm:* fr:idc:analytics:*`.
4. Tenant settings -> Global settings -> **CORS**: add the app origin (allow headers `authorization, content-type, accept-api-version`, credentials if using cookie mode). Or enable "Use server proxy" in the panel.
5. Paste tenant URL, realm and client ID into the panel, Test connection, click Login/Accede.

## Re-authorisation keeps scopes
Step-up and the "Trust this device" journey re-run /authorize with the base scopes plus everything already granted, so optional scopes such as `fr:idm:*` are not lost. (`noSession` only applies to the /json/authenticate REST API, not to /authorize.)

## Notes
- userinfo and IDM (`fr:idm:*`) calls use the bearer token. AM REST endpoints (sessions, devices, apps, trusted devices) normally need the SSO session cookie: default mode sends bearer + cookie; the cookie only reaches AM if app and tenant are same-site (custom domain under the same parent domain) or third-party cookies are allowed. The session card falls back to ID-token claims. Verify against your tenant using the inspector / API explorer.
- Tokens live in sessionStorage (POC only). Map uses OpenStreetMap tiles (internet needed).
