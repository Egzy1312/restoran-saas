import PDFDocument from 'pdfkit';
import type { AnalyticsService } from './analytics.service';

type FullReport = Awaited<ReturnType<AnalyticsService['getFullReport']>>;

/**
 * Pravi .pdf izvjestaj (ne CSV) - pdfkit generise stranicu direktno iz stream-a,
 * pa se rezultat sakuplja u Buffer preko Promise-a (nema fajla na disku).
 */
export function buildReportPdf(report: FullReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor('#1c1917').text(`Izvještaj — ${report.restaurantName}`);
    doc
      .fontSize(10)
      .fillColor('#78716c')
      .text(`Period: posljednjih ${report.days} dana  ·  Generisano: ${report.generatedAt.toLocaleString('bs-BA')}`);
    doc.moveDown(1.2);

    section(doc, 'Pregled');
    row(doc, 'Broj narudžbi', String(report.summary.order_count));
    row(doc, 'Promet', `${report.summary.total_revenue.toFixed(2)} ${report.currency}`);
    row(doc, 'Prosječan račun', `${report.summary.avg_order_value.toFixed(2)} ${report.currency}`);
    row(
      doc,
      'Prosječno vrijeme pripreme',
      `${report.avgPrepTime.avg_minutes} min (uzorak: ${report.avgPrepTime.sample_size} narudžbi)`,
    );
    doc.moveDown(1);

    section(doc, 'Najprodavaniji artikli');
    if (report.topItems.length === 0) {
      doc.fontSize(10).fillColor('#a8a29e').text('Nema podataka za odabrani period.');
    } else {
      for (const item of report.topItems) {
        row(doc, item.name, `${item.quantity}× — ${item.revenue.toFixed(2)} ${report.currency}`);
      }
    }
    doc.moveDown(1);

    section(doc, 'Najprofitabilniji stolovi');
    if (report.tableRevenue.length === 0) {
      doc.fontSize(10).fillColor('#a8a29e').text('Nema podataka za odabrani period.');
    } else {
      for (const t of report.tableRevenue) {
        row(doc, `Sto ${t.table_number} (${t.zone_name})`, `${t.order_count} narudžbi — ${t.revenue.toFixed(2)} ${report.currency}`);
      }
    }

    doc.end();
  });
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(13).fillColor('#c2410c').text(title, { underline: true });
  doc.moveDown(0.4);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(10).fillColor('#1c1917').text(label, { continued: true, width: 300 });
  doc.fillColor('#44403c').text(`   ${value}`);
}
