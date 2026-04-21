/**
 * Generador de facturas electrónicas en formato FacturaE 3.2.1
 * Cumple con la Ley 18/2022 de creación y crecimiento de empresas (España)
 * y con el formato técnico del SII de la AEAT.
 *
 * Referencias:
 *  - FacturaE schema: https://www.facturae.gob.es/formato/Paginas/version-3-2.aspx
 *  - AEAT SII: https://www.agenciatributaria.es/AEAT.internet/SII.html
 */

export interface XmlIssuer {
  taxId: string;
  name: string;
  address: string;
  city: string;
  province?: string;
  postalCode: string;
  countryCode?: string;
}

export interface XmlRecipient {
  taxId: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface XmlInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate: number;
}

export interface XmlInvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  issuer: XmlIssuer;
  recipient: XmlRecipient;
  lines: XmlInvoiceLine[];
  paymentMethod?: string;
  notes?: string;
  invoiceSeries?: string;
  currency?: string;
}

function esc(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fixed2(n: number): string {
  return n.toFixed(2);
}

/** Mapeo de forma de pago al código de FacturaE */
function payMethodCode(method?: string): string {
  const m = (method || '').toLowerCase();
  if (m.includes('transfer')) return '04'; // Transferencia
  if (m.includes('efectivo') || m.includes('cash')) return '01'; // En especie / efectivo
  if (m.includes('tarjeta') || m.includes('card')) return '19'; // Domiciliación (aproximación)
  if (m.includes('domicil')) return '02'; // Recibo domiciliado
  if (m.includes('bizum') || m.includes('paypal')) return '15'; // Transferencia (aproximación)
  return '04'; // Transferencia por defecto
}

interface TaxGroup {
  rate: number;
  base: number;
  amount: number;
}

export function generateInvoiceXml(data: XmlInvoiceData): string {
  const currency = data.currency || 'EUR';

  // Calcular totales por línea
  const processedLines = data.lines.map((line) => {
    const discountFactor = 1 - (line.discountPercent || 0) / 100;
    const base = line.quantity * line.unitPrice * discountFactor;
    const taxAmount = base * (line.taxRate / 100);
    const total = base + taxAmount;
    return { ...line, base, taxAmount, total };
  });

  // Agrupar impuestos
  const taxGroups = processedLines.reduce<Record<number, TaxGroup>>((acc, line) => {
    if (!acc[line.taxRate]) {
      acc[line.taxRate] = { rate: line.taxRate, base: 0, amount: 0 };
    }
    acc[line.taxRate].base += line.base;
    acc[line.taxRate].amount += line.taxAmount;
    return acc;
  }, {});

  const totalBase = processedLines.reduce((s, l) => s + l.base, 0);
  const totalTax = processedLines.reduce((s, l) => s + l.taxAmount, 0);
  const totalAmount = totalBase + totalTax;

  const issueDate = formatDate(data.issueDate);
  const dueDate = data.dueDate ? formatDate(data.dueDate) : issueDate;
  const series = data.invoiceSeries || 'A';

  const linesXml = processedLines
    .map(
      (line, idx) => `
        <InvoiceLine>
          <ItemDescription>${esc(line.description)}</ItemDescription>
          <Quantity>${fixed2(line.quantity)}</Quantity>
          <UnitOfMeasure>01</UnitOfMeasure>
          <UnitPriceWithoutTax>${fixed2(line.unitPrice)}</UnitPriceWithoutTax>
          <TotalCost>${fixed2(line.quantity * line.unitPrice)}</TotalCost>
          ${line.discountPercent ? `<DiscountsAndRebates><Discount><DiscountReason>Descuento</DiscountReason><DiscountRate>${fixed2(line.discountPercent)}</DiscountRate><DiscountAmount>${fixed2(line.quantity * line.unitPrice * (line.discountPercent / 100))}</DiscountAmount></Discount></DiscountsAndRebates>` : ''}
          <GrossAmount>${fixed2(line.base)}</GrossAmount>
          <TaxesOutputs>
            <Tax>
              <TaxTypeCode>01</TaxTypeCode>
              <TaxRate>${fixed2(line.taxRate)}</TaxRate>
              <TaxableBase>
                <TotalAmount>${fixed2(line.base)}</TotalAmount>
              </TaxableBase>
              <TaxAmount>
                <TotalAmount>${fixed2(line.taxAmount)}</TotalAmount>
              </TaxAmount>
            </Tax>
          </TaxesOutputs>
          <LineItemPeriod>
            <StartDate>${issueDate}</StartDate>
            <EndDate>${dueDate}</EndDate>
          </LineItemPeriod>
          <TransactionDate>${issueDate}</TransactionDate>
          <ArticleCode>ART${String(idx + 1).padStart(3, '0')}</ArticleCode>
        </InvoiceLine>`,
    )
    .join('');

  const taxesXml = Object.values(taxGroups)
    .map(
      (tg) => `
            <Tax>
              <TaxTypeCode>01</TaxTypeCode>
              <TaxRate>${fixed2(tg.rate)}</TaxRate>
              <TaxableBase>
                <TotalAmount>${fixed2(tg.base)}</TotalAmount>
                <EquivalentInEuros>${fixed2(tg.base)}</EquivalentInEuros>
              </TaxableBase>
              <TaxAmount>
                <TotalAmount>${fixed2(tg.amount)}</TotalAmount>
                <EquivalentInEuros>${fixed2(tg.amount)}</EquivalentInEuros>
              </TaxAmount>
            </Tax>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xslt"
             xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xslt">
  <FileHeader>
    <SchemaVersion>3.2.2</SchemaVersion>
    <Modality>I</Modality>
    <InvoiceIssuerType>EM</InvoiceIssuerType>
    <Batch>
      <BatchIdentifier>${esc(data.invoiceNumber)}</BatchIdentifier>
      <InvoicesCount>1</InvoicesCount>
      <TotalInvoicesAmount>
        <TotalAmount>${fixed2(totalAmount)}</TotalAmount>
        <EquivalentInEuros>${fixed2(totalAmount)}</EquivalentInEuros>
      </TotalInvoicesAmount>
      <TotalOutstandingAmount>
        <TotalAmount>${fixed2(totalAmount)}</TotalAmount>
        <EquivalentInEuros>${fixed2(totalAmount)}</EquivalentInEuros>
      </TotalOutstandingAmount>
      <TotalExecutableAmount>
        <TotalAmount>${fixed2(totalAmount)}</TotalAmount>
        <EquivalentInEuros>${fixed2(totalAmount)}</EquivalentInEuros>
      </TotalExecutableAmount>
      <InvoiceCurrencyCode>${currency}</InvoiceCurrencyCode>
    </Batch>
  </FileHeader>
  <Parties>
    <SellerParty>
      <TaxIdentification>
        <PersonTypeCode>J</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(data.issuer.taxId)}</TaxIdentificationNumber>
      </TaxIdentification>
      <LegalEntity>
        <CorporateName>${esc(data.issuer.name)}</CorporateName>
        <AddressInSpain>
          <Address>${esc(data.issuer.address)}</Address>
          <PostCode>${esc(data.issuer.postalCode)}</PostCode>
          <Town>${esc(data.issuer.city)}</Town>
          <Province>${esc(data.issuer.province || data.issuer.city)}</Province>
          <CountryCode>${data.issuer.countryCode || 'ESP'}</CountryCode>
        </AddressInSpain>
      </LegalEntity>
    </SellerParty>
    <BuyerParty>
      <TaxIdentification>
        <PersonTypeCode>${data.recipient.taxId?.length > 9 ? 'J' : 'F'}</PersonTypeCode>
        <ResidenceTypeCode>R</ResidenceTypeCode>
        <TaxIdentificationNumber>${esc(data.recipient.taxId || 'UNKNOWN')}</TaxIdentificationNumber>
      </TaxIdentification>
      <Individual>
        <Name>${esc(data.recipient.name)}</Name>
        <FirstSurname>${esc(data.recipient.name)}</FirstSurname>
        ${
          data.recipient.address
            ? `<AddressInSpain>
          <Address>${esc(data.recipient.address)}</Address>
          <PostCode>${esc(data.recipient.postalCode || '')}</PostCode>
          <Town>${esc(data.recipient.city || '')}</Town>
          <Province>${esc(data.recipient.city || '')}</Province>
          <CountryCode>${data.recipient.countryCode || 'ESP'}</CountryCode>
        </AddressInSpain>`
            : ''
        }
      </Individual>
    </BuyerParty>
  </Parties>
  <Invoices>
    <Invoice>
      <InvoiceHeader>
        <InvoiceNumber>${esc(data.invoiceNumber)}</InvoiceNumber>
        <InvoiceSeriesCode>${esc(series)}</InvoiceSeriesCode>
        <InvoiceDocumentType>FC</InvoiceDocumentType>
        <InvoiceClass>OO</InvoiceClass>
      </InvoiceHeader>
      <InvoiceIssueData>
        <IssueDate>${issueDate}</IssueDate>
        <InvoiceCurrencyCode>${currency}</InvoiceCurrencyCode>
        <TaxCurrencyCode>${currency}</TaxCurrencyCode>
        <LanguageName>es</LanguageName>
      </InvoiceIssueData>
      <TaxesOutputs>${taxesXml}
      </TaxesOutputs>
      <InvoiceTotals>
        <TotalGrossAmount>${fixed2(totalBase)}</TotalGrossAmount>
        <TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>
        <TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>
        <TotalGrossAmountBeforeTaxes>${fixed2(totalBase)}</TotalGrossAmountBeforeTaxes>
        <TotalTaxOutputs>${fixed2(totalTax)}</TotalTaxOutputs>
        <TotalTaxesWithheld>0.00</TotalTaxesWithheld>
        <InvoiceTotal>${fixed2(totalAmount)}</InvoiceTotal>
        <TotalOutstandingAmount>${fixed2(totalAmount)}</TotalOutstandingAmount>
        <TotalExecutableAmount>${fixed2(totalAmount)}</TotalExecutableAmount>
      </InvoiceTotals>
      <Items>${linesXml}
      </Items>
      <PaymentDetails>
        <Installment>
          <InstallmentDueDate>${dueDate}</InstallmentDueDate>
          <InstallmentAmount>${fixed2(totalAmount)}</InstallmentAmount>
          <PaymentMeans>${payMethodCode(data.paymentMethod)}</PaymentMeans>
        </Installment>
      </PaymentDetails>
      ${
        data.notes
          ? `<AdditionalData>
        <InvoiceAdditionalInformation>${esc(data.notes)}</InvoiceAdditionalInformation>
      </AdditionalData>`
          : ''
      }
    </Invoice>
  </Invoices>
</fe:Facturae>`;

  return xml;
}

export function downloadInvoiceXml(data: XmlInvoiceData): void {
  const xml = generateInvoiceXml(data);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FacturaE-${data.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Construye XmlInvoiceData desde un ClientInvoiceRecord + datos de empresa */
export function buildXmlFromClientInvoice(params: {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  issuerTaxId: string;
  issuerName: string;
  issuerAddress: string;
  issuerCity: string;
  issuerPostalCode: string;
  recipientTaxId: string;
  recipientName: string;
  recipientAddress?: string;
  recipientCity?: string;
  vehicleName: string;
  totalBase: number;
  taxRate: number;
  paymentMethod?: string;
  notes?: string;
}): XmlInvoiceData {
  return {
    invoiceNumber: params.invoiceNumber,
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    issuer: {
      taxId: params.issuerTaxId,
      name: params.issuerName,
      address: params.issuerAddress,
      city: params.issuerCity,
      postalCode: params.issuerPostalCode,
    },
    recipient: {
      taxId: params.recipientTaxId,
      name: params.recipientName,
      address: params.recipientAddress,
      city: params.recipientCity,
      postalCode: '',
    },
    lines: [
      {
        description: `Venta de vehículo: ${params.vehicleName}`,
        quantity: 1,
        unitPrice: params.totalBase,
        taxRate: params.taxRate,
      },
    ],
    paymentMethod: params.paymentMethod,
    notes: params.notes,
  };
}
