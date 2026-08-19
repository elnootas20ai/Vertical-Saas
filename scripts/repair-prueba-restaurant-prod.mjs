/**
 * Repara cuenta demo restaurant en prod: cierra cajas abiertas antiguas y recrea WC huérfano.
 * Uso: node scripts/remote-run-script.mjs repair-prueba-restaurant-prod.mjs --apply
 */
import '../config/env.js';

const APPLY = process.argv.includes('--apply');
const OWNER_ID = '5e36c59f-6e27-4843-8f16-e5a6d721eff0';
const BIZ_ID = 'a2bf1e98-67e5-4eab-bc21-cb86f912d19a';
const WC_ID = 'wc-c890ff48-9467-44cf-86dd-47cb8cf8f9af';
const PDV_ID = 'pdv-d987b233-030c-413d-9842-a709d58e8d18';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const {
  getDeliveryDbName,
  getWorkCentersDbName,
  getDocument,
  putDocument,
  autoCloseTpvRegisterSessionDocument,
  calcTpvRegisterExpectedCash,
} = await import('../services/couchdb.js');

async function main() {
  const deliveryDb = getDeliveryDbName();
  const wcDb = getWorkCentersDbName();

  const pdv = await getDocument(req, deliveryDb, PDV_ID);
  if (!pdv) {
    console.error('PDV no encontrado', PDV_ID);
    process.exit(1);
  }
  console.log('PDV:', pdv.name, pdv.workCenterId);

  let wc = null;
  try {
    wc = await getDocument(req, wcDb, WC_ID);
  } catch {
    wc = null;
  }

  if (!wc || wc.error) {
    console.log('WC huérfano — recrear', WC_ID);
    const now = new Date().toISOString();
    const draft = {
      _id: WC_ID,
      type: 'sales_point',
      centerType: 'punto_de_venta',
      name: pdv.name || 'maika',
      address: pdv.address || 'Calle Bar Demo 1',
      city: pdv.city || 'Madrid',
      user_id: OWNER_ID,
      businessId: BIZ_ID,
      business_id: BIZ_ID,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    console.log(JSON.stringify(draft, null, 2));
    if (APPLY) {
      await putDocument(req, wcDb, draft._id, draft);
      console.log('WC recreado');
    }
  } else {
    console.log('WC OK:', wc.name, wc.deletedAt || '');
  }

  const sessionId = 'tpvreg-15ed7744-395b-49a4-b895-80c55492b592';
  let session = null;
  try {
    session = await getDocument(req, deliveryDb, sessionId);
  } catch {
    session = null;
  }

  if (session?.status === 'open') {
    const expected = calcTpvRegisterExpectedCash(session);
    console.log('Caja abierta antigua:', {
      id: session._id,
      openedAt: session.openedAt,
      pdv: session.pointOfSaleName,
      expected,
    });
    if (APPLY) {
      const closed = autoCloseTpvRegisterSessionDocument(
        session.user_id || OWNER_ID,
        session,
        'Cierre automático: mantenimiento demo restaurant (caja >18 h)',
        'Mantenimiento',
      );
      await putDocument(req, deliveryDb, closed._id, closed);
      console.log('Caja cerrada');
    }
  } else if (session) {
    console.log('Caja ya cerrada:', session.status, session.closedAt);
  } else {
    console.log('Sesión TPV no encontrada — buscar otras abiertas del owner');
    const { getAllDocuments } = await import('../services/couchdb.js');
    const docs = await getAllDocuments(req, deliveryDb);
    const open = docs.filter(
      (d) =>
        d?.type === 'tpv_register_session' &&
        d.status === 'open' &&
        !d.deletedAt &&
        (d.user_id === OWNER_ID || String(d.pointOfSaleId || '') === PDV_ID),
    );
    for (const s of open) {
      console.log('  open:', s._id, s.openedAt, s.pointOfSaleName);
      if (APPLY) {
        const closed = autoCloseTpvRegisterSessionDocument(
          s.user_id || OWNER_ID,
          s,
          'Cierre automático: mantenimiento demo restaurant',
          'Mantenimiento',
        );
        await putDocument(req, deliveryDb, closed._id, closed);
        console.log('  cerrada', s._id);
      }
    }
  }

  if (!APPLY) {
    console.log('\nSimulación. Ejecuta con --apply en el VPS para aplicar.');
  } else {
    console.log('\nListo. Prueba entrar al TPV con prueba-restaurant@test.local');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
