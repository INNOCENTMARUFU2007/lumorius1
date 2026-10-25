import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { AiQuotaGuard } from './guards/ai-quota.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Send a message to the AI assistant' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit — slow down (Retry-After header set)' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted — upgrade plan' })
  sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() body: { message: string; conversationId?: string },
  ) {
    return this.aiService.sendMessage(
      user.sub, user.organizationId, body.message, body.conversationId,
    );
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
  strategyAnalyze(
    @CurrentUser() user: JwtPayload,
    @Body() body: { question: string; context?: Record<string, unknown> },
  ) {
    return this.aiService.strategyAdvisor(
      user.organizationId, body.question, body.context ?? {},
    );
  }

  @Post('strategy/risks-opportunities')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Detect risks and opportunities from business data' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted' })
  detectRisksOpportunities(
    @CurrentUser() user: JwtPayload,
    @Body() body: { data: Record<string, unknown> },
  ) {
    return this.aiService.detectRisksAndOpportunities(body.data);
  }

  @Post('reports/weekly')
  @UseGuards(AiQuotaGuard)
  @ApiOperation({ summary: 'Generate AI weekly business report' })
  @ApiResponse({ status: 429, description: 'Burst rate limit hit' })
  @ApiResponse({ status: 402, description: 'Monthly AI quota exhausted' })
  generateWeeklyReport(
    @CurrentUser() user: JwtPayload,
    @Body() body: { data: Record<string, unknown> },
  ) {
   return this.aiService.generateWeeklyReport(body.data, {
  organizationId: user.organizationId,
  userId: user.sub,
  feature: 'weekly_report',
});
  }
}
