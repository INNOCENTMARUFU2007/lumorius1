import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { LuieOperationsService } from './luie-operations.service';

@ApiTags('luie-operations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('owner', 'admin')
@Controller('security/luie')
export class LuieOperationsController {
  constructor(private readonly operations: LuieOperationsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Organisation-scoped LUIE delivery health and backlog' })
  summary(@CurrentUser() user: JwtPayload) {
    return this.operations.getSummary(user.organizationId!);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List organisation-scoped LUIE event deliveries' })
  deliveries(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('consumerName') consumerName?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.operations.listDeliveries(user.organizationId!, { status, consumerName, eventType, limit, offset });
  }

  @Get('deliveries/:id')
  @ApiOperation({ summary: 'Inspect one organisation-scoped LUIE delivery and its operator history' })
  delivery(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.operations.getDelivery(user.organizationId!, id);
  }

  @Post('deliveries/:id/retry')
  @ApiOperation({ summary: 'Retry a dead-letter delivery without creating a new event or recipient' })
  retry(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.operations.retryDeadLetter(user.organizationId!, id, user.sub, body?.reason);
  }

  @Get('audit')
  @ApiOperation({ summary: 'List LUIE operator actions for the organisation' })
  audit(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.operations.listOperatorAudit(user.organizationId!, limit);
  }
}