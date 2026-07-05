import {
  Controller, Get, Post, Delete, Body, Param,
  UseGuards, Query, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload audio/video for transcription and analysis' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body() body: { title?: string; teamId?: string; scheduledAt?: string },
  ) {
    return this.meetingsService.upload(file, user.organizationId, user.sub, body);
  }

  @Get()
  @ApiOperation({ summary: 'List meetings' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('teamId') teamId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.meetingsService.findAll(user.organizationId, { search, status, teamId, page, pageSize });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get meeting by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.findById(id, user.organizationId);
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: 'Get meeting transcript' })
  getTranscript(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.getTranscript(id, user.organizationId);
  }

  @Get(':id/analysis')
  @ApiOperation({ summary: 'Get meeting analysis (summary, action items, decisions)' })
  getAnalysis(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.getAnalysis(id, user.organizationId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a meeting and its recording' })
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.delete(id, user.organizationId);
  }
}
