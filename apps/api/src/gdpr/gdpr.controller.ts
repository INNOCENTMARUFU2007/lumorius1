import { Controller, Get, Post, Delete, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GdprService } from './gdpr.service';

@ApiTags('gdpr')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'gdpr', version: '1' })
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export all my data (GDPR Art. 20)' })
  async exportMyData(@CurrentUser() user: { id: string }, @Res() res: Response) {
    const bundle = await this.gdprService.exportUserData(user.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="lumorius-data-export-${user.id}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Post('request-deletion')
  @ApiOperation({ summary: 'Request account deletion (GDPR Art. 17) — 30-day grace period' })
  @HttpCode(HttpStatus.ACCEPTED)
  requestDeletion(@CurrentUser() user: { id: string }) {
    return this.gdprService.requestDeletion(user.id);
  }

  @Delete('cancel-deletion')
  @ApiOperation({ summary: 'Cancel a pending deletion request' })
  @HttpCode(HttpStatus.OK)
  cancelDeletion(@CurrentUser() user: { id: string }) {
    return this.gdprService.cancelDeletion(user.id);
  }
}
