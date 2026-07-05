import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('knowledge')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('graph')
  @ApiOperation({ summary: 'Get the knowledge graph' })
  getGraph(
    @CurrentUser() user: JwtPayload,
    @Query('nodeId') nodeId?: string,
    @Query('nodeType') nodeType?: string,
    @Query('depth') depth?: number,
    @Query('search') search?: string,
  ) {
    return this.knowledgeService.getGraph(user.organizationId, { nodeId, nodeType, depth, search });
  }

  @Post('nodes')
  @ApiOperation({ summary: 'Create a knowledge node' })
  createNode(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.knowledgeService.createNode(user.organizationId, body as Parameters<KnowledgeService['createNode']>[1]);
  }

  @Get('nodes/:id')
  @ApiOperation({ summary: 'Get a knowledge node by ID' })
  getNode(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.knowledgeService.findNodeById(id, user.organizationId);
  }

  @Post('relations')
  @ApiOperation({ summary: 'Create a relation between nodes' })
  createRelation(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.knowledgeService.createRelation(user.organizationId, body as Parameters<KnowledgeService['createRelation']>[1]);
  }

  @Post('search')
  @ApiOperation({ summary: 'Semantic search across knowledge graph' })
  search(@CurrentUser() user: JwtPayload, @Body() body: { query: string }) {
    return this.knowledgeService.semanticSearch(user.organizationId, body.query);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync knowledge nodes from indexed documents' })
  sync(@CurrentUser() user: JwtPayload) {
    return this.knowledgeService.syncFromDocuments(user.organizationId);
  }
}
