import { listFinanceMovements, updateFinanceMovementInCouch } from './financeApi';
import type { FinanceMovementRecord, LinkedDocument } from './financeTypes';

type MovementDocumentInput = {
  id: string;
  type: string;
  name: string;
  url?: string;
};

const LINKED_DOC_TYPES: LinkedDocument['type'][] = [
  'client_invoice',
  'purchase_invoice',
  'document',
  'file',
];

function normalizeLinkedDocumentType(type: string): LinkedDocument['type'] {
  return LINKED_DOC_TYPES.includes(type as LinkedDocument['type'])
    ? (type as LinkedDocument['type'])
    : 'document';
}

function toLinkedDocument(doc: MovementDocumentInput): LinkedDocument {
  const base: LinkedDocument = {
    id: doc.id,
    type: normalizeLinkedDocumentType(doc.type),
    name: doc.name,
  };
  if (doc.url !== undefined) {
    base.url = doc.url;
  }
  return base;
}

function hasNonEmptyText(value: string | undefined): boolean {
  return Boolean(value && String(value).trim());
}

async function loadMovementForUser(
  userId: string,
  movementId: string,
): Promise<FinanceMovementRecord> {
  const movements = await listFinanceMovements(userId);
  const movement = movements.find((m) => m.id === movementId || m._id === movementId);
  if (!movement) {
    throw new Error('Movimiento no encontrado');
  }
  if (movement.user_id !== userId) {
    throw new Error('El movimiento no pertenece al usuario indicado');
  }
  return movement;
}

export async function linkDocumentToMovement(
  userId: string,
  movementId: string,
  document: { id: string; type: string; name: string; url?: string },
): Promise<FinanceMovementRecord> {
  const movement = await loadMovementForUser(userId, movementId);
  const linked = toLinkedDocument(document);
  const hasId = movement.linkedDocuments.some((d) => d.id === linked.id);
  const linkedDocuments = hasId
    ? movement.linkedDocuments.map((d) => (d.id === linked.id ? linked : d))
    : [...movement.linkedDocuments, linked];

  return updateFinanceMovementInCouch(userId, {
    ...movement,
    linkedDocuments,
    updatedAt: new Date().toISOString(),
  });
}

export async function unlinkDocumentFromMovement(
  userId: string,
  movementId: string,
  documentId: string,
): Promise<FinanceMovementRecord> {
  const movement = await loadMovementForUser(userId, movementId);
  const linkedDocuments = movement.linkedDocuments.filter((d) => d.id !== documentId);

  return updateFinanceMovementInCouch(userId, {
    ...movement,
    linkedDocuments,
    updatedAt: new Date().toISOString(),
  });
}

export function findMovementsByDocument(
  movements: FinanceMovementRecord[],
  documentId: string,
): FinanceMovementRecord[] {
  return movements.filter((m) => m.linkedDocuments.some((d) => d.id === documentId));
}

export function findMovementsWithoutDocuments(
  movements: FinanceMovementRecord[],
): FinanceMovementRecord[] {
  return movements.filter(
    (m) =>
      m.type === 'pago' &&
      m.linkedDocuments.length === 0 &&
      !hasNonEmptyText(m.attachmentUrl) &&
      !hasNonEmptyText(m.linkedInvoiceId),
  );
}

export function getDocumentCount(movement: FinanceMovementRecord): number {
  let count = movement.linkedDocuments.length;
  if (hasNonEmptyText(movement.attachmentUrl)) count += 1;
  if (hasNonEmptyText(movement.linkedInvoiceId)) count += 1;
  return count;
}
