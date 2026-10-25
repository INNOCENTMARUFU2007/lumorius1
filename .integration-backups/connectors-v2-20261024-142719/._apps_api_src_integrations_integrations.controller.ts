import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List integration catalog and actual connection state for the current organisation' })
  list(@CurrentUser() user: JwtPayload) {
    return this.integrationsService.listForUser(user);
  }

  @Post(':provider/connect')
  @ApiOperation({ summary: 'Start an OAuth connection for a supported provider' })
  connect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.beginConnect(user, provider);
  }

  @Delete(':provider')
  @ApiOperation({ summary: 'Remove a saved organisation integration connection' })
  disconnect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.disconnect(user, provider);
  }
}

// OAuth callbacks must be reachable from the provider and are protected by one-time, expiring state.
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsOAuthController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get(':provider/callback')
  @ApiOperation({ summary: 'Complete a provider OAuth callback' })
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