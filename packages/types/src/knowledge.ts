export type KnowledgeNodeType =
  | 'person'
  | 'document'
  | 'project'
  | 'department'
  | 'task'
  | 'customer'
  | 'decision'
  | 'concept';

export interface KnowledgeNode {
  id: string;
  name: string;
  type: KnowledgeNodeType;
  description?: string;
  properties: Record<string, unknown>;
  organizationId: string;
  sourceType?: string;
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRelation {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: string;
  strength: number;
  organizationId: string;
  createdAt: string;
}

export interface KnowledgeGraphQuery {
  nodeId?: string;
  nodeType?: KnowledgeNodeType;
  depth?: number;
  search?: string;
}

export interface KnowledgeGraphResponse {
  nodes: KnowledgeNode[];
  relations: KnowledgeRelation[];
}
