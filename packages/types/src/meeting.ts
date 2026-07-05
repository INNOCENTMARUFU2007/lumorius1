export type MeetingStatus = 'uploading' | 'transcribing' | 'analyzing' | 'completed' | 'failed';

export interface Meeting {
  id: string;
  title: string;
  status: MeetingStatus;
  mediaUrl?: string;
  duration?: number;
  participantCount?: number;
  organizationId: string;
  createdById: string;
  teamId?: string;
  scheduledAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  content: string;
  segments: TranscriptSegment[];
  language: string;
  createdAt: string;
}

export interface TranscriptSegment {
  speaker?: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface MeetingAnalysis {
  id: string;
  meetingId: string;
  summary: string;
  actionItems: ActionItem[];
  decisions: Decision[];
  keyTopics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  strategicInsights: string[];
  createdAt: string;
}

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'completed';
}

export interface Decision {
  id: string;
  description: string;
  madeBy?: string;
  context: string;
}
