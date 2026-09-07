/**
 * Reenvía a Pau Royo cierres marcados TEST (campana + push). No toca cajas.
 *
 * Uso (en contenedor app):
 *   node scripts/fix-resend-caja-prueba-pau.mjs --apply
 */
import { getDocument, getDeliveryDbName } from '../services/couchdb.js';
import { emitPositiveAlert, fakeReq } from '../services/alertEmitter.js';
import { sendPushToUser } from '../services/pushService.js';
import {
  buildStoreDigestBlock,
  formatCeoDailyPushBody,
  money,
  shortStoreLabel,
} from '../shared/caja/ceoDailyDigestFormat.js';

const APPLY = process.argv.includes('--apply');
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const BUSINESS_ID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
/** Cierres 6 sep 2026 (ayer respecto al pedido de TEST). */
const SESSION_IDS = [
  'tpvreg-9b3266de-63b5-4759-af88-46723f673f9c', // Badalona
  'tpvreg-6764a3ab-171e-4d0f-a87a-0cbd7d377132', // Tiana
];

async function main() {
  const db = getDeliveryDbName();
  const stamp = Date.now();
  const results = [];

  for (const sessionId of SESSION_IDS) {
    const session = await getDocument(fakeReq, db, sessionId);
    if (!session?._id) throw new Error(`Sesión no encontrada: ${sessionId}`);
    if (session.status !== 'closed') throw new Error(`Sesión no cerrada: ${sessionId}`);

    const block = buildStoreDigestBlock(session);
    if (!block) throw new Error(`No block: ${sessionId}`);

    const store = shortStoreLabel(
      session.pointOfSaleName || session.salesPointName || session.pdvName || 'Tienda',
    );
    const diff = money(session.difference);
    const hasDiscrepancy = Math.abs(diff) >= 0.01;
    const baseTitle = hasDiscrepancy
      ? `Cierre con descuadre · ${store}`
      : `Cierre OK · ${store}`;
    const title = `TEST · ${baseTitle}`;
    const bodyRaw = formatCeoDailyPushBody([block]);
    const body = `TEST\n${bodyRaw}`;
    const dedupKey = `ceo-close-digest-test:${sessionId}:${stamp}`;
    const route = '/saas/vertical/delivery/caja';

    const plan = {
      sessionId,
      store,
      title,
      bodyPreview: body.split('\n').slice(0, 6),
      to: PAU,
    };

    if (!APPLY) {
      results.push({ ...plan, sent: false, dryRun: true });
      continue;
    }

    const created = await emitPositiveAlert({
      userIds: [PAU],
      businessId: BUSINESS_ID,
      category: 'ceo_daily_digest',
      source: 'caja',
      title,
      message: body,
      entityId: BUSINESS_ID,
      entityType: 'business',
      route,
      dedupKey,
      metadata: {
        ruleId: 'ceo_daily_digest',
        dayKey: block.dayKey,
        storeLabel: store,
        test: true,
        originalSessionId: sessionId,
      },
    });

    const notifId = String(created.find((n) => n.user_id === PAU || n.userId === PAU)?.id || created[0]?.id || '');

    await sendPushToUser(
      fakeReq,
      PAU,
      {
        title: 'Vertial',
        body,
        category: 'VERTIAL_EXPANDABLE',
        data: {
          route,
          notificationId: notifId,
          ruleId: 'ceo_daily_digest',
          title,
          category: 'VERTIAL_EXPANDABLE',
        },
        collapseId: `test-${sessionId}`.slice(0, 64),
      },
      {
        ruleId: 'ceo_daily_digest',
        category: 'ceo_daily_digest',
        channels: ['push'],
      },
    );

    results.push({
      ...plan,
      sent: true,
      campanaCreated: created.length,
      notifId,
    });
  }

  console.log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY_RUN', results }, null, 2));
  if (!APPLY) {
    console.log('\nSin --apply no se envía. Usa: node scripts/fix-resend-caja-prueba-pau.mjs --apply');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
