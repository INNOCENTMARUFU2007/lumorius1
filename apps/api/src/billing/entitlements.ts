import {
  CallHandler,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  NestInterceptor,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { from, Observable, switchMap } from 'rxjs';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService, SqlRunner } from '../database/database.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Module as PlanModule, PaidFeature, planPolicy, resolvePlan, trialEndsAt, WorkspacePlanRow } from './plan-policy';

export const RequiresFeature = (feature: PaidFeature) => SetMetadata('lumorius.feature', feature);
/** Tag a controller (or handler) with the product area it belongs to. */
export const RequiresModule = (module: PlanModule) => SetMetadata('lumorius.module', module);

export interface WorkspaceEntitlements {
  plan: ReturnType<typeof resolvePlan>;
  status: 'active' | 'trialing' | 'expired';
  trialEndsAt: string | null;
  agents: string[];
  features: PaidFeature[];
  modules: PlanModule[];
}

@Injectable()
export class EntitlementsService {
  constructor(private readonly db: DatabaseService) {}

  async forOrganization(org: string, client: SqlRunner = this.db): Promise<WorkspaceEntitlements> {
    if (!org) throw new ForbiddenException('Workspace membership required.');
    const result = await client.query<WorkspacePlanRow>(
      `SELECT o.plan_id::text AS plan_id, o.trial_ends_at, o.created_at
         FROM organizations o
        WHERE o.id = $1`,
      [org],
    );
    const row = result.rows[0];
    const plan = resolvePlan(row);
    return {
      plan,
      status: plan === 'trial' ? 'trialing' : plan === 'expired' ? 'expired' : 'active',
      trialEndsAt: row && (plan === 'trial' || plan === 'expired') && row.plan_id === 'free' ? trialEndsAt(row).toISOString() : null,
      ...planPolicy(plan),
    };
  }

  private deny(access: WorkspaceEntitlements, detail: Record<string, unknown>): never {
    if (access.status === 'expired') {
      throw new ForbiddenException({
        code: 'trial_expired',
        message: 'Your free trial has ended. Choose a plan to keep using Lumorius.',
        upgradeUrl: '/billing',
        ...detail,
      });
    }
    throw new ForbiddenException({ code: 'upgrade_required', message: 'Upgrade to unlock this feature.', upgradeUrl: '/billing', ...detail });
  }

  async require(org: string, feature: PaidFeature) {
    const access = await this.forOrganization(org);
    if (!access.features.includes(feature)) this.deny(access, { feature });
  }

  async requireModule(org: string, module: PlanModule) {
    const access = await this.forOrganization(org);
    if (!access.modules.includes(module)) this.deny(access, { module });
  }
}

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly entitlements: EntitlementsService) {}
  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.getAllAndOverride<PaidFeature>('lumorius.feature', [context.getHandler(), context.getClass()]);
    if (!feature) return true;
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!user?.organizationId) throw new ForbiddenException('Workspace membership required.');
    await this.entitlements.require(user.organizationId, feature);
    return true;
  }
}

/**
 * Enforces RequiresModule globally. Interceptors run after guards, so the JWT
 * guard has already populated request.user. Routes without a user (public
 * callbacks, health) are left to their own guards.
 */
@Injectable()
export class PlanModuleInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly entitlements: EntitlementsService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const module = this.reflector.getAllAndOverride<PlanModule>('lumorius.module', [context.getHandler(), context.getClass()]);
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>().user;
    if (!module || !user?.organizationId) return next.handle();
    return from(this.entitlements.requireModule(user.organizationId, module)).pipe(switchMap(() => next.handle()));
  }
}

@Controller('billing/entitlements')
@UseGuards(AuthGuard('jwt'))
class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}
  @Get() get(@CurrentUser() user: JwtPayload) {
    return this.entitlements.forOrganization(user.organizationId);
  }
}

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [EntitlementsController],
  providers: [EntitlementsService, FeatureGuard, { provide: APP_INTERCEPTOR, useClass: PlanModuleInterceptor }],
  exports: [EntitlementsService, FeatureGuard],
})
export class EntitlementsModule {}
