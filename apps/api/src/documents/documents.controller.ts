
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload and index a document into Company Brain',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      teamId?: string;
      tags?: string;
    },
  ) {
    return this.documentsService.upload(
      file,
      user.organizationId,
      user.sub,
      {
        teamId: body.teamId,
        tags: body.tags
          ? body.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      },
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List documents in Company Brain',
  })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('teamId') teamId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.documentsService.findAll(
      user.organizationId,
      {
        search,
        status,
        type,
        teamId,
        page,
        pageSize,
      },
    );
  }

  @Get('search-facets')
  @ApiOperation({
    summary:
      'Get indexed-document search filters for the current organization',
  })
  getSearchFacets(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.getSearchFacets(
      user.organizationId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a document by ID',
  })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.documentsService.findById(
      id,
      user.organizationId,
    );
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Get a presigned download URL',
  })
  getDownloadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.documentsService.getDownloadUrl(
      id,
      user.organizationId,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a document',
  })
  delete(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.documentsService.delete(
      id,
      user.organizationId,
    );
  }

  @Post('search')
  @ApiOperation({
    summary: 'Semantic search across documents',
  })
  search(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      query: string;
      documentIds?: string[];
      topK?: number;
      type?: string;
      tag?: string;
      createdAfter?: string;
      teamId?: string;
      myHistory?: boolean;
    },
  ) {
    return this.documentsService.search(
      user.organizationId,
      body.query,
      {
        documentIds: body.documentIds,
        topK: body.topK,
        type: body.type,
        tag: body.tag,
        createdAfter: body.createdAfter,
        teamId: body.teamId,
        uploadedById: body.myHistory
          ? user.sub
          : undefined,
      },
    );
  }

  @Post('ask')
  @ApiOperation({
    summary: 'Ask a question about your documents (RAG)',
  })
  ask(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      question: string;
      documentIds?: string[];
      teamId?: string;
      type?: string;
      tag?: string;
      createdAfter?: string;
      myHistory?: boolean;
    },
  ) {
    return this.documentsService.ask(
      user.organizationId,
      body.question,
      {
        documentIds: body.documentIds,
        teamId: body.teamId,
        type: body.type,
        tag: body.tag,
        createdAfter: body.createdAfter,
        uploadedById: body.myHistory
          ? user.sub
          : undefined,
      },
    );
  }
}
