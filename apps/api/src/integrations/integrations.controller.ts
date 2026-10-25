import {
  Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List integration catalog and verified organisation connection states' })
  list(@CurrentUser() user: JwtPayload) {
    return this.integrationsService.listForUser(user);
  }

  @Post(':provider/connect')
  @ApiOperation({ summary: 'Start OAuth for a supported provider' })
  connect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.beginConnect(user, provider);
  }

  @Post(':provider/configure')
  @ApiOperation({ summary: 'Configure an API-key or webhook integration' })
  configure(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Body() body: { apiKey?: string; appKey?: string; webhookUrl?: string },
  ) {
    return this.integrationsService.configureConnector(user, provider, body);
  }

  @Post(':provider/sync')
  @ApiOperation({ summary: 'Import recent provider content into Company Brain' })
  sync(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.syncForUser(user, provider);
  }

  @Delete(':provider')
  @ApiOperation({ summary: 'Disconnect a provider from the current organisation' })
  disconnect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.disconnect(user, provider);
  }
}

// OAuth callbacks use one-time, short-lived state stored by the server, not a session cookie.
@ApiTags('integration-oauth')
@Controller('integrations')
export class IntegrationsOAuthController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get(':provider/callback')
  @ApiOperation({ summary: 'Complete OAuth and return to the integrations page' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() response: Response,
  ) {
    try {
      const url = await this.integrationsService.completeOAuth(provider, code, state, providerError);
      return response.redirect(302, url);
    } catch {
      return response.redirect(302, this.integrationsService.resultRedirect(provider, 'error'));
    }
  }
}