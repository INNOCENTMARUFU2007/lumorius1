import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FeatureGuard, RequiresFeature, RequiresModule } from '../billing/entitlements';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { KnowledgeDecisionsService } from './knowledge-decisions.service';

@ApiTags('knowledge-decisions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@RequiresModule('decisions')
@Controller('knowledge/decisions')
export class KnowledgeDecisionsController {
  constructor(
    private readonly decisions: KnowledgeDecisionsService,

  ) {}


  @Get()
  @ApiOperation({ summary: 'List organisation decisions visible to the current user' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('decisionType') decisionType?: string,
    @Query('priority') priority?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.decisions.listDecisions(user.organizationId, user.sub, user.role, {
      status,
      search,
      decisionType,
      priority,
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create an organisation decision' })
  async create(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    const decision = await this.decisions.createDecision(user.organizationId, user.sub, user.role, body ?? {});
    return decision;
  }

  @Get('outcomes/analytics')
  @ApiOperation({ summary: 'Get organisation-scoped decision outcome and review analytics' })
  outcomeAnalytics(@CurrentUser() user: JwtPayload) {
    return this.decisions.getOutcomeAnalytics(user.organizationId, user.sub, user.role);
  }

  @Get('portfolio/analytics')
  @ApiOperation({ summary: 'Get organisation-scoped decision portfolio intelligence' })
  portfolioAnalytics(@CurrentUser() user: JwtPayload) {
    return this.decisions.getPortfolioAnalytics(user.organizationId, user.sub, user.role);
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Get('governance/overview')
  @ApiOperation({ summary: 'Get organisation-scoped approval governance overview' })
  governanceOverview(@CurrentUser() user: JwtPayload) {
    return this.decisions.getGovernanceOverview(user.organizationId, user.sub, user.role);
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Get('governance/audit')
  @ApiOperation({ summary: 'Get a page of governance events visible to the current user' })
  governanceAudit(
    @CurrentUser() user: JwtPayload,
    @Query('category') category = 'all',
    @Query('cursor') cursor?: string,
  ) {
    return this.decisions.listGovernanceEvents(user.organizationId, user.sub, user.role, category, cursor);
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Post('governance/policies')
  @ApiOperation({ summary: 'Create or update an organisation approval policy' })
  saveApprovalPolicy(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.decisions.saveApprovalPolicy(user.organizationId, user.sub, user.role, body ?? {});
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Post('governance/policies/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate an organisation approval policy' })
  deactivateApprovalPolicy(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.decisions.deactivateApprovalPolicy(user.organizationId, user.sub, user.role, id);
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Post('governance/delegations')
  @ApiOperation({ summary: 'Grant scoped approval delegation' })
  createApprovalDelegation(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.decisions.createApprovalDelegation(user.organizationId, user.sub, user.role, body ?? {});
  }

  @UseGuards(FeatureGuard)
  @RequiresFeature('advanced_governance')
  @Post('governance/delegations/:id/revoke')
  @ApiOperation({ summary: 'Revoke an approval delegation' })
  revokeApprovalDelegation(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.decisions.revokeApprovalDelegation(user.organizationId, user.sub, user.role, id);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a decision with accessible links and audit history' })
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.decisions.getDecision(id, user.organizationId, user.sub, user.role);
  }

  @Post(':id/escalate')
  @ApiOperation({ summary: 'Escalate an overdue approval without changing its lifecycle status' })
  escalateApproval(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.decisions.escalateApproval(id, user.organizationId, user.sub, user.role, body?.note);
  }
  @Post(':id/update')
  @ApiOperation({ summary: 'Update a draft or proposed decision' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.decisions.updateDecision(id, user.organizationId, user.sub, user.role, body ?? {});
  }

  @Post(':id/transition')
  @ApiOperation({ summary: 'Advance a decision through its audited lifecycle' })
  async transition(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status?: string; note?: string; actualOutcome?: string; outcomeAssessment?: string; delegationId?: string },
  ) {
    const nextStatus = String(body?.status ?? '');
    const decision = await this.decisions.transitionDecision(
      id,
      user.organizationId,
      user.sub,
      user.role,
      nextStatus,
      body?.note,
      body?.actualOutcome,
      body?.outcomeAssessment,
      body?.delegationId,
    );

    return decision;
  }

  @Post(':id/links')
  @ApiOperation({ summary: 'Link a claim, conflict, goal, objective, project, task or document' })
  addLink(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { linkType?: string; linkedId?: string },
  ) {
    return this.decisions.addLink(
      id,
      user.organizationId,
      user.sub,
      user.role,
      String(body?.linkType ?? ''),
      String(body?.linkedId ?? ''),
    );
  }

  @Post(':id/links/:linkId/remove')
  @ApiOperation({ summary: 'Remove a decision link' })
  removeLink(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.decisions.removeLink(id, linkId, user.organizationId, user.sub, user.role);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get decision lifecycle audit history' })
  history(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.decisions.getHistory(id, user.organizationId, user.sub, user.role);
  }

  @Get(':id/history/page')
  @ApiOperation({ summary: 'Get a paginated decision lifecycle history page' })
  historyPage(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.decisions.getHistoryPage(
      id,
      user.organizationId,
      user.sub,
      user.role,
      { limit, offset },
    );
  }
}
