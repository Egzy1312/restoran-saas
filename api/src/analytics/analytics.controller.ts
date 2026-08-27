import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AnalyticsService } from './analytics.service';
import { buildReportXlsx } from './report-xlsx.generator';
import { buildReportPdf } from './report-pdf.generator';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))];
  return lines.join('\n');
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.analyticsService.summary(user.restaurantId, Number(days) || 7);
  }

  @Get('top-items')
  async topItems(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('format') format?: string,
  ) {
    const rows = await this.analyticsService.topItems(user.restaurantId, Number(days) || 7, Number(limit) || 10);
    if (format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="top-items.csv"' });
      return toCsv(rows);
    }
    return rows;
  }

  @Get('avg-prep-time')
  avgPrepTime(@CurrentUser() user: AuthenticatedUser, @Query('days') days?: string) {
    return this.analyticsService.avgPrepTime(user.restaurantId, Number(days) || 7);
  }

  @Get('table-revenue')
  async tableRevenue(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('format') format?: string,
  ) {
    const rows = await this.analyticsService.tableRevenue(user.restaurantId, Number(days) || 7, Number(limit) || 10);
    if (format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="table-revenue.csv"' });
      return toCsv(rows);
    }
    return rows;
  }

  /**
   * Objedinjeni izvještaj (pregled + najprodavaniji artikli + stolovi) kao
   * pravi .xlsx (ExcelJS, tri lista) ili .pdf (pdfkit) - ne CSV preimenovan
   * u drugu ekstenziju. `@Res()` bez passthrough-a jer Nest ne zna sam
   * serijalizovati sirovi binarni Buffer - ovdje eksplicitno preuzimamo
   * kontrolu nad odgovorom.
   */
  @Get('report')
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('days') days?: string,
    @Query('format') format?: string,
  ) {
    const reportData = await this.analyticsService.getFullReport(user.restaurantId, Number(days) || 7);

    if (format === 'xlsx') {
      const buffer = await buildReportXlsx(reportData);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="izvjestaj.xlsx"',
      });
      res.send(buffer);
      return;
    }

    if (format === 'pdf') {
      const buffer = await buildReportPdf(reportData);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="izvjestaj.pdf"',
      });
      res.send(buffer);
      return;
    }

    res.json(reportData);
  }
}
