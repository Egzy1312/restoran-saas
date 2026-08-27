import ExcelJS from 'exceljs';
import type { AnalyticsService } from './analytics.service';

type FullReport = Awaited<ReturnType<AnalyticsService['getFullReport']>>;

/** Pravi .xlsx izvjestaj (ne CSV) - tri lista: Pregled, Najprodavaniji artikli, Stolovi. */
export async function buildReportXlsx(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Restoran SaaS';
  workbook.created = report.generatedAt;

  const overview = workbook.addWorksheet('Pregled');
  overview.columns = [
    { header: 'Metrika', key: 'metric', width: 34 },
    { header: 'Vrijednost', key: 'value', width: 20 },
  ];
  overview.addRows([
    { metric: 'Restoran', value: report.restaurantName },
    { metric: 'Period (dana)', value: report.days },
    { metric: 'Generisano', value: report.generatedAt.toLocaleString('bs-BA') },
    { metric: 'Broj narudžbi', value: report.summary.order_count },
    { metric: `Promet (${report.currency})`, value: report.summary.total_revenue },
    { metric: `Prosječan račun (${report.currency})`, value: report.summary.avg_order_value },
    { metric: 'Prosječno vrijeme pripreme (min)', value: report.avgPrepTime.avg_minutes },
    { metric: 'Uzorak (broj narudžbi za prosjek pripreme)', value: report.avgPrepTime.sample_size },
  ]);
  overview.getRow(1).font = { bold: true };

  const topItems = workbook.addWorksheet('Najprodavaniji artikli');
  topItems.columns = [
    { header: 'Artikal', key: 'name', width: 32 },
    { header: 'Količina', key: 'quantity', width: 12 },
    { header: `Promet (${report.currency})`, key: 'revenue', width: 16 },
  ];
  topItems.addRows(report.topItems.map((i) => ({ name: i.name, quantity: i.quantity, revenue: i.revenue })));
  topItems.getRow(1).font = { bold: true };

  const tables = workbook.addWorksheet('Stolovi');
  tables.columns = [
    { header: 'Sto', key: 'table_number', width: 10 },
    { header: 'Zona', key: 'zone_name', width: 22 },
    { header: 'Broj narudžbi', key: 'order_count', width: 14 },
    { header: `Promet (${report.currency})`, key: 'revenue', width: 16 },
  ];
  tables.addRows(
    report.tableRevenue.map((t) => ({
      table_number: t.table_number,
      zone_name: t.zone_name,
      order_count: t.order_count,
      revenue: t.revenue,
    })),
  );
  tables.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
