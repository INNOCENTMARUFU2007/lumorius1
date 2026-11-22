import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  ParseUUIDPipe,
  Header,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { GdprService } from './gdpr.service';

@ApiTags('gdpr')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'gdpr', version: '1' })
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Export all my data (GDPR Art. 20)' })
  async exportMyData(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const bundle = await this.gdprService.exportUserData(user.sub);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="lumorius-data-export-${user.sub}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Get('deletion-status')
  @ApiOperation({ summary: 'Get the status of my account deletion request' })
  deletionStatus(@CurrentUser() user: JwtPayload) {
    return this.gdprService.getDeletionStatus(user.sub);
  }

  @Post('request-deletion')
  @ApiOperation({ summary: 'Request account deletion (GDPR Art. 17) — 30-day grace period' })
  @HttpCode(HttpStatus.ACCEPTED)
  requestDeletion(@CurrentUser() user: JwtPayload) {
    return this.gdprService.requestDeletion(user.sub);
  }

  @Delete('cancel-deletion')
  @ApiOperation({ summary: 'Cancel a pending deletion request' })
  @HttpCode(HttpStatus.OK)
  cancelDeletion(@CurrentUser() user: JwtPayload) {
    return this.gdprService.cancelDeletion(user.sub);
  }

  @Get('organization/export')
  @Roles('owner', 'admin')
  @Header('Cache-Control', 'private, no-store')
  organizationExport(
    @CurrentUser() user: JwtPayload,
    @Query('resource') resource: string,
    @Query('after') after?: string,
  ) {
    return this.gdprService.exportOrganizationData(user.organizationId, user.sub, resource, after);
  }

  @Get('organization/deletion-requests/:id')
  organizationDeletionReceipt(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.gdprService.getOrganizationDeletionReceipt(id, user.sub);
  }

  @Get('organization/deletion-status')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Get the organization deletion request status' })
  organizationDeletionStatus(@CurrentUser() user: JwtPayload) {
    return this.gdprService.getOrganizationDeletionStatus(user.organizationId);
  }

  @Post('organization/request-deletion')
  @Roles('owner')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Schedule organization deletion after a 30-day grace period' })
  requestOrganizationDeletion(@CurrentUser() user: JwtPayload) {
    return this.gdprService.requestOrganizationDeletion(user.organizationId, user.sub);
  }

  @Delete('organization/cancel-deletion')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Cancel a pending organization deletion request' })
  cancelOrganizationDeletion(@CurrentUser() user: JwtPayload) {
    return this.gdprService.cancelOrganizationDeletion(user.organizationId, user.sub);
  }

  @Get('retention')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'List organization data-retention policies' })
  retentionPolicies(@CurrentUser() user: JwtPayload) {
    return this.gdprService.getRetentionPolicies(user.organizationId);
  }

  @Put('retention/:resourceType')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Set an organization data-retention policy' })
  setRetentionPolicy(
    @CurrentUser() user: JwtPayload,
    @Param('resourceType') resourceType: string,
    @Body() body: { retentionDays?: number },
  ) {
    return this.gdprService.setRetentionPolicy(
      user.organizationId,
      user.sub,
      resourceType,
      Number(body?.retentionDays),
    );
  }
}
