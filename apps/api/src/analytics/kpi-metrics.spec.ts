import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('team KPI metrics', () => {
  const make = (rows: unknown[] = [{ id: 'kpi-1' }]) => {
    const db = { query: jest.fn().mockResolvedValue({ rows }), findOne: jest.fn().mockResolvedValue({ id: 'kpi-1' }) };
    return { db, service: new AnalyticsService(db as never, {} as never) };
  };

  it('requires a name and a numeric target', async () => {
    const { service, db } = make();
    await expect(service.createKpiMetric('org-1', 'user-1', { name: '  ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createKpiMetric('org-1', 'user-1', { name: 'Leads', target: 'lots' as never })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('stores a trimmed KPI', async () => {
    const { service, db } = make();
    await service.createKpiMetric('org-1', 'user-1', { name: '  Qualified leads ', unit: 'leads', target: 40 });
    expect(db.query.mock.calls[0][1].slice(1, 5)).toEqual(['Qualified leads', null, 'leads', 40]);
  });

  it('rejects values that are not numbers, future dates and other workspaces', async () => {
    const { service } = make();
    await expect(service.recordKpiValue('kpi-1', 'org-1', Number.NaN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordKpiValue('kpi-1', 'org-1', 5, '2999-01-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordKpiValue('kpi-1', 'org-1', 5, '2026-02-30x')).rejects.toBeInstanceOf(BadRequestException);
    const other = make([]);
    await expect(other.service.recordKpiValue('kpi-1', 'org-2', 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a valid value for today by default', async () => {
    const { service } = make();
    const result = await service.recordKpiValue('kpi-1', 'org-1', '12.5' as never);
    expect(result).toMatchObject({ recorded: true, value: 12.5, date: new Date().toISOString().slice(0, 10) });
  });
});
