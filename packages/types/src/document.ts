export type DocumentStatus = 'uploading' | 'processing' | 'indexed' | 'failed';
export type DocumentType = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'pptx' | 'txt' | 'md';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  status: DocumentStatus;
  sizeBytes: number;
  storageKey: string;
  organizationId: string;
  uploadedById: string;
  teamId?: string;
  tags: string[];
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  score: number;
  highlights: string[];
}

export interface AskQuestionDto {
  question: string;
  documentIds?: string[];
  teamId?: string;
}

export interface AskQuestionResponse {
  answer: string;
  sources: SearchResult[];
  confidence: number;
}
