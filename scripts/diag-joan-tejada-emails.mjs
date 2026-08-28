/**
 * Busca cuentas Joan Tejada / tejada y resume qué correos de trabajador aplican.
 */
const COUCH =
  process.env.COUCHDB_URL ||
  process.env.COUCH_URL ||
  'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER || process.env.COUCH_USER || 'admin';
const pass = process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || '';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

const MANAGER_ROLES = new Set([
  'Admin',
  'admin',
  'Administrador',
  'Gerente',
  'gerente',
  'Encargado',
  'encargado',
  'Manager',
  'manager',
]);

function isManagerRole(role) {
  const n = String(role || '').trim();
  return MANAGER_ROLES.has(n) || MANAGER_ROLES.has(n.toLowerCase());
}

function isWorkerProfileSubject(account) {
  if (!account) return false;
  if (account.accountType === 'company') return false;
  if (isManagerRole(account.role)) return false;
  if (account.accountType === 'user') return true;
  if (String(account.invitedBy || '').trim()) return true;
  if (String(account.linkedBusinessId || '').trim() && account.role) return true;
  return false;
}

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'bad_json', status: res.status, text: text.slice(0, 200) };
  }
}

function pick(d) {
  return {
    id: d._id,
    userId: d.userId,
    email: d.email,
    fullName: d.fullName || d.name,
    accountType: d.accountType,
    role: d.role,
    linkedBusinessId: d.linkedBusinessId,
    inviteStatus: d.inviteStatus,
    emailVerified: d.emailVerified ?? d.verified ?? null,
    workerWelcomeEmailSentAt: d.workerWelcomeEmailSentAt || null,
    invitedBy: d.invitedBy || null,
    businessName: d.businessName || null,
    position: d.position || d.employment?.position || null,
    workCenterId: d.workCenterId || d.employment?.workCenterId || null,
    landingPage: d.landingPage || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    isWorkerSubject: isWorkerProfileSubject(d),
    isManager: isManagerRole(d.role),
  };
}

function emailsExpected(acc) {
  const worker = acc.isWorkerSubject;
  const list = [
    {
      type: 'Invitación al equipo',
      when: 'Al invitarlo desde Equipo',
      channel: 'email',
      applies: true,
    },
    {
      type: 'Verificación de email',
      when: 'Al registrarse / reenviar verificación',
      channel: 'email',
      applies: true,
    },
    {
      type: 'Cuenta de trabajador lista',
      when: 'Tras verificar email (cuenta user / invitación)',
      channel: 'email',
      applies: worker || acc.accountType === 'user',
    },
    {
      type: 'Bienvenida al unirse a la empresa',
      when: 'Al enlazarse a la empresa (una vez)',
      channel: 'email',
      applies: worker,
      alreadySent: Boolean(acc.workerWelcomeEmailSentAt),
      sentAt: acc.workerWelcomeEmailSentAt,
    },
    {
      type: 'Recuperar contraseña',
      when: 'Si pide “olvidé contraseña”',
      channel: 'email',
      applies: true,
    },
    {
      type: 'Cuenta bloqueada',
      when: 'Demasiados intentos de login fallidos',
      channel: 'email',
      applies: true,
    },
    {
      type: 'Alertas operativas (caja, stock, finanzas…)',
      when: 'Alert Center con canal email',
      channel: 'email',
      applies: !worker && acc.isManager,
      note: worker
        ? 'Bloqueado: trabajadores de piso NO reciben emails de alertas'
        : acc.isManager
          ? 'Sí: rol de gestión'
          : 'No: no es gerente/admin',
    },
    {
      type: 'Nómina / contrato / documentos',
      when: 'Al subir docs de nómina',
      channel: 'in-app + push',
      applies: worker,
    },
    {
      type: 'Vacaciones aprobadas/rechazadas',
      when: 'Cambio de estado de vacaciones',
      channel: 'in-app (+ push)',
      applies: worker,
    },
    {
      type: 'Chat',
      when: 'Mensajes del equipo',
      channel: 'in-app + push',
      applies: true,
    },
  ];
  return list.filter((x) => x.applies !== false);
}

const acc = await couch('/accounts/_all_docs?include_docs=true');
if (acc.error) {
  console.log(JSON.stringify({ couch_error: acc }, null, 2));
  process.exit(1);
}

const hits = [];
for (const row of acc.rows || []) {
  const d = row.doc;
  if (!d || d._id?.startsWith('_design')) continue;
  const blob = `${d.fullName || ''} ${d.name || ''} ${d.email || ''}`.toLowerCase();
  if (/joan|tejada/.test(blob)) hits.push(pick(d));
}

console.log(
  JSON.stringify(
    {
      total_accounts: (acc.rows || []).length,
      hits_count: hits.length,
      hits: hits.map((h) => ({
        ...h,
        emails_and_notifications: emailsExpected(h),
      })),
    },
    null,
    2,
  ),
);
