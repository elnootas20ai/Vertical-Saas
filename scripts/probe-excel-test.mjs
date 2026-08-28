import fs from 'fs';

const testPath = 'tests/cajaFacturacionExcelExport.test.js';
let t = fs.readFileSync(testPath, 'utf8');

const marker = "it('sin brandIds en hojas, enlaza por nombre del cierre";
const idx = t.indexOf(marker);
if (idx < 0) {
  // try alternate
  const alts = [
    "it('sin brandIds en hojas",
    "it('sin brandIds",
    "en hojas, enlaza por nombre",
  ];
  for (const a of alts) console.log(a, t.indexOf(a));
  process.exit(1);
}

// Find end of that it() block - next "  it(" or "});" of describe
const after = t.indexOf("\n  it(", idx + 5);
const insertAt = after > 0 ? after : t.indexOf('\n});', idx);

const newTest = `
  it('Total MM/BB del cierre van a su hoja vía closingBrandSheetIds (4 pestañas)', () => {
    const sheets = [
      {
        id: 'sheet-mm',
        label: 'MODOMIO',
        brandIds: [],
        unitColumns: [{ key: 'pizza', header: 'TOTAL PIZZA' }],
      },
      {
        id: 'sheet-bb',
        label: 'BLACK BURGER',
        brandIds: [],
        unitColumns: [{ key: 'burger', header: 'TOTAL BURGUER' }],
      },
    ];
    const session = closedSession({
      summary: {
        salesByMethod: { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 },
        salesByChannel: {},
        totalSales: 0,
      },
      closingBrandLabels: {
        'uuid-mm': 'Modomio',
        'uuid-bb': 'Black Burger',
      },
      closingBrandSheetIds: {
        'uuid-mm': 'sheet-mm',
        'uuid-bb': 'sheet-bb',
      },
      aggregatorClosingTotals: { glovo: 200, ubereats: 100 },
      aggregatorClosingBrandTotals: {
        glovo: { 'uuid-mm': 150, 'uuid-bb': 50 },
        ubereats: { 'uuid-mm': 40, 'uuid-bb': 60 },
      },
      productClosingCounts: { pizza: 10, burger: 10, taco: 0 },
    });
    const mm = splitSessionCajaAmountsByBillingSheet(session, sheets[0], sheets);
    const bb = splitSessionCajaAmountsByBillingSheet(session, sheets[1], sheets);
    expect(mm.glovo).toBe(150);
    expect(bb.glovo).toBe(50);
    expect(mm.uber).toBe(40);
    expect(bb.uber).toBe(60);
    expect(mm.total + bb.total).toBe(300);
  });
`;

// Detect export name used in tests
const splitName = t.includes('splitSessionCajaAmountsByBillingSheet')
  ? 'splitSessionCajaAmountsByBillingSheet'
  : t.includes('splitSessionCajaAmountsByBillingSheet')
    ? 'splitSessionCajaAmountsByBillingSheet'
    : null;
console.log('splitName', splitName);
console.log('glovo vs glovo', t.includes('glovo'), t.includes('.glovo'));
console.log('productClosingCounts', t.includes('productClosingCounts'), t.includes('productClosingCounts'));
console.log('aggregatorClosingBrandTotals', t.includes('aggregatorClosingBrandTotals'));
console.log('unitColumns', t.includes('unitColumns'), t.includes('unitColumns'));
console.log('brandIds', t.includes('brandIds'), t.includes('brandIds'));

// Peek closedSession fields
const cs = t.indexOf('function closedSession');
console.log(t.slice(cs, cs + 500));
