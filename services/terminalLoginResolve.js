function isOpenPdv(d, exclude) {
  return (
    d?.type === 'point_of_sale' &&
    !d?.deletedAt &&
    d.active !== false &&
    (!exclude || d._id !== exclude)
  );
}

/** Resuelve código tablet (PDV) o código de terminal TPV de sala. */
export function resolveTerminalLoginFromDocs(docs, terminalCode, excludePdvId = '') {
  const code = String(terminalCode || '').trim().toUpperCase();
  if (!code) return null;
  const exclude = String(excludePdvId || '').trim();
  const list = Array.isArray(docs) ? docs : [];

  const byTerminal = list.find(
    (d) => isOpenPdv(d, exclude) && String(d.terminalCode || '').toUpperCase() === code,
  );
  if (byTerminal) return { pdv: byTerminal, salaTerminalId: null };

  const byPdvCode = list.find(
    (d) => isOpenPdv(d, exclude) && String(d.code || '').trim().toUpperCase() === code,
  );
  if (byPdvCode) return { pdv: byPdvCode, salaTerminalId: null };

  for (const d of list) {
    if (!isOpenPdv(d, exclude)) continue;
    const terminals = Array.isArray(d.terminals) ? d.terminals : [];
    const match = terminals.find(
      (t) =>
        t?.active !== false &&
        String(t.code || '').trim().toUpperCase() === code,
    );
    if (match) {
      return { pdv: d, salaTerminalId: String(match.id || '').trim() || null };
    }
  }

  return null;
}
