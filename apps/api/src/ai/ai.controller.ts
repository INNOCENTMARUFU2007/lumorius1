import { RequiresModule } from '../billing/entitlements';
import { Controller, Get, Post, Patch, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { KnowledgeRetrievalService } from '../knowledge/knowledge-retrieval.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@RequiresModule('core')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly retrievalService: KnowledgeRetrievalService,
  ) {}

  @Post('chat')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Send a message to the AI assistant' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit — slow down (Retry-After header set)' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted — upgrade plan' })
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() body: { message: string; conversationId?: string },
  ) {
    return this.sendGroundedMessage(user, body);
  }

  private async sendGroundedMessage(
    user: JwtPayload,
    body: { message: string; conversationId?: string },
  ) {
    const sources = await this.retrieveSources(user, body.message);
    return this.aiService.sendMessage(
      user.sub,
      user.organizationId,
      body.message,
      body.conversationId,
      { sources },
    );
  }

  private async retrieveSources(user: JwtPayload, query: string) {
    const intelligence = await this.retrievalService.retrieveUnified({
      organizationId: user.organizationId,
      userId: user.sub,
      role: user.role,
      query,
      limit: 6,
    });
    return intelligence.sources;
  }

  @Get('settings')
  @ApiOperation({ summary: 'AI provider, model and automation settings for this workspace' })
  getSettings(@CurrentUser() user: JwtPayload) {
    return this.aiService.getAiSettings(user.organizationId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Choose the AI provider/model and automation for this workspace (owner or admin)' })
  updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() body: { provider?: string; model?: string; autoKnowledgeExtraction?: boolean },
  ) {
    if (!['owner', 'admin'].includes(String(user.role ?? '').toLowerCase())) {
      throw new ForbiddenException('Only an owner or admin can change AI settings.');
    }
    return this.aiService.updateAiSettings(user.organizationId, body ?? {});
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List AI conversations' })
  getConversations(@CurrentUser() user: JwtPayload) {
    return this.aiService.getConversations(user.sub, user.organizationId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  getMessages(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.aiService.getConversationMessages(id, user.sub);
  }

  @Post('strategy/analyze')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Get strategic analysis from AI advisor' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted' })
  async strategyAnalyze(
    @CurrentUser() user: JwtPayload,
    @Body() body: { question: string; context?: Record<string, unknown> },
  ) {
    const sources = await this.retrieveSources(user, body.question);
    const result = await this.aiService.strategyAdvisor(
      user.organizationId,
      body.question,
      { ...body.context, sources },
      user.sub,
    );
    return { ...result, sources };
  }

  @Post('strategy/risks-opportunities')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Detect risks and opportunities from business data' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted' })
  async detectRisksOpportunities(
    @CurrentUser() user: JwtPayload,
    @Body() body: { data: Record<string, unknown> },
  ) {
    const sources = await this.retrieveSources(user, JSON.stringify(body.data).slice(0, 2000));
    const result = await this.aiService.detectRisksAndOpportunities({
      ...body.data,
      intelligence_sources: sources,
    }, {
      organizationId: user.organizationId,
      userId: user.sub,
      feature: 'risk_analysis',
    });
    return { ...result, sources };
  }

  @Post('reports/weekly')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Generate AI weekly business report' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted' })
  async generateWeeklyReport(
    @CurrentUser() user: JwtPayload,
    @Body() body: { data: Record<string, unknown> },
  ) {
    const sources = await this.retrieveSources(user, JSON.stringify(body.data).slice(0, 2000));
    const result = await this.aiService.generateWeeklyReport({
      ...body.data,
      intelligence_sources: sources,
    }, {
      organizationId: user.organizationId,
      userId: user.sub,
      feature: 'weekly_report',
    });
    return { ...result, sources };
  }
}
