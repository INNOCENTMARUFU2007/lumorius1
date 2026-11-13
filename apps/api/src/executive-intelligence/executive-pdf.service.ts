import { BadRequestException, Injectable } from '@nestjs/common';

type PdfDocumentConstructor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;
type PdfDoc = PDFKit.PDFDocument;

type ExecutiveMetricStatus = 'actual' | 'estimated' | 'unavailable';

export interface ExecutivePdfTrendPoint {
  label: string;
  value: number;
}

export interface ExecutivePdfMetric {
  key: string;
  label: string;
  category?: string;
  status: ExecutiveMetricStatus;
  value: number | string | null;
  unit?: string;
  currency?: string;
  targetValue?: number | null;
  metricKey?: string;
  alertThresholdPct?: number | null;
  targetProgressPct?: number | null;
  targetDirection?: 'higher_is_better' | 'lower_is_better';
  targetStatus?: 'on_track' | 'behind' | 'insufficient_data' | 'unavailable';
  targetOwnerName?: string | null;
  definition?: string;
  formula?: string;
  sourceLabels?: string[];
  updatedAt?: string | null;
  sampleSize?: number | null;
  trend?: ExecutivePdfTrendPoint[];
  note?: string;
}

export interface ExecutivePdfSection {
  title: string;
  body?: string;
  items?: string[];
}

export interface ExecutivePdfSource {
  sourceType: string;
  sourceName: string;
  sourceId?: string;
  recordCount?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface ExecutivePdfAlert {
  metricKey: string;
  label: string;
  currency?: string;
  severity: 'warning';
  message: string;
  actualValue: number;
  targetValue: number;
  gapPct: number;
}
export interface ExecutivePdfReport {
  organizationId: string;
  organizationName: string;
  reportTitle: string;
  periodStart: string;
  periodEnd: string;
  generatedAt?: string;
  generatedBy?: string;
  reportVersion?: string;
  executiveSummary?: string;
  metrics: ExecutivePdfMetric[];
  alerts?: ExecutivePdfAlert[];
  sections?: ExecutivePdfSection[];
  sources?: ExecutivePdfSource[];
  assumptions?: string[];
}

@Injectable()
export class ExecutivePdfService {
  private readonly pageMargin = 48;
  private readonly bottomReserve = 58;
  private readonly brand = '#4254f5';
  private readonly ink = '#172033';
  private readonly muted = '#667085';

  async generate(report: ExecutivePdfReport): Promise<Buffer> {
    const normalized = this.validateReport(report);
    const generatedAt = normalized.generatedAt ? new Date(normalized.generatedAt) : new Date();
    const pdfkitModule = await import('pdfkit') as unknown as { PDFDocument: PdfDocumentConstructor };
    if (typeof pdfkitModule.PDFDocument !== 'function') {
      throw new Error('PDFKit did not expose the PDFDocument constructor.');
    }
    const doc = new pdfkitModule.PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 58, right: this.pageMargin, bottom: this.bottomReserve, left: this.pageMargin },
      bufferPages: true,
      compress: true,
      info: {
        Title: normalized.reportTitle,
        Author: 'Lumorius Executive Intelligence',
        Subject: `Executive report for ${normalized.organizationName}`,
        Keywords: 'Lumorius, Executive Intelligence, KPI, performance report',
        CreationDate: generatedAt,
      },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;
      doc.on('data', (chunk: Buffer | Uint8Array) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      doc.once('error', (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      doc.once('end', () => {
        if (!settled) {
          settled = true;
          resolve(Buffer.concat(chunks));
        }
      });

      try {
        this.render(doc, normalized, generatedAt);
        doc.end();
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        doc.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private validateReport(input: ExecutivePdfReport): ExecutivePdfReport {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Executive report payload is required.');
    }

    const organizationId = this.requiredText(input.organizationId, 'organizationId', 80);
    const organizationName = this.requiredText(input.organizationName, 'organizationName', 180);
    const reportTitle = this.requiredText(input.reportTitle, 'reportTitle', 180);
    const periodStart = this.requiredDate(input.periodStart, 'periodStart');
    const periodEnd = this.requiredDate(input.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) {
      throw new BadRequestException('Executive report periodEnd must not precede periodStart.');
    }
    if (!Array.isArray(input.metrics) || input.metrics.length > 150) {
      throw new BadRequestException('Executive report must contain an array of at most 150 metrics.');
    }
    if (input.sections !== undefined && (!Array.isArray(input.sections) || input.sections.length > 30)) {
      throw new BadRequestException('Executive report may contain at most 30 sections.');
    }
    if (input.sources !== undefined && (!Array.isArray(input.sources) || input.sources.length > 300)) {
      throw new BadRequestException('Executive report may contain at most 300 sources.');
    }
    if (input.assumptions !== undefined && (!Array.isArray(input.assumptions) || input.assumptions.length > 100)) {
      throw new BadRequestException('Executive report may contain at most 100 assumptions.');
    }

    const metrics = input.metrics.map((metric, index) => {
      if (!metric || typeof metric !== 'object') {
        throw new BadRequestException(`Metric at index ${index} is invalid.`);
      }
      if (!['actual', 'estimated', 'unavailable'].includes(metric.status)) {
        throw new BadRequestException(`Metric at index ${index} has an unsupported status.`);
      }
      if (metric.status === 'unavailable' && metric.value !== null) {
        throw new BadRequestException(`Unavailable metric '${metric.key}' must have a null value.`);
      }
      if (metric.status !== 'unavailable' && metric.value === null) {
        throw new BadRequestException(`Metric '${metric.key}' must have a value unless its status is unavailable.`);
      }
      if (typeof metric.value === 'number' && !Number.isFinite(metric.value)) {
        throw new BadRequestException(`Metric '${metric.key}' must have a finite numeric value.`);
      }
      if (typeof metric.value === 'string' && metric.value.length > 160) {
        throw new BadRequestException(`Metric '${metric.key}' value is too long.`);
      }
      if (metric.targetValue !== undefined && metric.targetValue !== null && !Number.isFinite(metric.targetValue)) {
        throw new BadRequestException(`Metric '${metric.key}' target must be finite.`);
      }
      if (metric.sampleSize !== undefined && metric.sampleSize !== null &&
          (!Number.isInteger(metric.sampleSize) || metric.sampleSize < 0)) {
        throw new BadRequestException(`Metric '${metric.key}' sampleSize must be a non-negative integer.`);
      }
      if (metric.trend !== undefined && (!Array.isArray(metric.trend) || metric.trend.length > 36)) {
        throw new BadRequestException(`Metric '${metric.key}' may contain at most 36 trend points.`);
      }
      for (const point of metric.trend ?? []) {
        if (!point || typeof point.label !== 'string' || point.label.length > 40 || !Number.isFinite(point.value)) {
          throw new BadRequestException(`Metric '${metric.key}' contains an invalid trend point.`);
        }
      }
      if (metric.sourceLabels !== undefined && (!Array.isArray(metric.sourceLabels) || metric.sourceLabels.length > 20)) {
        throw new BadRequestException(`Metric '${metric.key}' may contain at most 20 source labels.`);
      }
      return {
        ...metric,
        key: this.requiredText(metric.key, `metrics[${index}].key`, 80),
        label: this.requiredText(metric.label, `metrics[${index}].label`, 140),
        category: metric.category ? this.cleanText(metric.category, 80) : undefined,
        unit: metric.unit ? this.cleanText(metric.unit, 40) : undefined,
        currency: metric.currency ? this.cleanText(metric.currency, 3).toUpperCase() : undefined,
        definition: metric.definition ? this.cleanText(metric.definition, 1200) : undefined,
        formula: metric.formula ? this.cleanText(metric.formula, 1200) : undefined,
        note: metric.note ? this.cleanText(metric.note, 1200) : undefined,
        sourceLabels: (metric.sourceLabels ?? []).map((value) => this.cleanText(value, 180)),
        updatedAt: metric.updatedAt ? this.cleanText(metric.updatedAt, 80) : null,
        trend: metric.trend ?? [],
      };
    });

    const sections = (input.sections ?? []).map((section, index) => {
      if (!section || typeof section !== 'object' || (section.items && (!Array.isArray(section.items) || section.items.length > 100))) {
        throw new BadRequestException(`Executive report section at index ${index} is invalid.`);
      }
      return {
        title: this.requiredText(section.title, `sections[${index}].title`, 140),
        body: section.body ? this.cleanText(section.body, 5000) : undefined,
        items: (section.items ?? []).map((item) => this.requiredText(item, 'section item', 1000)),
      };
    });

    const sources = (input.sources ?? []).map((source, index) => {
      if (!source || typeof source !== 'object') {
        throw new BadRequestException(`Executive report source at index ${index} is invalid.`);
      }
      if (source.recordCount !== undefined && (!Number.isInteger(source.recordCount) || source.recordCount < 0)) {
        throw new BadRequestException(`Source at index ${index} has an invalid recordCount.`);
      }
      return {
        sourceType: this.requiredText(source.sourceType, `sources[${index}].sourceType`, 80),
        sourceName: this.requiredText(source.sourceName, `sources[${index}].sourceName`, 240),
        sourceId: source.sourceId ? this.cleanText(source.sourceId, 120) : undefined,
        recordCount: source.recordCount,
        periodStart: source.periodStart ? this.cleanText(source.periodStart, 40) : undefined,
        periodEnd: source.periodEnd ? this.cleanText(source.periodEnd, 40) : undefined,
      };
    });

    const assumptions = (input.assumptions ?? []).map((item) => this.requiredText(item, 'assumption', 1200));
    const generatedAt = input.generatedAt ? this.cleanText(input.generatedAt, 80) : undefined;
    if (generatedAt && !Number.isFinite(new Date(generatedAt).getTime())) {
      throw new BadRequestException('generatedAt must be a valid date/time.');
    }

    return {
      organizationId,
      organizationName,
      reportTitle,
      periodStart,
      periodEnd,
      generatedAt,
      generatedBy: input.generatedBy ? this.cleanText(input.generatedBy, 160) : undefined,
      reportVersion: input.reportVersion ? this.cleanText(input.reportVersion, 40) : '1.0',
      executiveSummary: input.executiveSummary ? this.cleanText(input.executiveSummary, 6000) : undefined,
      metrics,
      sections,
      sources,
      assumptions,
    };
  }

  private render(doc: PdfDoc, report: ExecutivePdfReport, generatedAt: Date): void {
    this.drawRunningHeader(doc);
    doc.font('Helvetica-Bold').fontSize(22).fillColor(this.ink);
    this.writeParagraph(doc, report.reportTitle, 22, 'Helvetica-Bold');

    doc.font('Helvetica').fontSize(10).fillColor(this.muted);
    this.writeParagraph(doc, report.organizationName, 10, 'Helvetica');
    this.writeParagraph(doc, `Reporting period: ${report.periodStart} to ${report.periodEnd}`, 9, 'Helvetica');
    this.writeParagraph(doc, `Generated: ${this.formatDateTime(generatedAt)}${report.generatedBy ? ` | Prepared by: ${report.generatedBy}` : ''}`, 8, 'Helvetica');
    doc.y += 6;

    this.drawSectionHeading(doc, 'Executive summary');
    this.writeParagraph(
      doc,
      report.executiveSummary || 'No executive summary was supplied for this reporting period.',
      10,
      'Helvetica',
    );

    this.drawSectionHeading(doc, 'KPI performance');
    if (report.metrics.length === 0) {
      this.writeParagraph(doc, 'No KPI metrics were supplied for this report.', 9, 'Helvetica');
    } else {
      for (const metric of report.metrics) this.drawMetricCard(doc, metric);
    }

    for (const section of report.sections ?? []) {
      this.drawSectionHeading(doc, section.title);
      if (section.body) this.writeParagraph(doc, section.body, 9, 'Helvetica');
      for (const item of section.items ?? []) this.drawBullet(doc, item);
    }

    if ((report.sources ?? []).length > 0) {
      this.drawSectionHeading(doc, 'Data sources and provenance');
      for (const source of report.sources ?? []) {
        const range = source.periodStart || source.periodEnd
          ? ` | Period: ${source.periodStart ?? 'â€”'} to ${source.periodEnd ?? 'â€”'}`
          : '';
        const count = source.recordCount === undefined ? '' : ` | Records: ${source.recordCount}`;
        const reference = source.sourceId ? ` | Reference: ${source.sourceId}` : '';
        this.drawBullet(doc, `${source.sourceName} (${source.sourceType})${count}${range}${reference}`);
      }
    }

    if ((report.assumptions ?? []).length > 0) {
      this.drawSectionHeading(doc, 'Assumptions and limitations');
      for (const assumption of report.assumptions ?? []) this.drawBullet(doc, assumption);
    }

    this.ensureSpace(doc, 50);
    doc.font('Helvetica').fontSize(8).fillColor(this.muted);
    this.writeParagraph(
      doc,
      'Metric states (actual, estimated, unavailable) are retained from the calculation layer. Currency values remain in their source currencies; this report does not perform implicit foreign-exchange conversion.',
      8,
      'Helvetica',
    );
    this.addPageNumbers(doc, report);
  }

  private drawRunningHeader(doc: PdfDoc): void {
    doc.rect(0, 0, doc.page.width, 5).fill(this.brand);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(this.brand)
      .text('LUMORIUS  /  EXECUTIVE INTELLIGENCE', this.pageMargin, 24, { width: doc.page.width - this.pageMargin * 2 });
    doc.moveTo(this.pageMargin, 42).lineTo(doc.page.width - this.pageMargin, 42)
      .lineWidth(0.6).strokeColor('#e4e7ec').stroke();
    doc.y = 56;
  }

  private drawSectionHeading(doc: PdfDoc, title: string): void {
    this.ensureSpace(doc, 34);
    doc.y += 7;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(this.ink)
      .text(title, this.pageMargin, doc.y, { width: this.contentWidth(doc) });
    doc.y += 23;
    doc.moveTo(this.pageMargin, doc.y).lineTo(doc.page.width - this.pageMargin, doc.y)
      .lineWidth(0.5).strokeColor('#e4e7ec').stroke();
    doc.y += 9;
  }

  private drawMetricCard(doc: PdfDoc, metric: ExecutivePdfMetric): void {
    const formula = metric.formula || metric.definition || metric.note || 'No calculation definition supplied.';
    const formulaHeight = doc.font('Helvetica').fontSize(8).heightOfString(formula, { width: this.contentWidth(doc) - 24 });
    const sourceText = metric.sourceLabels?.length ? `Sources: ${metric.sourceLabels.join('; ')}` : 'Sources: Not specified';
    const sourceHeight = doc.font('Helvetica').fontSize(7).heightOfString(sourceText, { width: this.contentWidth(doc) - 24 });
    const cardHeight = Math.max(112, 82 + formulaHeight + sourceHeight);
    this.ensureSpace(doc, cardHeight + 12);

    const x = this.pageMargin;
    const y = doc.y;
    const width = this.contentWidth(doc);
    doc.rect(x, y, width, cardHeight).lineWidth(0.7).strokeColor('#d0d5dd').stroke();

    const statusColor = metric.status === 'actual' ? '#067647' : metric.status === 'estimated' ? '#b54708' : '#667085';
    doc.font('Helvetica-Bold').fontSize(7).fillColor(statusColor)
      .text(metric.status.toUpperCase(), x + 12, y + 9, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(this.ink)
      .text(metric.label, x + 12, y + 23, { width: width * 0.58 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(this.ink)
      .text(this.formatMetricValue(metric), x + 12, y + 40, { width: width * 0.58 });

    const target = metric.targetValue === undefined || metric.targetValue === null
      ? 'Target: Not configured'
      : `Target: ${this.formatNumber(metric.targetValue, metric.currency, metric.unit)}`;
    const targetProgress = metric.targetProgressPct === undefined || metric.targetProgressPct === null
      ? '' : ` | Progress: ${metric.targetProgressPct.toFixed(1)}%`;
    const targetStatus = metric.targetStatus ? ` | Target status: ${metric.targetStatus.replace(/_/g, ' ')}` : '';
    const sample = metric.sampleSize === undefined || metric.sampleSize === null ? '' : ` | Sample: ${metric.sampleSize}`;
    const updated = metric.updatedAt ? ` | Updated: ${metric.updatedAt}` : '';
    doc.font('Helvetica').fontSize(7).fillColor(this.muted)
      .text(`${target}${targetProgress}${targetStatus}${sample}${updated}`, x + 12, y + 59, { width: width - 24 });

    if ((metric.trend ?? []).length >= 2) {
      this.drawSparkline(doc, metric.trend ?? [], x + width - 128, y + 25, 112, 30);
    }

    const formulaY = y + 74;
    doc.font('Helvetica').fontSize(7.5).fillColor(this.ink)
      .text(formula, x + 12, formulaY, { width: width - 24, lineGap: 1 });
    const formulaActualHeight = doc.font('Helvetica').fontSize(7.5).heightOfString(formula, { width: width - 24, lineGap: 1 });
    doc.font('Helvetica').fontSize(6.5).fillColor(this.muted)
      .text(sourceText, x + 12, formulaY + formulaActualHeight + 3, { width: width - 24 });
    doc.y = y + cardHeight + 10;
  }

  private drawSparkline(doc: PdfDoc, points: ExecutivePdfTrendPoint[], x: number, y: number, width: number, height: number): void {
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    doc.moveTo(x, y + height).lineTo(x + width, y + height).lineWidth(0.4).strokeColor('#d0d5dd').stroke();
    points.forEach((point, index) => {
      const px = x + (points.length === 1 ? 0 : (index / (points.length - 1)) * width);
      const py = y + height - ((point.value - min) / range) * height;
      if (index === 0) doc.moveTo(px, py);
      else doc.lineTo(px, py);
    });
    doc.lineWidth(1.5).strokeColor(this.brand).stroke();
  }

  private drawBullet(doc: PdfDoc, text: string): void {
    const safe = this.cleanText(text, 1200);
    const width = this.contentWidth(doc) - 18;
    doc.font('Helvetica').fontSize(8.5);
    const height = doc.heightOfString(safe, { width, lineGap: 1 });
    this.ensureSpace(doc, height + 10);
    const y = doc.y;
    doc.fillColor(this.brand).circle(this.pageMargin + 4, y + 5, 1.8).fill();
    doc.fillColor(this.ink).text(safe, this.pageMargin + 14, y, { width, lineGap: 1 });
    doc.y = y + height + 7;
  }

  private writeParagraph(doc: PdfDoc, value: string, fontSize: number, font: string): void {
    const safe = this.cleanText(value, 6000);
    doc.font(font).fontSize(fontSize).fillColor(this.ink);
    const height = doc.heightOfString(safe, { width: this.contentWidth(doc), lineGap: 2 });
    this.ensureSpace(doc, height + 9);
    const y = doc.y;
    doc.text(safe, this.pageMargin, y, { width: this.contentWidth(doc), lineGap: 2 });
    doc.y = y + height + 8;
  }

  private ensureSpace(doc: PdfDoc, requiredHeight: number): void {
    if (doc.y + requiredHeight <= doc.page.height - this.bottomReserve) return;
    doc.addPage();
    this.drawRunningHeader(doc);
  }

  private addPageNumbers(doc: PdfDoc, report: ExecutivePdfReport): void {
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);

      // Footer content is intentionally drawn in the reserved bottom margin.
      // PDFKit otherwise treats text below its normal maxY() as body overflow
      // and silently appends a new page while the page-number loop is running.
      const originalBottomMargin = doc.page.margins.bottom;
      try {
        doc.page.margins.bottom = 18;
        const y = doc.page.height - 36;
        doc.moveTo(this.pageMargin, y - 8).lineTo(doc.page.width - this.pageMargin, y - 8)
          .lineWidth(0.5).strokeColor('#e4e7ec').stroke();
        const footerName = report.organizationName.length > 48
          ? `${report.organizationName.slice(0, 45)}...`
          : report.organizationName;
        doc.font('Helvetica').fontSize(7).fillColor(this.muted)
          .text(`${footerName}  |  Confidential`, this.pageMargin, y, {
            width: this.contentWidth(doc) * 0.65,
            lineBreak: false,
          });
        doc.font('Helvetica').fontSize(7).fillColor(this.muted)
          .text(`Page ${page + 1} of ${range.count}`, this.pageMargin, y, {
            width: this.contentWidth(doc),
            align: 'right',
            lineBreak: false,
          });
      } finally {
        doc.page.margins.bottom = originalBottomMargin;
      }
    }
  }
  private formatMetricValue(metric: ExecutivePdfMetric): string {
    if (metric.status === 'unavailable' || metric.value === null) return 'Unavailable';
    if (typeof metric.value === 'string') return metric.value;
    return this.formatNumber(metric.value, metric.currency, metric.unit);
  }

  private formatNumber(value: number, currency?: string, unit?: string): string {
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
    const prefix = currency ? `${currency} ` : '';
    const suffix = unit && unit !== currency && unit !== 'currency' ? (unit === '%' ? '%' : ` ${unit}`) : '';
    return `${prefix}${formatted}${suffix}`;
  }

  private formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
    }).format(value);
  }

  private requiredText(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string') throw new BadRequestException(`${field} must be text.`);
    const clean = this.cleanText(value, maxLength);
    if (!clean) throw new BadRequestException(`${field} is required.`);
    return clean;
  }

  private requiredDate(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(new Date(`${value}T00:00:00.000Z`).getTime())) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (parsed.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} is not a valid calendar date.`);
    }
    return value;
  }

  private cleanText(value: string, maxLength: number): string {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  private contentWidth(doc: PdfDoc): number {
    return doc.page.width - this.pageMargin * 2;
  }
}
