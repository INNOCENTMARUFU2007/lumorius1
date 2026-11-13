import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  UseGuards, Query, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import type { MeetingActor } from './meetings.service';
import { MeetingReviewService } from './meeting-review.service';
import { MeetingCrossMeetingIntelligenceService } from './meeting-cross-meeting-intelligence.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

interface MeetingTextImportBody {
  title?: string;
  content: string;
  teamId?: string;
  scheduledAt?: string;
  language?: string;
}

@ApiTags('meetings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly meetingReviewService: MeetingReviewService,
    private readonly meetingCrossMeetingIntelligenceService: MeetingCrossMeetingIntelligenceService,
  ) {}

  private actor(user: JwtPayload): MeetingActor {
    return { organizationId: user.organizationId, userId: user.sub, role: String(user.role ?? '') };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a recording after confirming required participant consent' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body() body: { title?: string; teamId?: string; scheduledAt?: string; consentConfirmed?: boolean | string },
  ) {
    return this.meetingsService.upload(file, this.actor(user), body);
  }

  @Post('transcripts')
  @ApiOperation({ summary: 'Import a meeting transcript for evidence indexing and analysis' })
  importTranscript(@CurrentUser() user: JwtPayload, @Body() body: MeetingTextImportBody) {
    return this.meetingsService.importText('transcript', body, this.actor(user));
  }

  @Post('notes')
  @ApiOperation({ summary: 'Import meeting notes for evidence indexing and analysis' })
  importNotes(@CurrentUser() user: JwtPayload, @Body() body: MeetingTextImportBody) {
    return this.meetingsService.importText('notes', body, this.actor(user));
  }

  @Get()
  @ApiOperation({ summary: 'List meetings available to the authenticated organisation and team' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('teamId') teamId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.meetingsService.findAll(this.actor(user), { search, status, teamId, page, pageSize });
  }

  @Get('intelligence/search')
  @ApiOperation({ summary: 'Search accessible meeting transcripts using hybrid retrieval' })
  searchMeetingIntelligence(
    @CurrentUser() user: JwtPayload,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.meetingCrossMeetingIntelligenceService.search(
      { query: query ?? '', limit: Number(limit) },
      this.actor(user),
    );
  }

  @Post('intelligence/ask')
  @ApiOperation({ summary: 'Answer a question using cited evidence from accessible meetings' })
  askMeetingIntelligence(
    @CurrentUser() user: JwtPayload,
    @Body() body: { query?: string; limit?: number },
  ) {
    return this.meetingCrossMeetingIntelligenceService.ask(
      { query: body?.query ?? '', limit: body?.limit },
      this.actor(user),
    );
  }

  @Get('intelligence/themes')
  @ApiOperation({ summary: 'Find recurring topics across accessible meeting analyses' })
  getMeetingThemes(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.meetingCrossMeetingIntelligenceService.themes(this.actor(user), Number(days ?? 90));
  }

  @Get('intelligence/commitments')
  @ApiOperation({ summary: 'List unresolved meeting commitments and linked task states' })
  getMeetingCommitments(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.meetingCrossMeetingIntelligenceService.commitments(this.actor(user), Number(limit ?? 100));
  }

  @Get('intelligence/decisions')
  @ApiOperation({ summary: 'Track meeting decision candidates through governance and implementation' })
  getMeetingDecisionContinuity(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.meetingCrossMeetingIntelligenceService.decisionContinuity(this.actor(user), Number(limit ?? 100));
  }

  @Get('intelligence/timeline')
  @ApiOperation({ summary: 'Get the chronological meeting intelligence timeline' })
  getMeetingIntelligenceTimeline(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.meetingCrossMeetingIntelligenceService.timeline(this.actor(user), Number(limit ?? 100));
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get a meeting the authenticated user is authorised to access' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.findById(id, this.actor(user));
  }

  @Get(':id/transcript')
  @ApiOperation({ summary: 'Get a meeting transcript' })
  getTranscript(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.getTranscript(id, this.actor(user));
  }

  @Get(':id/analysis')
  @ApiOperation({ summary: 'Get a meeting analysis, action proposals and decisions' })
  getAnalysis(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.getAnalysis(id, this.actor(user));
  }

  @Get(':id/review')
  @ApiOperation({ summary: 'Get the evidence-backed meeting review workspace' })
  getReview(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingReviewService.getReview(id, this.actor(user));
  }

  @Patch(':id/summary')
  @ApiOperation({ summary: 'Save an edited meeting summary and retain revision history' })
  updateSummary(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { summary?: string }) {
    return this.meetingReviewService.updateSummary(id, body?.summary, this.actor(user));
  }

  @Post(':id/actions/:actionId/approve')
  @ApiOperation({ summary: 'Approve a proposed meeting action with explicit task fields' })
  approveAction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() body: { assigneeId?: string | null; dueAt?: string | null; projectId?: string | null; priority?: string },
  ) {
    return this.meetingReviewService.approveAction(id, actionId, body ?? {}, this.actor(user));
  }

  @Post(':id/actions/:actionId/reject')
  @ApiOperation({ summary: 'Reject a proposed meeting action with an audit reason' })
  rejectAction(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @Body() body: { reason?: string },
  ) {
    return this.meetingReviewService.rejectAction(id, actionId, body?.reason, this.actor(user));
  }

  @Post(':id/actions/:actionId/create-task')
  @ApiOperation({ summary: 'Create or retrieve the idempotent task for an approved meeting action' })
  createTaskFromAction(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('actionId') actionId: string) {
    return this.meetingReviewService.createTaskFromAction(id, actionId, this.actor(user));
  }

  @Post(':id/decisions/:candidateId/accept')
  @ApiOperation({ summary: 'Accept a meeting decision candidate and submit a governance decision for review' })
  acceptDecisionCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { ownerId?: string | null; dueDate?: string | null; decisionType?: string; priority?: string; expectedOutcome?: string },
  ) {
    return this.meetingReviewService.acceptDecisionCandidate(id, candidateId, body ?? {}, this.actor(user));
  }

  @Post(':id/decisions/:candidateId/reject')
  @ApiOperation({ summary: 'Reject a proposed meeting decision candidate with an audit reason' })
  rejectDecisionCandidate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
    @Body() body: { reason?: string },
  ) {
    return this.meetingReviewService.rejectDecisionCandidate(id, candidateId, body?.reason, this.actor(user));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a meeting and its recording' })
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.meetingsService.delete(id, this.actor(user));
  }
}