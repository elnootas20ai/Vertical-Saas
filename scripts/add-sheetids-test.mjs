import fs from 'fs';

const testPath = 'tests/cajaFacturacionExcelExport.test.js';
let t = fs.readFileSync(testPath, 'utf8');

if (t.includes('closingBrandSheetIds')) {
  console.log('already present');
  process.exit(0);
}

const needle = `    expect(mm.glovo).toBe(70);
    expect(bb.glovo).toBe(30);
    expect(mm.total + bb.total).toBe(200);
  });
});
`;

const nl = t.includes('\r\n') ? '\r\n' : '\n';
const needleN = needle.replace(/\n/g, nl);

if (!t.includes(needleN)) {
  console.error('anchor missing');
  const i = t.indexOf('expect(mm.glovo).toBe(70)');
  console.log(JSON.stringify(t.slice(i, i + 120)));
  process.exit(1);
}

const insert = `    expect(mm.glovo).toBe(70);
    expect(bb.glovo).toBe(30);
    expect(mm.total + bb.total).toBe(200);
  });

  it('Total MM/BB del cierre van a su hoja via closingBrandSheetIds (4 pestanas)', () => {
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
        'uuid-mm': 'Modomio Random',
        'uuid-bb': 'Black Random',
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
});
`.replace(/\n/g, nl);

t = t.replace(needleN, insert);
fs.writeFileSync(testPath, t);
console.log('inserted ok');
