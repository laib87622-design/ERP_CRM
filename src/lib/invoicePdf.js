import { supabase } from './supabase';
import { fetchAgencySettings, getPackageTypeDescription } from './agencySettings';
import airvoyLogo from '../assets/airvoy.jpeg';

const formatCurrencyDzd = (value) =>
  new Intl.NumberFormat('fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('fr-DZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

async function fetchInvoicePrintContext(invoice, client) {
  const agency = await fetchAgencySettings();

  let resolvedClient = client || null;
  if (!resolvedClient && invoice?.client_id && supabase) {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, phone, email, reference')
      .eq('id', invoice.client_id)
      .maybeSingle();

    resolvedClient = data || null;
  }

  let lines = [];

  if (invoice?.booking_id != null && supabase) {
    const { data: linesData } = await supabase
      .from('booking_service_lines')
      .select('*, service_types(name, name_ar, description)')
      .eq('booking_id', invoice.booking_id);

    const packageIds = [...new Set((linesData || [])
      .map((line) => {
        const details = (line.details && typeof line.details === 'object') ? line.details : {};
        return line.package_id || details.package_id || null;
      })
      .filter(Boolean))];

    let packageTemplatesById = new Map();
    if (packageIds.length > 0) {
      const { data: packageRows } = await supabase
        .from('package_templates')
        .select('id, label, description')
        .in('id', packageIds);

      packageTemplatesById = new Map((packageRows || []).map((item) => [item.id, item]));
    }

    lines = (linesData || []).map((line) => {
      const sellingPrice = Number(line.selling_price || line.unit_price || 0);
      const tvaRate = Number(line.tva_rate || 0);
      const tvaAmount = Number((sellingPrice * (tvaRate / 100)).toFixed(2));
      const lineTotal = Number((sellingPrice + tvaAmount).toFixed(2));
      const details = (line.details && typeof line.details === 'object') ? line.details : {};
      const packageId = line.package_id || details.package_id || null;
      const packageRecord = packageId ? packageTemplatesById.get(packageId) : null;
      const typeKey = String(packageRecord?.template_type || line.service_types?.name || '').trim().toLowerCase();
      const resolvedService = line.service_types?.name || line.service_types?.name_ar || packageRecord?.label || details.package_label || 'Service';
      const typeDescription = getPackageTypeDescription(packageRecord?.template_type || packageRecord?.type || typeKey, agency);
      const resolvedDescription = String(
        line.description ||
        line.service_types?.description ||
        packageRecord?.description ||
        typeDescription ||
        details.package_description ||
        packageRecord?.label ||
        ''
      ).trim();

      return {
        id: line.id,
        service: resolvedService,
        description: resolvedDescription || resolvedService,
        sellingPrice,
        tvaRate,
        tvaAmount,
        lineTotal,
        details: line.details || '',
      };
    });
  }

  let totalPaid = 0;
  if (invoice?.invoice_number && supabase) {
    const { data: ledgerRows } = await supabase
      .from('bank_entries')
      .select('id, credit, debit, description, operation_date')
      .order('operation_date', { ascending: false });

    if (Array.isArray(ledgerRows)) {
      const invoiceNumber = String(invoice.invoice_number || '').toLowerCase();
      const invoiceReference = String(invoice.reference || '').toLowerCase();

      totalPaid = ledgerRows
        .filter((entry) => {
          const description = String(entry.description || '').toLowerCase();
          return description.includes('invoice payment received') && (
            description.includes(invoiceNumber) ||
            description.includes(invoiceReference)
          );
        })
        .reduce((sum, entry) => sum + Number(entry.credit || 0), 0);
    }
  }

  return { agency, client: resolvedClient, lines, totalPaid };
}

export async function openInvoicePdf(invoice, client = null) {
  if (typeof window === 'undefined') return;

  try {
    const { agency, client: resolvedClient, lines, totalPaid } = await fetchInvoicePrintContext(invoice, client);

    const invoiceNumber = invoice?.invoice_number ?? '—';
    const subtotal = lines.length > 0
      ? lines.reduce((sum, line) => sum + Number(line.sellingPrice || 0), 0)
      : Number(invoice?.subtotal || 0);
    const tvaAmount = lines.length > 0
      ? lines.reduce((sum, line) => sum + Number(line.tvaAmount || 0), 0)
      : Number(invoice?.tva_amount || 0);
    const grandTotal = Number((subtotal + tvaAmount).toFixed(2));
    const amountPaid = Number(totalPaid || invoice?.amount_paid || 0);
    const balanceDue = Math.max(grandTotal - amountPaid, 0);
    const validLines = lines.length > 0 ? lines : [];
    const issueDate = invoice?.created_at || new Date().toISOString();
    const clientName = resolvedClient?.full_name || invoice?.client_name || 'Client';
    const clientEmail = resolvedClient?.email || invoice?.client_email || '—';
    const clientPhone = resolvedClient?.phone || invoice?.client_phone || '—';
    const clientReference = resolvedClient?.reference || invoice?.client_reference || '—';
    const paymentMethodLabel =
      invoice?.payment_method === 'credit_card'
        ? 'Credit Card'
        : invoice?.payment_method === 'baridimob'
          ? 'BaridiMob'
          : invoice?.payment_method === 'cash'
            ? 'Cash'
            : invoice?.payment_method || 'Cash';
    const agencyName = agency?.agency_name || 'AIRVOY';
    const agencyAddress = [agency?.address, agency?.city, agency?.wilaya].filter(Boolean).join(', ') || 'Algiers, Algeria';
    const agencyPhone = agency?.phone || '—';
    const agencyEmail = agency?.email || '—';
    const agencyBankName = agency?.bank_name || '—';
    const agencyBankAccount = agency?.bank_account || '—';
    const agencyIban = agency?.iban || '—';

    const lineRows = validLines.length
      ? validLines
          .map((line) => {
            const serviceLabel = String(line.service || 'Service').replace(/</g, '&lt;');
            const descriptionText = String(line.description || '').trim();
            const descriptionHtml = descriptionText && descriptionText !== line.service
              ? `<div style="margin-top: 5px; font-size: 12px; color: #64748b; line-height: 1.4;">${descriptionText.replace(/</g, '&lt;')}</div>`
              : '';

            return `
              <tr>
                <td>
                  <div style="font-weight: 700; color: #0f172a;">${serviceLabel}</div>
                  ${descriptionHtml}
                </td>
                <td>${formatCurrencyDzd(line.sellingPrice)}</td>
                <td>${line.tvaRate ?? 0}%</td>
                <td>${formatCurrencyDzd(line.tvaAmount)}</td>
                <td>${formatCurrencyDzd(line.lineTotal)}</td>
              </tr>
            `;
          })
          .join('')
      : `
        <tr>
          <td colspan="5" style="padding: 16px; text-align: center; color: #64748b;">${invoice?.booking_id == null ? 'Direct invoice — no service lines' : 'No service details available'}</td>
        </tr>
      `;

    const html = `
      <!doctype html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>Invoice ${invoiceNumber}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            :root {
              --navy: #0a1120;
              --gold: #c9a84c;
              --surface: #f8fafc;
              --border: #e2e8f0;
              --text: #0f172a;
              --muted: #64748b;
              --success: #166534;
            }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; color: var(--text); font-family: Arial, sans-serif; }
            body { padding: 0; }
            .page {
              width: 100%;
              max-width: 1000px;
              margin: 0 auto;
              padding: 28px 28px 20px;
              background: #fff;
            }
            .topbar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-bottom: 18px;
              border-bottom: 2px solid var(--gold);
            }
            .brand-wrap {
              display: flex;
              align-items: center;
              gap: 14px;
            }
            .brand-wrap img {
              width: 64px;
              height: 64px;
              border-radius: 16px;
              object-fit: cover;
              border: 1px solid var(--border);
            }
            .brand-name {
              margin: 0;
              font-size: 26px;
              letter-spacing: 0.14em;
              color: var(--navy);
              font-weight: 700;
            }
            .brand-sub {
              margin-top: 2px;
              font-size: 11px;
              letter-spacing: 0.16em;
              color: var(--muted);
              text-transform: uppercase;
            }
            .invoice-meta {
              text-align: right;
            }
            .tiny-tag {
              display: inline-block;
              margin-bottom: 8px;
              font-size: 10px;
              letter-spacing: 0.18em;
              color: var(--gold);
              text-transform: uppercase;
              font-weight: 700;
            }
            .invoice-number {
              margin: 0;
              font-size: 20px;
              color: var(--navy);
            }
            .invoice-date {
              margin-top: 4px;
              font-size: 12px;
              color: var(--muted);
            }
            .status-pill {
              display: inline-block;
              margin-top: 8px;
              padding: 5px 10px;
              border-radius: 99px;
              background: #dcfce7;
              color: var(--success);
              font-size: 10px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              font-weight: 700;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
              margin-top: 26px;
            }
            .card {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 14px;
              padding: 18px 18px 16px;
            }
            .card-title {
              margin: 0 0 12px;
              font-size: 11px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: var(--muted);
            }
            .card strong { color: var(--navy); }
            .card p { margin: 4px 0; font-size: 13px; color: var(--text); }
            .muted { color: var(--muted); }
            .table-wrap {
              margin-top: 26px;
              border: 1px solid var(--border);
              border-radius: 14px;
              overflow: hidden;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            thead {
              background: #0f172a;
              color: #fff;
            }
            thead th {
              padding: 12px 14px;
              font-size: 11px;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              text-align: left;
            }
            tbody td {
              padding: 12px 14px;
              border-bottom: 1px solid var(--border);
              font-size: 13px;
              color: var(--text);
            }
            tbody tr:last-child td { border-bottom: none; }
            .totals {
              margin-top: 22px;
              display: flex;
              justify-content: flex-end;
            }
            .totals-box {
              width: 340px;
              border: 1px solid var(--border);
              border-radius: 14px;
              overflow: hidden;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 10px 14px;
              font-size: 13px;
              color: var(--text);
              border-bottom: 1px solid var(--border);
            }
            .totals-row:last-child {
              border-bottom: none;
              background: #0a1120;
              color: white;
              font-weight: 700;
            }
            .totals-row .label {
              color: inherit;
            }
            .footer {
              margin-top: 28px;
              border-top: 2px solid var(--gold);
              padding-top: 18px;
              display: grid;
              grid-template-columns: 1.2fr 1fr;
              gap: 22px;
            }
            .legal {
              font-size: 12px;
              line-height: 1.7;
              color: var(--muted);
            }
            .bank-box {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 12px;
              padding: 14px 16px;
            }
            .bank-box h4 {
              margin: 0 0 8px;
              font-size: 11px;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: var(--muted);
            }
            .bank-box p {
              margin: 5px 0;
              font-size: 12px;
              color: var(--text);
            }
            @media print {
              body { background: #fff; }
              .page { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="topbar">
              <div class="brand-wrap">
                <img src="${airvoyLogo}" alt="AIRVOY" />
                <div>
                  <h1 class="brand-name">AIRVOY</h1>
                  <div class="brand-sub">Travel & tourism agency</div>
                </div>
              </div>

              <div class="invoice-meta">
                <div class="tiny-tag">Invoice / فاتورة</div>
                <h2 class="invoice-number">#${invoiceNumber}</h2>
                <div class="invoice-date">Date / التاريخ: ${formatDate(issueDate)}</div>
                <div class="status-pill">${invoice?.status || 'pending'}</div>
              </div>
            </div>

            <div class="info-grid">
              <div class="card">
                <h3 class="card-title">Bill to / العميل</h3>
                <p><strong>${clientName}</strong></p>
                <p>Ref / المرجع: ${clientReference}</p>
                <p>Email: ${clientEmail}</p>
                <p>Phone / الهاتف: ${clientPhone}</p>
              </div>

              <div class="card">
                <h3 class="card-title">Agency / الوكالة</h3>
                <p><strong>${agencyName}</strong></p>
                <p>${agencyAddress}</p>
                <p>Phone / الهاتف: ${agencyPhone}</p>
                <p>Email: ${agencyEmail}</p>
                <p>RC / السجل التجاري: ${agency?.rc_number || '—'}</p>
                <p>NIF / الرقم الضريبي: ${agency?.nif || '—'}</p>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Service / الخدمة</th>
                    <th>Selling price / سعر البيع</th>
                    <th>TVA rate / معدل الضريبة</th>
                    <th>TVA amount / قيمة الضريبة</th>
                    <th>Line total / الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  ${lineRows}
                </tbody>
              </table>
            </div>

            <div class="totals">
              <div class="totals-box">
                <div class="totals-row">
                  <span class="label">Subtotal / المجموع</span>
                  <span>${formatCurrencyDzd(subtotal)}</span>
                </div>
                <div class="totals-row">
                  <span class="label">TVA / الضريبة</span>
                  <span>${formatCurrencyDzd(tvaAmount)}</span>
                </div>
                <div class="totals-row">
                  <span class="label">Total / الإجمالي</span>
                  <span>${formatCurrencyDzd(grandTotal)}</span>
                </div>
                <div class="totals-row" style="background: #f8fafc; color: var(--navy);">
                  <span class="label">Amount Paid / المدفوع</span>
                  <span>${formatCurrencyDzd(amountPaid)}</span>
                </div>
                <div class="totals-row" style="background: #fff7ed; color: #9a5b00; font-weight: 700; border-top: 1px solid #fed7aa;">
                  <span class="label">Balance Due / المتبقي</span>
                  <span>${formatCurrencyDzd(balanceDue)}</span>
                </div>
              </div>
            </div>

            <div class="footer">
              <div class="legal">
                <strong>Legal note / ملاحظة قانونية</strong>
                <p>Payment is due within 30 days from the invoice date. This document is valid as an official sales invoice. / يجب سداد المبلغ خلال 30 يومًا من تاريخ الفاتورة. هذا المستند صالح كفاتورة بيع رسمية.</p>
                <p>Reference / المرجع: ${invoice?.reference || '—'}</p>
                <p>Notes / ملاحظات: ${invoice?.note || '—'}</p>
              </div>

              <div class="bank-box">
                <h4>Bank details / تفاصيل البنك</h4>
                <p><strong>Bank / البنك:</strong> ${agencyBankName}</p>
                <p><strong>Account / الحساب:</strong> ${agencyBankAccount}</p>
                <p><strong>IBAN / الآيبان:</strong> ${agencyIban}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=1100,height=1400');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  } catch (error) {
    console.error('Invoice PDF generation failed:', error);
  }
}
