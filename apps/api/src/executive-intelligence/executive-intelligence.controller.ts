import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { ExecutiveImportService } from './executive-import.service';

@ApiTags('executive-intelligence')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('executive-intelligence')
export class ExecutiveIntelligenceController {
  constructor(private readonly imports: ExecutiveImportService) {}

  private actor(user: JwtPayload) {
    return {
      organizationId: user.organizationId,
      userId: user.sub,
      role: String(user.role ?? ''),
    };
  }

  @Post('imports')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stage an Executive Intelligence CSV/XLSX import for mapping and validation' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body('datasetType') datasetType: string,
  ) {
    if (!file) throw new BadRequestException('A CSV or XLSX file is required in multipart field "file".');
    return this.imports.upload(file, datasetType, this.actor(user));
  }

  @Get('imports')
  @ApiOperation({ summary: 'List organisation Executive Intelligence imports' })
  listImports(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.imports.listImports(this.actor(user), page, pageSize);
  }

  @Get('imports/:id')
  @ApiOperation({ summary: 'Get an import and its staged validation preview' })
  getImport(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.imports.getImport(id, this.actor(user));
  }

  @Post('imports/:id/validate')
  @ApiOperation({ summary: 'Map source columns and validate every staged import row' })
  validate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { mapping?: Record<string, string> },
  ) {
    return this.imports.validateImport(id, body?.mapping, this.actor(user));
  }

  @Post('imports/:id/commit')
  @ApiOperation({ summary: 'Commit valid import rows transactionally after explicit partial-import confirmation' })
  commit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { confirmPartial?: boolean },
  ) {
    return this.imports.commitImport(id, body?.confirmPartial, this.actor(user));
  }

  @Get('financial-candidates')
  @ApiOperation({ summary: 'List evidence-backed financial candidates for owner/admin review' })
  financialCandidates(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.imports.listFinancialCandidates(this.actor(user), status, limit);
  }

  @Post('financial-candidates/:id/approve')
  @ApiOperation({ summary: 'Approve and commit one evidence-backed financial candidate through import validation' })
  approveFinancialCandidate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.imports.approveFinancialCandidate(id, this.actor(user));
  }

  @Post('financial-candidates/:id/reject')
  @ApiOperation({ summary: 'Reject a financial candidate with an audit reason' })
  rejectFinancialCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.imports.rejectFinancialCandidate(id, body?.reason, this.actor(user));
  }
}