import fs from 'fs';
const t = fs.readFileSync('tests/cajaFacturacionExcelExport.test.js', 'utf8');
const start = t.indexOf("describe('splitSessionCajaAmountsByBillingSheet'");
const end = t.indexOf("\ndescribe(", start + 10);
console.log(t.slice(start, end > 0 ? end : start + 8000).slice(-2500));
