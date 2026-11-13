import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { KnowledgeService } from './knowledge.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeAnalyticsService } from './knowledge-analytics.service';
import { KnowledgeConflictsService } from './knowledge-conflicts.service';

import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly retrievalService: KnowledgeRetrievalService,
    private readonly analyticsService: KnowledgeAnalyticsService,
    private readonly conflictsService: KnowledgeConflictsService,
  ) {}

  @Get('graph')
  @ApiOperation({ summary: 'Get the knowledge graph' })
  getGraph(
    @CurrentUser() user: JwtPayload,
    @Query('nodeId') nodeId?: string,
    @Query('nodeType') nodeType?: string,
    @Query('depth') depth?: number,
    @Query('search') search?: string,
  ) {
    return this.knowledgeService.getGraph(user.organizationId, {
      nodeId,
      nodeType,
      depth,
      search,
      userId: user.sub,
      role: user.role,
    });
  }

  @Get('analytics')
  @ApiOperation({
    summary: 'Get team-accessible knowledge intelligence analytics',
  })
  getAnalytics(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getAnalytics(
      user.organizationId,
      user.sub,
      user.role,
    );
  }

  @Post('nodes')
  @ApiOperation({ summary: 'Create a knowledge node' })
  createNode(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.knowledgeService.createNode(
      user.organizationId,
      body as Parameters<KnowledgeService['createNode']>[1],
      { userId: user.sub, role: user.role },
    );
  }

  @Get('nodes/:id/evidence')
  @ApiOperation({ summary: 'Get team-accessible node evidence' })
  getNodeEvidence(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.getNodeEvidence(
      id,
      user.organizationId,
      {
        userId: user.sub,
        role: user.role,
      },
    );
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get a knowledge node by ID' })
  getNode(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.knowledgeService.findNodeById(
      id,
      user.organizationId,
      {
        userId: user.sub,
        role: user.role,
      },
    );
  }

  @Post('relations')
  @ApiOperation({ summary: 'Create a relation between nodes' })
  createRelation(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.knowledgeService.createRelation(
      user.organizationId,
      body as Parameters<KnowledgeService['createRelation']>[1],
    );
  }

  @Post('search')
  @ApiOperation({ summary: 'Semantic search across the knowledge graph' })
  search(
    @CurrentUser() user: JwtPayload,
    @Body() body: { query: string },
  ) {
    return this.knowledgeService.semanticSearch(
      user.organizationId,
      body.query,
      {
        userId: user.sub,
        role: user.role,
      },
    );
  }

  @Post('retrieve')
  @ApiOperation({ summary: 'Retrieve evidence-backed knowledge' })
  retrieve(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      query: string;
      limit?: number;
      documentIds?: string[];
      teamId?: string;
    },
  ) {
    return this.retrievalService.retrieve({
      organizationId: user.organizationId,
      userId: user.sub,
      role: user.role,
      query: body?.query ?? '',
      limit: body?.limit,
      documentIds: body?.documentIds,
      teamId: body?.teamId,
    });
  }

  @Post('retrieve/unified')
  @ApiOperation({ summary: 'Retrieve permission-scoped intelligence across company sources' })
  retrieveUnified(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      query: string;
      limit?: number;
      documentIds?: string[];
      teamId?: string;
    },
  ) {
    return this.retrievalService.retrieveUnified({
      organizationId: user.organizationId,
      userId: user.sub,
      role: user.role,
      query: body?.query ?? '',
      limit: body?.limit,
      documentIds: body?.documentIds,
      teamId: body?.teamId,
    });
  }

  @Get('conflicts')
  @ApiOperation({ summary: 'List reviewable knowledge claim conflicts' })
  listConflicts(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.conflictsService.listConflicts(
      user.organizationId,
      user.sub,
      user.role,
      {
        status,
        limit: limit === undefined ? undefined : Number(limit),
        offset: offset === undefined ? undefined : Number(offset),
      },
    );
  }

  @Post('conflicts/scan')
  @ApiOperation({ summary: 'Detect potential conflicts between accessible claims' })
  scanConflicts(@CurrentUser() user: JwtPayload) {
    return this.conflictsService.detectConflicts(
      user.organizationId,
      user.sub,
      user.role,
    );
  }

  @Get('conflicts/:id/history')
  @ApiOperation({ summary: 'Get the review audit history for a conflict' })
  getConflictHistory(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.conflictsService.getReviewHistory(
      id,
      user.organizationId,
      user.sub,
      user.role,
    );
  }

  @Post('conflicts/:id/review')
  @ApiOperation({ summary: 'Review a potential knowledge claim conflict' })
  reviewConflict(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: {
      status: 'confirmed' | 'dismissed' | 'resolved';
      note?: string;
    },
  ) {
    return this.conflictsService.reviewConflict(
      id,
      user.organizationId,
      user.sub,
      user.role,
      body?.status,
      body?.note,
    );
  }
  @Post('sync')
  @ApiOperation({ summary: 'Sync knowledge from indexed documents' })
  sync(@CurrentUser() user: JwtPayload) {
    return this.knowledgeService.syncFromDocuments(
      user.organizationId,
    );
  }
}