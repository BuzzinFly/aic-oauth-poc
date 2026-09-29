const D = {
  es: {
    login: 'Accede', logout: 'Cerrar sesión', mySession: 'Mi sesión', welcome: 'Bienvenido',
    // bank theme
    b_tag: 'Banca digital', b_h1: 'Tu banco, sin complicaciones.', b_p: 'Gestiona tus cuentas, tarjetas y ahorros de forma segura desde cualquier dispositivo.',
    b_cta2: 'Descubre más', b_f1: 'Cuentas', b_f1p: 'Sin comisiones de mantenimiento y con todo bajo control.',
    b_f2: 'Tarjetas', b_f2p: 'Pagos seguros, contactless y en tu móvil.', b_f3: 'Préstamos', b_f3p: 'Financiación clara, sin letra pequeña.',
    b_f4: 'Ahorro', b_f4p: 'Haz crecer tus objetivos con productos flexibles.',
    b_s1: 'clientes', b_s2: 'de disponibilidad', b_s3: 'oficinas y cajeros', b_secure: 'Acceso protegido con autenticación multifactor.',
    // regional theme
    r_util1: 'Particulares', r_util2: 'Empresas', r_util3: 'Agroalimentario', r_util4: 'Banca privada', r_search: 'Buscar', r_offices: 'Oficinas', r_contact: 'Contacto',
    r_n1: 'Cuentas y tarjetas', r_n2: 'Hipotecas', r_n3: 'Préstamos', r_n4: 'Ahorro e inversión', r_n5: 'Seguros', r_n6: 'Agro y cooperativas',
    r_h1: 'Crecemos contigo, cerca de ti.', r_p: 'Una cooperativa de crédito comprometida con las personas, las empresas y el territorio.',
    r_cta1: 'Hazte cliente', r_cta2: 'Conoce nuestras ofertas', r_card_t: 'Banca digital', r_card_p: 'Consulta tus cuentas, tarjetas y operaciones de forma segura.',
    r_q1: 'Simulador de hipotecas', r_q2: 'Cita previa', r_q3: 'Cajeros y oficinas', r_q4: 'Pagos con el móvil', r_q5: 'Seguros', r_q6: 'Ayuda y contacto',
    r_sec1: 'Productos destacados', r_p1: 'Hipoteca fija', r_p1p: 'Cuota estable durante toda la vida del préstamo.', r_p2: 'Cuenta Nómina', r_p2p: 'Sin comisiones y con ventajas en tu día a día.',
    r_p3: 'Financiación agro', r_p3p: 'Soluciones para campañas, maquinaria y modernización.', r_more: 'Más información',
    r_news: 'Actualidad', r_news1: 'Nuevas herramientas de banca digital para empresas', r_news2: 'Jornada sobre sostenibilidad en el sector agroalimentario', r_news3: 'Consejos para proteger tus pagos online',
    r_footer: 'Entidad ficticia creada para una demostración técnica. Cualquier parecido con una entidad real es coincidencia.',
    // dashboard
    profileData: 'Datos de perfil', sessionData: 'Datos de sesión', tokenScopes: 'Token y scopes', authorizedApps: 'Aplicaciones autorizadas', authDevices: 'Dispositivos de autenticación',
    deviceProfile: 'Perfil de dispositivo', loginActivity: 'Actividad de acceso', idmProfile: 'Perfil gestionado (IDM)', explorer: 'Explorador de API',
    field: 'Campo', value: 'Valor', sharing: 'Estás compartiendo:', expires: 'Caduca', none: 'Ninguno registrado', remove: 'Eliminar',
    reviewActivity: 'Revisa tu actividad reciente', clear: 'borrar', trustDevice: 'Confiar en este dispositivo', watchLive: 'Ver en vivo', stopLive: 'Detener',
    seeWhere: 'Consulta desde dónde accedes', trusted: 'De confianza', untrusted: 'Sin confianza', loading: 'Cargando…', retry: 'Reintentar',
    requiresScope: 'Requiere el scope', notGranted: 'no concedido en este token.', requestScope: 'Solicitar scope', refreshToken: 'Renovar token', stepUp: 'Reautorizar con scopes adicionales',
    send: 'Enviar', granted: 'Scopes concedidos', missing: 'Solicitados y no concedidos', expiresIn: 'Caduca en', confirmRemove: '¿Seguro que quieres eliminar este elemento?', removeTrusted: 'Eliminar dispositivo de confianza', confirmRemoveTrusted: '¿Eliminar este dispositivo de confianza de tu perfil? Todos los accesos desde él pasarán a «Sin confianza».',
  },
  en: {
    login: 'Login', logout: 'Log out', mySession: 'My Session', welcome: 'Welcome',
    b_tag: 'Digital banking', b_h1: 'Your bank, made simple.', b_p: 'Manage your accounts, cards and savings securely from any device.',
    b_cta2: 'Learn more', b_f1: 'Accounts', b_f1p: 'No maintenance fees and everything under control.',
    b_f2: 'Cards', b_f2p: 'Secure, contactless payments on your phone.', b_f3: 'Loans', b_f3p: 'Clear financing with no small print.',
    b_f4: 'Savings', b_f4p: 'Grow your goals with flexible products.',
    b_s1: 'customers', b_s2: 'availability', b_s3: 'branches and ATMs', b_secure: 'Access protected with multi-factor authentication.',
    r_util1: 'Personal', r_util2: 'Business', r_util3: 'Agri-food', r_util4: 'Private banking', r_search: 'Search', r_offices: 'Branches', r_contact: 'Contact',
    r_n1: 'Accounts & cards', r_n2: 'Mortgages', r_n3: 'Loans', r_n4: 'Savings & investment', r_n5: 'Insurance', r_n6: 'Agro & co-ops',
    r_h1: 'We grow with you, close to you.', r_p: 'A credit cooperative committed to people, businesses and the region.',
    r_cta1: 'Become a customer', r_cta2: 'See our offers', r_card_t: 'Digital banking', r_card_p: 'Check your accounts, cards and transactions securely.',
    r_q1: 'Mortgage simulator', r_q2: 'Book an appointment', r_q3: 'ATMs and branches', r_q4: 'Mobile payments', r_q5: 'Insurance', r_q6: 'Help & contact',
    r_sec1: 'Featured products', r_p1: 'Fixed-rate mortgage', r_p1p: 'A stable payment for the whole life of the loan.', r_p2: 'Payroll account', r_p2p: 'No fees and everyday benefits.',
    r_p3: 'Agri financing', r_p3p: 'Solutions for campaigns, machinery and modernisation.', r_more: 'More information',
    r_news: 'News', r_news1: 'New digital banking tools for businesses', r_news2: 'Sustainability day for the agri-food sector', r_news3: 'Tips to protect your online payments',
    r_footer: 'Fictitious institution created for a technical demonstration. Any resemblance to a real institution is coincidental.',
    profileData: 'Profile data', sessionData: 'Session data', tokenScopes: 'Token & scopes', authorizedApps: 'Authorized apps', authDevices: 'Authentication devices',
    deviceProfile: 'Device profile', loginActivity: 'Login activity', idmProfile: 'Managed profile (IDM)', explorer: 'API explorer',
    field: 'Field', value: 'Value', sharing: "You're sharing:", expires: 'Expires', none: 'None registered', remove: 'Remove',
    reviewActivity: 'Review your recent activity', clear: 'clear', trustDevice: 'Trust this device', watchLive: 'Watch Live', stopLive: 'Stop',
    seeWhere: "See where you're signing in from", trusted: 'Trusted', untrusted: 'Untrusted', loading: 'Loading…', retry: 'Retry',
    requiresScope: 'Requires scope', notGranted: 'not granted in this token.', requestScope: 'Request scope', refreshToken: 'Refresh token', stepUp: 'Re-authorise with additional scopes',
    send: 'Send', granted: 'Granted scopes', missing: 'Requested but not granted', expiresIn: 'Expires in', confirmRemove: 'Are you sure you want to remove this item?', removeTrusted: 'Remove trusted device', confirmRemoveTrusted: 'Remove this trusted device from your profile? All logins from it will show as Untrusted.',
  },
};
let lang = 'es';
export function setLang(l) { lang = D[l] ? l : 'es'; document.documentElement.lang = lang; }
export const t = k => D[lang][k] ?? D.en[k] ?? k;
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}
