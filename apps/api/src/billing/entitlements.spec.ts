import 'reflect-metadata';
import { of, lastValueFrom } from 'rxjs';
import { EntitlementsService, FeatureGuard, PlanModuleInterceptor } from './entitlements';
import { Reflector } from '@nestjs/core';
import { ExecutiveAnalyticsController } from '../executive-intelligence/executive-analytics.controller';

const recent = new Date().toISOString();
const old = new Date(Date.now() - 30 * 86_400_000).toISOString();

describe('tenant entitlement boundaries', () => {
  it('queries only the authenticated organization and does not cache another tenant', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ plan_id: 'professional', trial_ends_at: null, created_at: old }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new EntitlementsService(db as never);
    await service.require('tenant-a', 'advanced_governance');
    await expect(service.require('tenant-b', 'advanced_governance')).rejects.toMatchObject({ status: 403 });
    expect(db.query.mock.calls.map((c) => c[1])).toEqual([['tenant-a'], ['tenant-b']]);
    expect(db.query.mock.calls[0][0]).toContain('o.id = $1');
  });

  it('reports trial status and blocks expired workspaces with trial_expired', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ plan_id: 'free', trial_ends_at: null, created_at: recent }] })
        .mockResolvedValueOnce({ rows: [{ plan_id: 'free', trial_ends_at: null, created_at: old }] }),
    };
    const service = new EntitlementsService(db as never);
    const trial = await service.forOrganization('org');
    expect(trial).toMatchObject({ plan: 'trial', status: 'trialing' });
    expect(trial.trialEndsAt).toEqual(expect.any(String));
    await expect(service.requireModule('org', 'core')).rejects.toMatchObject({ response: { code: 'trial_expired' } });
  });

  it('keeps Workflows and Decisions off Starter', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ plan_id: 'starter', trial_ends_at: null, created_at: old }] }) };
    const service = new EntitlementsService(db as never);
    await expect(service.requireModule('org', 'core')).resolves.toBeUndefined();
    await expect(service.requireModule('org', 'workflows')).rejects.toMatchObject({ response: { code: 'upgrade_required' } });
  });

  it('requires an authenticated tenant before reading the plan', async () => {
    const service = { require: jest.fn() };
    const reflector = { getAllAndOverride: () => 'advanced_governance' };
    const guard = new FeatureGuard(reflector as unknown as Reflector, service as never);
    await expect(
      guard.canActivate({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({}) }) } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.require).not.toHaveBeenCalled();
  });

  it('module interceptor skips untagged and unauthenticated routes, enforces tagged ones', async () => {
    const service = { requireModule: jest.fn().mockResolvedValue(undefined) };
    const ctx = (module: string | undefined, user: unknown) => ({
      getType: () => 'http',
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      module,
    });
    const make = (module: string | undefined) =>
      new PlanModuleInterceptor({ getAllAndOverride: () => module } as unknown as Reflector, service as never);
    const next = { handle: () => of('ok') };

    await expect(lastValueFrom(make(undefined).intercept(ctx(undefined, { organizationId: 'o' }) as never, next))).resolves.toBe('ok');
    await expect(lastValueFrom(make('core').intercept(ctx('core', undefined) as never, next))).resolves.toBe('ok');
    expect(service.requireModule).not.toHaveBeenCalled();
    await expect(lastValueFrom(make('workflows').intercept(ctx('workflows', { organizationId: 'o' }) as never, next))).resolves.toBe('ok');
    expect(service.requireModule).toHaveBeenCalledWith('o', 'workflows');
  });

  it('runs authentication before the financial feature guard', () => {
    const guards = Reflect.getMetadata('__guards__', ExecutiveAnalyticsController);
    expect(guards[guards.length - 1]).toBe(FeatureGuard);
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });
});
