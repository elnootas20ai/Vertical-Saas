import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiBase } from '../../lib/apiBase';

interface QuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

interface PublicQuote {
  number: string;
  status: string;
  clientName: string;
  companyName: string;
  companyAddress: string;
  companyCif: string;
  lines: QuoteLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  validUntil: string;
  notes: string;
  paymentMethod: string;
  vehicleName: string;
  vehiclePlate: string;
  entityLabel: string;
  entityPlateLabel: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  signature: {
    type: string;
    hash: string;
    method: string;
    timestamp: string;
  } | null;
  createdAt: string;
}

type ViewState = 'loading' | 'preview' | 'confirming' | 'success' | 'error' | 'already_processed';


export function QuotePublicResponse() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const action = searchParams.get('action') || '';

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const apiBase = getApiBase();

  const loadQuote = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/quotes/public?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'No se pudo cargar el presupuesto');
        setViewState('error');
        return;
      }
      setQuote(data.quote);

      if (data.quote.status === 'approved' || data.quote.status === 'rejected') {
        setViewState('already_processed');
      } else {
        setViewState('preview');
      }
    } catch {
      setErrorMsg('Error de conexión. Inténtelo de nuevo más tarde.');
      setViewState('error');
    }
  }, [apiBase, token]);

  useEffect(() => {
    if (!token) {
      setErrorMsg('Enlace inválido: falta el token de seguridad.');
      setViewState('error');
      return;
    }
    loadQuote();
  }, [token, loadQuote]);

  async function handleAction(selectedAction: 'accept' | 'reject') {
    setViewState('confirming');
    try {
      const endpoint = selectedAction === 'accept' ? 'accept' : 'reject';
      const res = await fetch(`${apiBase}/api/quotes/${endpoint}?token=${encodeURIComponent(token)}`, {
        method: 'GET',
      });
      const data = await res.json();

      if (!res.ok && !data.alreadyProcessed) {
        setErrorMsg(data.error || 'Error al procesar la solicitud');
        setViewState('error');
        return;
      }

      if (data.quote) setQuote(data.quote);
      setViewState('success');
    } catch {
      setErrorMsg('Error de conexión. Inténtelo de nuevo más tarde.');
      setViewState('error');
    }
  }

  if (viewState === 'loading') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.loadingSpinner} />
          <p style={styles.loadingText}>Cargando presupuesto...</p>
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.iconCircleError}>
            <span style={{ fontSize: 36 }}>⚠️</span>
          </div>
          <h1 style={styles.title}>Error</h1>
          <p style={styles.subtitle}>{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (viewState === 'confirming') {
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.loadingSpinner} />
          <p style={styles.loadingText}>Procesando...</p>
        </div>
      </div>
    );
  }

  if (viewState === 'success' && quote) {
    const isAccepted = quote.status === 'approved';
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={isAccepted ? styles.iconCircleSuccess : styles.iconCircleReject}>
            <span style={{ fontSize: 36 }}>{isAccepted ? '✅' : '❌'}</span>
          </div>
          <h1 style={styles.title}>
            {isAccepted ? 'Presupuesto aceptado' : 'Presupuesto rechazado'}
          </h1>
          <p style={styles.subtitle}>
            {isAccepted
              ? `Ha aceptado el presupuesto ${quote.number}. Se ha generado una firma digital como confirmación.`
              : `Ha rechazado el presupuesto ${quote.number}. El equipo será notificado.`}
          </p>

          {isAccepted && quote.signature && (
            <div style={styles.signatureBox}>
              <p style={styles.signatureTitle}>Firma digital</p>
              <p style={styles.signatureHash}>
                Hash: <code>{quote.signature.hash}</code>
              </p>
              <p style={styles.signatureDate}>
                Fecha: {new Date(quote.signature.timestamp).toLocaleString('es-ES')}
              </p>
              <p style={styles.signatureMethod}>Método: Aceptación por enlace de email</p>
            </div>
          )}

          <QuoteDetail quote={quote} />
        </div>
      </div>
    );
  }

  if (viewState === 'already_processed' && quote) {
    const isAccepted = quote.status === 'approved';
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={isAccepted ? styles.iconCircleSuccess : styles.iconCircleReject}>
            <span style={{ fontSize: 36 }}>{isAccepted ? '✅' : '❌'}</span>
          </div>
          <h1 style={styles.title}>
            {isAccepted ? 'Presupuesto ya aceptado' : 'Presupuesto ya rechazado'}
          </h1>
          <p style={styles.subtitle}>
            {isAccepted
              ? `Este presupuesto fue aceptado el ${new Date(quote.approvedAt!).toLocaleDateString('es-ES')}.`
              : `Este presupuesto fue rechazado el ${new Date(quote.rejectedAt!).toLocaleDateString('es-ES')}.`}
          </p>

          {isAccepted && quote.signature && (
            <div style={styles.signatureBox}>
              <p style={styles.signatureTitle}>Firma digital registrada</p>
              <p style={styles.signatureHash}>
                Hash: <code>{quote.signature.hash}</code>
              </p>
            </div>
          )}

          <QuoteDetail quote={quote} />
        </div>
      </div>
    );
  }

  // Preview state — show quote + action buttons
  if (quote) {
    const isExpired = new Date(quote.validUntil) < new Date();
    return (
      <div style={styles.wrapper}>
        <div style={styles.card}>
          <div style={styles.header}>
            <div>
              <h1 style={styles.headerTitle}>{quote.companyName || 'Presupuesto'}</h1>
              {quote.companyAddress && (
                <p style={styles.headerSub}>{quote.companyAddress}</p>
              )}
              {quote.companyCif && (
                <p style={styles.headerSub}>CIF: {quote.companyCif}</p>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={styles.quoteNumber}>{quote.number}</p>
              <p style={styles.headerSub}>
                {new Date(quote.createdAt).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>

          <div style={styles.clientBox}>
            <p style={styles.clientLabel}>Cliente</p>
            <p style={styles.clientName}>{quote.clientName}</p>
          </div>

          {quote.vehicleName && (
            <div style={styles.vehicleBox}>
              <span style={{ fontWeight: 600, color: '#0369a1' }}>
                {quote.entityLabel || 'Referencia'}:
              </span>
              <span style={{ marginLeft: 8 }}>
                {quote.vehicleName}
                {quote.vehiclePlate ? ` · ${quote.vehiclePlate}` : ''}
              </span>
            </div>
          )}

          <QuoteDetail quote={quote} />

          {isExpired && (
            <div style={styles.expiredBanner}>
              ⚠️ Este presupuesto venció el{' '}
              {new Date(quote.validUntil).toLocaleDateString('es-ES')}
            </div>
          )}

          {!isExpired && action === 'accept' && (
            <div style={{ marginTop: 24 }}>
              <p style={styles.confirmText}>
                ¿Desea aceptar este presupuesto? Se generará una firma digital como confirmación.
              </p>
              <div style={styles.buttonRow}>
                <button
                  onClick={() => handleAction('accept')}
                  style={styles.btnAccept}
                >
                  ✅ Confirmar aceptación
                </button>
              </div>
            </div>
          )}

          {!isExpired && action === 'reject' && (
            <div style={{ marginTop: 24 }}>
              <p style={styles.confirmText}>
                ¿Desea rechazar este presupuesto?
              </p>
              <div style={styles.buttonRow}>
                <button
                  onClick={() => handleAction('reject')}
                  style={styles.btnReject}
                >
                  ❌ Confirmar rechazo
                </button>
              </div>
            </div>
          )}

          {!isExpired && !action && (
            <div style={styles.buttonRow}>
              <button
                onClick={() => handleAction('accept')}
                style={styles.btnAccept}
              >
                ✅ Aceptar presupuesto
              </button>
              <button
                onClick={() => handleAction('reject')}
                style={styles.btnReject}
              >
                ❌ Rechazar presupuesto
              </button>
            </div>
          )}

          <p style={styles.validUntil}>
            Válido hasta: {new Date(quote.validUntil).toLocaleDateString('es-ES')}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function QuoteDetail({ quote }: { quote: PublicQuote }) {
  return (
    <div style={{ marginTop: 20 }}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.tableHeaderRow}>
            <th style={{ ...styles.th, textAlign: 'left' }}>Concepto</th>
            <th style={{ ...styles.th, textAlign: 'center' }}>Cant.</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Precio</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, i) => (
            <tr key={i} style={i % 2 === 0 ? {} : styles.tableAltRow}>
              <td style={{ ...styles.td, textAlign: 'left' }}>{line.description}</td>
              <td style={{ ...styles.td, textAlign: 'center' }}>{line.quantity}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{line.unitPrice.toFixed(2)} €</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{line.lineTotal.toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={styles.totalsBox}>
        <div style={styles.totalsRow}>
          <span style={styles.totalsLabel}>Subtotal</span>
          <span>{quote.subtotal.toFixed(2)} €</span>
        </div>
        {quote.discountAmount > 0 && (
          <div style={{ ...styles.totalsRow, color: '#059669' }}>
            <span>Descuento</span>
            <span>-{quote.discountAmount.toFixed(2)} €</span>
          </div>
        )}
        <div style={styles.totalsRow}>
          <span style={styles.totalsLabel}>IVA</span>
          <span>{quote.taxAmount.toFixed(2)} €</span>
        </div>
        <div style={styles.totalsTotal}>
          <span>TOTAL</span>
          <span>{quote.total.toFixed(2)} €</span>
        </div>
      </div>

      {quote.notes && (
        <div style={styles.notesBox}>
          <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13, color: '#92400e' }}>Notas</p>
          <p style={{ margin: 0, fontSize: 14, color: '#78350f', lineHeight: 1.5 }}>{quote.notes}</p>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    background: '#f5f5f5',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    maxWidth: 660,
    width: '100%',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.04)',
    border: '1px solid #e5e7eb',
  },
  loadingSpinner: {
    width: 40,
    height: 40,
    border: '4px solid #e5e7eb',
    borderTopColor: '#000',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 16px',
  },
  loadingText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 15,
  },
  iconCircleSuccess: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#ecfdf5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  iconCircleReject: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#fef2f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  iconCircleError: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#fffbeb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: 24,
    fontWeight: 700,
    color: '#111',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 24px',
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 1.6,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 20,
    borderBottom: '1px solid #e5e7eb',
  },
  headerTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#111',
  },
  headerSub: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#6b7280',
  },
  quoteNumber: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    color: '#374151',
  },
  clientBox: {
    marginBottom: 16,
  },
  clientLabel: {
    margin: '0 0 2px',
    fontSize: 12,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  clientName: {
    margin: 0,
    fontSize: 16,
    color: '#111',
    fontWeight: 500,
  },
  vehicleBox: {
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    color: '#0c4a6e',
    marginBottom: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    background: '#f9fafb',
  },
  th: {
    padding: '10px 12px',
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '10px 12px',
    fontSize: 14,
    color: '#374151',
    borderBottom: '1px solid #f3f4f6',
  },
  tableAltRow: {
    background: '#f9fafb',
  },
  totalsBox: {
    marginTop: 16,
    paddingTop: 12,
  },
  totalsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 14,
    color: '#374151',
  },
  totalsLabel: {
    color: '#6b7280',
  },
  totalsTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0 4px',
    fontSize: 18,
    fontWeight: 700,
    color: '#111',
    borderTop: '2px solid #111',
    marginTop: 8,
  },
  notesBox: {
    marginTop: 16,
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    borderRadius: 8,
    padding: '12px 16px',
  },
  signatureBox: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: '16px',
    marginBottom: 20,
    textAlign: 'center',
  },
  signatureTitle: {
    margin: '0 0 8px',
    fontSize: 14,
    fontWeight: 600,
    color: '#166534',
  },
  signatureHash: {
    margin: '0 0 4px',
    fontSize: 13,
    color: '#15803d',
  },
  signatureDate: {
    margin: '0 0 4px',
    fontSize: 13,
    color: '#15803d',
  },
  signatureMethod: {
    margin: 0,
    fontSize: 12,
    color: '#16a34a',
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
    marginTop: 24,
    justifyContent: 'center',
  },
  btnAccept: {
    background: '#059669',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 28px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    flex: 1,
    maxWidth: 260,
  },
  btnReject: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 28px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    flex: 1,
    maxWidth: 260,
  },
  confirmText: {
    textAlign: 'center',
    color: '#374151',
    fontSize: 15,
    lineHeight: 1.6,
    margin: '0 0 8px',
  },
  validUntil: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 20,
  },
  expiredBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: 600,
    textAlign: 'center',
    marginTop: 20,
  },
};
