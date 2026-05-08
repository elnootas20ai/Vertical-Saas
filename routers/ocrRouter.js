import { Router } from 'express';
import {
  getOcrLogsDbName, ensureDatabase, getDocument, putDocument,
  sanitizeOcrLog, sanitizeOcrProposal, listOcrLogsByUser, listOcrProposalsByUser,
} from '../services/couchdb.js';
import { processOcrResult, executeProposal, checkDuplicate } from '../services/ocrRouter.js';
import logger from '../services/logger.js';

const fakeReq = { headers: {} };
export const ocrApiRouter = Router();

ocrApiRouter.post('/process', async (req, res) => {
  try {
    const userId = req.authUser?.userId || req.userId || req.body?.userId;
    if (!userId) return res.status(401).json({ error: 'Se requiere autenticacion' });
    const b = req.body || {};
    if (!b.ocrData) return res.status(400).json({ error: 'Se requiere ocrData' });
    const result = await processOcrResult({
      ocrData: b.ocrData, userId, sourceFileName: b.sourceFileName,
      sourceMimeType: b.sourceMimeType, sourceSize: b.sourceSize,
      sourceHash: b.sourceHash, sourceImageBase64: b.sourceImageBase64,
      processingTimeMs: b.processingTimeMs, tokensUsed: b.tokensUsed,
      model: b.model, forceDuplicate: Boolean(b.forceDuplicate),
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ tag: 'OCR-API', error: error.message }, 'Process failed');
    return res.status(500).json({ error: error.message || 'Error procesando OCR' });
  }
});

ocrApiRouter.post('/proposals/:id/approve', async (req, res) => {
  try {
    const userId = req.authUser?.userId || req.userId || req.body?.userId;
    if (!userId) return res.status(401).json({ error: 'Se requiere autenticacion' });
    const db = getOcrLogsDbName();
    await ensureDatabase(fakeReq, db);
    const proposal = await getDocument(fakeReq, db, req.params.id);
    if (!proposal || proposal.type !== 'ocr_proposal') return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (req.body?.fields) Object.assign(proposal.fields, req.body.fields);
    const routeResult = await executeProposal(proposal, userId);
    const now = new Date().toISOString();
    Object.assign(proposal, { status: 'approved', approvedBy: userId, approvedAt: now, createdDocumentId: routeResult.documentId, createdDocumentDb: routeResult.database, updatedAt: now });
    await putDocument(fakeReq, db, proposal._id, proposal);
    return res.json({ ok: true, routeResult, proposal: sanitizeOcrProposal(proposal) });
  } catch (error) {
    logger.error({ tag: 'OCR-API', error: error.message }, 'Approve failed');
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.post('/proposals/:id/reject', async (req, res) => {
  try {
    const userId = req.authUser?.userId || req.userId || req.body?.userId;
    const db = getOcrLogsDbName();
    await ensureDatabase(fakeReq, db);
    const proposal = await getDocument(fakeReq, db, req.params.id);
    if (!proposal || proposal.type !== 'ocr_proposal') return res.status(404).json({ error: 'Propuesta no encontrada' });
    const now = new Date().toISOString();
    Object.assign(proposal, { status: 'rejected', rejectedBy: userId, rejectedAt: now, updatedAt: now });
    await putDocument(fakeReq, db, proposal._id, proposal);
    return res.json({ ok: true, proposal: sanitizeOcrProposal(proposal) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.patch('/proposals/:id', async (req, res) => {
  try {
    const db = getOcrLogsDbName();
    await ensureDatabase(fakeReq, db);
    const proposal = await getDocument(fakeReq, db, req.params.id);
    if (!proposal || proposal.type !== 'ocr_proposal') return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (req.body?.fields) Object.assign(proposal.fields, req.body.fields);
    if (req.body?.destination) Object.assign(proposal.destination, req.body.destination);
    proposal.updatedAt = new Date().toISOString();
    await putDocument(fakeReq, db, proposal._id, proposal);
    return res.json({ ok: true, proposal: sanitizeOcrProposal(proposal) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.get('/proposals', async (req, res) => {
  try {
    const proposals = await listOcrProposalsByUser(fakeReq, req.userId);
    const s = req.query.status;
    const list = s ? proposals.filter((p) => p.status === s) : proposals;
    return res.json({ ok: true, proposals: list.map(sanitizeOcrProposal) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.get('/logs', async (req, res) => {
  try {
    const logs = await listOcrLogsByUser(fakeReq, req.userId);
    return res.json({ ok: true, logs: logs.map(sanitizeOcrLog) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.get('/logs/:id', async (req, res) => {
  try {
    const db = getOcrLogsDbName();
    await ensureDatabase(fakeReq, db);
    const doc = await getDocument(fakeReq, db, req.params.id);
    if (!doc || doc.type !== 'ocr_processing_log') return res.status(404).json({ error: 'Log no encontrado' });
    return res.json({ ok: true, log: sanitizeOcrLog(doc) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.get('/stats', async (req, res) => {
  try {
    const logs = await listOcrLogsByUser(fakeReq, req.userId);
    const total = logs.length;
    const completed = logs.filter((l) => l.status === 'completed' || l.status === 'auto_approved').length;
    const pending = logs.filter((l) => l.status === 'pending_review').length;
    const duplicates = logs.filter((l) => l.status === 'duplicate').length;
    const failed = logs.filter((l) => l.status === 'failed').length;
    const byType = {};
    for (const log of logs) { const t = log.detectedDocumentType || 'otro'; byType[t] = (byType[t] || 0) + 1; }
    const avgConfidence = total > 0 ? Math.round(logs.reduce((s, l) => s + (l.confidence || 0), 0) / total) : 0;
    const proposals = await listOcrProposalsByUser(fakeReq, req.userId);
    const pendingProposals = proposals.filter((p) => p.status === 'pending_review').length;
    return res.json({ ok: true, stats: { total, completed, pending, duplicates, failed, avgConfidence, byType, pendingProposals } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

ocrApiRouter.post('/check-duplicate', async (req, res) => {
  try {
    const b = req.body || {};
    const result = await checkDuplicate(b.sourceHash, b.ocrData, req.userId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
