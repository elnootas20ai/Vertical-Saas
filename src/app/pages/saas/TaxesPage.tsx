import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { listFinanceMovements } from '../../lib/financeApi';
import type { FinanceMovementRecord } from '../../lib/financeTypes';
import {
  buildVatBook, downloadVatCsv, getAvailableYears,
  type VatQuarterSummary, type VatBookSummary,
} from '../../lib/vatBookApi';
import {
  Landmark, Calendar, Download,
  TrendingUp, TrendingDown, FileText,
  CheckCircle2, AlertTriangle, BarChart3, Receipt,
} from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export function TaxesPage() {
  const { user } = useAuth();
  const [movements, setMovements] = useState<FinanceMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedQuarter, setExpandedQuarter] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try { setMovements(await listFinanceMovements(user.id)); } catch { toast.error('Error al cargar datos fiscales'); } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const years = useMemo(() => getAvailableYears(movements), [movements]);
  const vatBook: VatBookSummary = useMemo(() => buildVatBook(movements, selectedYear), [movements, selectedYear]);

  const taxSummary = useMemo(() => {
    const yearMvs = movements.filter(m => m.date.startsWith(String(selectedYear)));
    const totalTaxCollected = yearMvs.filter(m => m.type === 'cobro').reduce((s, m) => s + m.taxAmount, 0);
    const totalTaxPaid = yearMvs.filter(m => m.type === 'pago').reduce((s, m) => s + m.taxAmount, 0);
    const taxExpenses = yearMvs.filter(m => m.type === 'pago' && m.category === 'impuestos').reduce((s, m) => s + m.totalAmount, 0);
    const income = yearMvs.filter(m => m.type === 'cobro').reduce((s, m) => s + m.amountBase, 0);
    const irpfEstimate = income * 0.20;
    return { totalTaxCollected, totalTaxPaid, taxExpenses, irpfEstimate, netVat: totalTaxCollected - totalTaxPaid, income };
  }, [movements, selectedYear]);

  const tabsConfig = [
    { id: 'summary', label: 'Resumen fiscal' },
    { id: 'vat-book', label: 'Libro de IVA' },
    { id: 'quarterly', label: 'Trimestral' },
  ];

  const renderQuarterCard = (q: VatQuarterSummary) => {
    const isExpanded = expandedQuarter === q.quarter;
    const resultColor = q.result === 'a_ingresar' ? 'text-red-600' : q.result === 'a_devolver' ? 'text-green-600' : 'text-gray-500';
    const resultBg = q.result === 'a_ingresar' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : q.result === 'a_devolver' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700';

    return (
      <div key={q.quarter} className={`border-2 rounded-xl overflow-hidden transition-all ${resultBg}`}>
        <button onClick={() => setExpandedQuarter(isExpanded ? null : q.quarter)} className="w-full p-4 flex items-center justify-between text-left">
          <div>
            <h4 className="font-bold text-gray-900 dark:text-gray-100 text-lg">{q.label}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(q.startDate).toLocaleDateString('es-ES')} — {new Date(q.endDate).toLocaleDateString('es-ES')}</p>
          </div>
          <div className="text-right">
            <div className={`text-xl font-bold ${resultColor}`}>{fmt(q.netVat)}€</div>
            <div className={`text-xs font-semibold ${resultColor}`}>
              {q.result === 'a_ingresar' ? 'A ingresar' : q.result === 'a_devolver' ? 'A devolver' : 'Cero'}
            </div>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">IVA Repercutido (cobros)</h5>
                <div className="text-lg font-bold text-green-700 dark:text-green-400">{fmt(q.repercutido.tax)}€</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Base: {fmt(q.repercutido.base)}€ · {q.repercutido.entries.length} mov.</div>
                {Object.entries(q.repercutido.byRate).map(([rate, data]) => (
                  <div key={rate} className="text-xs text-gray-500 dark:text-gray-400 mt-1">  {rate}%: base {fmt(data.base)}€ → IVA {fmt(data.tax)}€</div>
                ))}
              </div>
              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">IVA Soportado (pagos)</h5>
                <div className="text-lg font-bold text-red-600">{fmt(q.soportado.tax)}€</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Base: {fmt(q.soportado.base)}€ · {q.soportado.entries.length} mov.</div>
                {Object.entries(q.soportado.byRate).map(([rate, data]) => (
                  <div key={rate} className="text-xs text-gray-500 dark:text-gray-400 mt-1">  {rate}%: base {fmt(data.base)}€ → IVA {fmt(data.tax)}€</div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => downloadVatCsv(q)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Descargar CSV {q.label}
              </button>
            </div>

            {q.repercutido.entries.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Detalle repercutido</h5>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {q.repercutido.entries.map(e => (
                    <div key={e.movementId} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div><span className="text-gray-700 dark:text-gray-300">{e.concept}</span> <span className="text-gray-400">{new Date(e.date).toLocaleDateString('es-ES')}</span></div>
                      <span className="font-bold text-green-700 dark:text-green-400">{fmt(e.taxAmount)}€</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {q.soportado.entries.length > 0 && (
              <div>
                <h5 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Detalle soportado</h5>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {q.soportado.entries.map(e => (
                    <div key={e.movementId} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div><span className="text-gray-700 dark:text-gray-300">{e.concept}</span> <span className="text-gray-400">{new Date(e.date).toLocaleDateString('es-ES')}</span></div>
                      <span className="font-bold text-red-600">{fmt(e.taxAmount)}€</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout title="Impuestos" subtitle="Control fiscal, IVA trimestral y obligaciones tributarias">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {years.map(y => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />Cargando datos fiscales...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <div className="text-green-600 mb-2"><TrendingUp className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-200">{fmt(taxSummary.totalTaxCollected)}€</div>
                <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">IVA repercutido</div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                <div className="text-red-600 mb-2"><TrendingDown className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-red-900 dark:text-red-200">{fmt(taxSummary.totalTaxPaid)}€</div>
                <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">IVA soportado</div>
              </div>
              <div className={`p-4 border-2 rounded-xl ${taxSummary.netVat >= 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'}`}>
                <div className={`mb-2 ${taxSummary.netVat >= 0 ? 'text-amber-600' : 'text-blue-600'}`}><Landmark className="w-5 h-5" /></div>
                <div className={`text-2xl font-bold ${taxSummary.netVat >= 0 ? 'text-amber-900 dark:text-amber-200' : 'text-blue-900 dark:text-blue-200'}`}>{fmt(vatBook.annualNet)}€</div>
                <div className={`text-xs mt-0.5 ${taxSummary.netVat >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>IVA neto {taxSummary.netVat >= 0 ? '(a ingresar)' : '(a devolver)'}</div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
                <div className="text-purple-600 mb-2"><Receipt className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{fmt(taxSummary.irpfEstimate)}€</div>
                <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">IRPF estimado (20%)</div>
              </div>
            </div>

            <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-gray-500" /> Resumen fiscal {selectedYear}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">Base imponible ingresos</span><span className="font-bold text-gray-900 dark:text-gray-100">{fmt(taxSummary.income)}€</span></div>
                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">IVA repercutido total</span><span className="font-bold text-green-700 dark:text-green-400">{fmt(vatBook.annualRepercutido)}€</span></div>
                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">IVA soportado total</span><span className="font-bold text-red-600">{fmt(vatBook.annualSoportado)}€</span></div>
                    <div className="flex justify-between py-3 border-t-2 border-gray-300 dark:border-gray-600"><span className="text-sm font-bold text-gray-900 dark:text-gray-100">IVA neto anual</span><span className={`font-bold text-lg ${vatBook.annualNet >= 0 ? 'text-amber-700' : 'text-blue-700 dark:text-blue-400'}`}>{fmt(vatBook.annualNet)}€</span></div>
                    <div className="flex justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400">Gastos categoría "impuestos"</span><span className="font-bold text-red-600">{fmt(taxSummary.taxExpenses)}€</span></div>
                    <div className="flex justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400">IRPF estimado (20% s/ ingresos)</span><span className="font-bold text-purple-700 dark:text-purple-400">{fmt(taxSummary.irpfEstimate)}€</span></div>
                  </div>
                </div>

                {vatBook.annualNet > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-900 dark:text-amber-300">Obligación de pago de IVA</p>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Tienes un saldo de IVA a ingresar de {fmt(vatBook.annualNet)}€. Revisa las liquidaciones trimestrales para presentar el modelo 303.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'vat-book' && (
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead><tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Trimestre</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Base rep.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA rep.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Base sop.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA sop.</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA neto</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Resultado</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">CSV</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {vatBook.quarters.map(q => (
                        <tr key={q.quarter} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{q.label}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(q.repercutido.base)}€</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-green-700 dark:text-green-400">{fmt(q.repercutido.tax)}€</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(q.soportado.base)}€</td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(q.soportado.tax)}€</td>
                          <td className={`px-4 py-3 text-sm text-right font-bold ${q.netVat >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>{fmt(q.netVat)}€</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 text-xs font-bold rounded-full ${q.result === 'a_ingresar' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : q.result === 'a_devolver' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                              {q.result === 'a_ingresar' ? 'A ingresar' : q.result === 'a_devolver' ? 'A devolver' : 'Cero'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => downloadVatCsv(q)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Descargar CSV"><Download className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 dark:bg-gray-900 font-bold">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">ANUAL</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(vatBook.quarters.reduce((s, q) => s + q.repercutido.base, 0))}€</td>
                        <td className="px-4 py-3 text-sm text-right text-green-700 dark:text-green-400">{fmt(vatBook.annualRepercutido)}€</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(vatBook.quarters.reduce((s, q) => s + q.soportado.base, 0))}€</td>
                        <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(vatBook.annualSoportado)}€</td>
                        <td className={`px-4 py-3 text-sm text-right font-bold ${vatBook.annualNet >= 0 ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}>{fmt(vatBook.annualNet)}€</td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'quarterly' && (
              <div className="space-y-4">
                {vatBook.quarters.map(q => renderQuarterCard(q))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
