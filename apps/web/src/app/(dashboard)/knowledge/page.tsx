
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  FileCheck2,
  GitBranch,
  Network,
  Search,
  RefreshCw,
  Loader2,
  Link2,
  X,
  ArrowUpRight,
  Database,
  Filter,
  Info,
} from 'lucide-react';
import api from '@/lib/api';
import { KnowledgeConflictPanel } from './knowledge-conflict-panel';
import { toast } from 'sonner';

type DataRecord = Record<string, unknown>;

type GraphNode = DataRecord & {
  id: string;
  name: string;
  label: string;
  type: string;
  description: string;
};

type GraphEdge = DataRecord & {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  weight: number;
};

type KnowledgeEvidence = {
  documentId: string;
  documentName: string;
  documentType?: string;
  relationship?: string;
  evidenceType?: string;
  chunkId?: string | null;
  chunkIndex?: number | string | null;
  excerpt?: string | null;
  confidence?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  supersededAt?: string | null;
  status?: string;
};

type KnowledgeEvidenceResponse = {
  nodeId: string;
  total: number;
  sources: KnowledgeEvidence[];
};
type GraphData = {
  nodes: GraphNode[];
  relations: GraphEdge[];
};

type KnowledgeAnalytics = {
  indexedDocuments: number;
  entities: number;
  relationships: number;
  evidenceRecords: number;
  activeEvidence: number;
  disputedEvidence: number;
  supersededEvidence: number;
  entityAliases: number;
  completedExtractions: number;
  pendingExtractions: number;
  failedExtractions: number;
  extractionCoveragePercent: number;
  evidenceLast7Days: number;
  evidenceLast30Days: number;
  entityTypes: Array<{
    type: string;
    count: number;
  }>;
};

type PositionedNode = {
  id: string;
  x: number;
  y: number;
};

const WIDTH = 1400;
const HEIGHT = 1000;

const NODE_COLORS: Record<string, string> = {
  organization: '#06b6d4',
  person: '#f59e0b',
  team: '#8b5cf6',
  project: '#3b82f6',
  product: '#ec4899',
  module: '#10b981',
  document: '#a78bfa',
  concept: '#94a3b8',
  capability: '#eab308',
  goal: '#f97316',
  technology: '#22d3ee',
  department: '#0ea5e9',
  task: '#10b981',
  customer: '#fb923c',
  decision: '#ef4444',
};

function isRecord(value: unknown): value is DataRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : fallback;
}

function unwrapResponse(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 5; depth += 1) {
    if (
      isRecord(current) &&
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
    } else {
      break;
    }
  }

  return current;
}

function normalizeGraph(value: unknown): GraphData {
  let payload = unwrapResponse(value);

  if (isRecord(payload) && isRecord(payload.graph)) {
    payload = unwrapResponse(payload.graph);
  }

  if (!isRecord(payload) || !Array.isArray(payload.nodes)) {
    throw new Error(
      'The Knowledge Graph API did not return a valid nodes array.',
    );
  }

  const nodes: GraphNode[] = payload.nodes
    .filter(isRecord)
    .map((node, index) => {
      const name = stringValue(
        node.name,
        stringValue(node.label, `Node ${index + 1}`),
      );

      return {
        ...node,
        id: stringValue(node.id, `node-${index + 1}`),
        name,
        label: stringValue(node.label, name),
        type: stringValue(node.type, 'concept').toLowerCase(),
        description: stringValue(node.description),
      };
    });

  const rawRelations = Array.isArray(payload.relations)
    ? payload.relations
    : Array.isArray(payload.edges)
      ? payload.edges
      : [];

  const relations: GraphEdge[] = rawRelations
    .filter(isRecord)
    .map((edge, index) => ({
      ...edge,
      id: stringValue(edge.id, `edge-${index + 1}`),
      sourceId: stringValue(
        edge.from_node_id,
        stringValue(edge.source_id, stringValue(edge.fromNodeId)),
      ),
      targetId: stringValue(
        edge.to_node_id,
        stringValue(edge.target_id, stringValue(edge.toNodeId)),
      ),
      relationship: stringValue(
        edge.relation_type,
        stringValue(
          edge.relationship,
          stringValue(edge.relationType, 'RELATED TO'),
        ),
      ),
      weight: Number(edge.strength ?? edge.weight ?? 1) || 1,
    }))
    .filter((edge) => edge.sourceId && edge.targetId);

  return { nodes, relations };
}

/**
 * Deterministic force-directed layout.
 * Nodes repel one another to reduce crowding.
 * Connected nodes attract one another to preserve clusters.
 */
function calculateLayout(
  nodes: GraphNode[],
  relations: GraphEdge[],
): PositionedNode[] {
  if (nodes.length === 0) return [];

  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;
  const maxRadius = Math.min(WIDTH * 0.42, HEIGHT * 0.42);

  const positions = nodes.map((node, index) => {
    const angle = index * 2.399963229728653;
    const radius =
      maxRadius * Math.sqrt((index + 0.5) / nodes.length);

    return {
      id: node.id,
      x: centerX + Math.cos(angle) * radius * 1.2,
      y: centerY + Math.sin(angle) * radius,
    };
  });

  const indexById = new Map(
    nodes.map((node, index) => [node.id, index]),
  );

  const edges = relations
    .map((edge) => ({
      source: indexById.get(edge.sourceId),
      target: indexById.get(edge.targetId),
    }))
    .filter(
      (
        edge,
      ): edge is { source: number; target: number } =>
        edge.source !== undefined &&
        edge.target !== undefined &&
        edge.source !== edge.target,
    );

  // Reserve extra space for longer labels.
  const collisionRadii = nodes.map((node) =>
    Math.min(75, 42 + Math.min(node.name.length, 24) * 1.2),
  );

  const velocityX = new Array<number>(nodes.length).fill(0);
  const velocityY = new Array<number>(nodes.length).fill(0);

  for (let iteration = 0; iteration < 300; iteration += 1) {
    const forceX = new Array<number>(nodes.length).fill(0);
    const forceY = new Array<number>(nodes.length).fill(0);

    // Repel nodes and push overlapping labels farther apart.
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;

        const distance = Math.max(
          Math.sqrt(dx * dx + dy * dy),
          1,
        );

        const idealDistance =
          collisionRadii[i] + collisionRadii[j];

        const repulsion = 9000 / (distance * distance);
        const collision =
          Math.max(0, idealDistance - distance) * 0.025;

        const force = Math.min(3, repulsion + collision);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        forceX[i] -= fx;
        forceY[i] -= fy;
        forceX[j] += fx;
        forceY[j] += fy;
      }
    }

    // Keep related nodes near one another without crowding.
    for (const edge of edges) {
      const source = positions[edge.source];
      const target = positions[edge.target];

      const dx = target.x - source.x;
      const dy = target.y - source.y;

      const distance = Math.max(
        Math.sqrt(dx * dx + dy * dy),
        1,
      );

      const force = (distance - 175) * 0.0011;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      forceX[edge.source] += fx;
      forceY[edge.source] += fy;
      forceX[edge.target] -= fx;
      forceY[edge.target] -= fy;
    }

    // Gently centre the network.
    for (let i = 0; i < positions.length; i += 1) {
      forceX[i] += (centerX - positions[i].x) * 0.00065;
      forceY[i] += (centerY - positions[i].y) * 0.00065;

      velocityX[i] =
        (velocityX[i] + forceX[i]) * 0.64;
      velocityY[i] =
        (velocityY[i] + forceY[i]) * 0.64;

      positions[i].x += velocityX[i];
      positions[i].y += velocityY[i];

      // Leave room around the canvas edges for labels.
      positions[i].x = Math.max(
        145,
        Math.min(WIDTH - 145, positions[i].x),
      );

      positions[i].y = Math.max(
        45,
        Math.min(HEIGHT - 45, positions[i].y),
      );
    }
  }

  return positions;
}

function getNodeColor(type: string): string {
  return NODE_COLORS[type.toLowerCase()] ?? '#64748b';
}

function readableRelationship(value: string): string {
  return value.replace(/[_-]+/g, ' ').toLowerCase();
}

function formatEvidenceDate(value?: string | null): string {
  if (!value) return 'Not recorded';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString();
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isRecord(error) && isRecord(error.response)) {
    const responseData = error.response.data;

    if (isRecord(responseData)) {
      const message = responseData.message;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }

      if (
        Array.isArray(message) &&
        message.every((item) => typeof item === 'string')
      ) {
        return message.join(', ');
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedNodeId, setSelectedNodeId] = useState<
    string | null
  >(null);

  const [requestedNodeId, setRequestedNodeId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get('nodeId');

    if (nodeId) {
      setRequestedNodeId(nodeId);
    }
  }, []);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<GraphData, Error>({
    queryKey: ['knowledge', 'graph', requestedNodeId],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/knowledge/graph',
        {
          params: requestedNodeId
            ? {
                nodeId: requestedNodeId,
                depth: 2,
              }
            : undefined,
        },
      );

      return normalizeGraph(response.data);
    },
    retry: 1,
  });

  const analyticsQuery = useQuery<KnowledgeAnalytics, Error>({
    queryKey: ['knowledge', 'analytics'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/knowledge/analytics',
      );

      const payload = unwrapResponse(response.data);

      if (!isRecord(payload)) {
        throw new Error('Invalid Knowledge Analytics response.');
      }

      const toNumber = (value: unknown) => {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const entityTypes = Array.isArray(payload.entityTypes)
        ? payload.entityTypes
            .filter(isRecord)
            .map((entry) => ({
              type: stringValue(entry.type, 'unknown'),
              count: toNumber(entry.count),
            }))
        : [];

      return {
        indexedDocuments: toNumber(payload.indexedDocuments),
        entities: toNumber(payload.entities),
        relationships: toNumber(payload.relationships),
        evidenceRecords: toNumber(payload.evidenceRecords),
        activeEvidence: toNumber(payload.activeEvidence),
        disputedEvidence: toNumber(payload.disputedEvidence),
        supersededEvidence: toNumber(payload.supersededEvidence),
        entityAliases: toNumber(payload.entityAliases),
        completedExtractions: toNumber(payload.completedExtractions),
        pendingExtractions: toNumber(payload.pendingExtractions),
        failedExtractions: toNumber(payload.failedExtractions),
        extractionCoveragePercent: toNumber(payload.extractionCoveragePercent),
        evidenceLast7Days: toNumber(payload.evidenceLast7Days),
        evidenceLast30Days: toNumber(payload.evidenceLast30Days),
        entityTypes,
      };
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const syncMutation = useMutation({
    mutationFn: () => api.post('/knowledge/sync'),

    onSuccess: (response) => {
      const payload = unwrapResponse(response.data);

      const processed =
        isRecord(payload) &&
        typeof payload.processed === 'number'
          ? payload.processed
          : null;

      toast.success(
        processed === null
          ? 'Knowledge sync completed.'
          : `Knowledge extraction attempted for ${processed} indexed documents.`,
      );

      queryClient.invalidateQueries({
        queryKey: ['knowledge'],
      });
    },

    onError: (syncError: unknown) => {
      toast.error(
        getErrorMessage(
          syncError,
          'Failed to sync knowledge from documents.',
        ),
      );
    },
  });

  const nodes = data?.nodes ?? [];
  const relations = data?.relations ?? [];
  const analytics = analyticsQuery.data;

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const nodeTypes = useMemo(
    () =>
      [...new Set(nodes.map((node) => node.type))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [nodes],
  );

  const graphLayout = useMemo(
    () => calculateLayout(nodes, relations),
    [nodes, relations],
  );

  const positionById = useMemo(
    () =>
      new Map(
        graphLayout.map((position) => [
          position.id,
          position,
        ]),
      ),
    [graphLayout],
  );

  const degreeById = useMemo(() => {
    const degree = new Map<string, number>();

    for (const edge of relations) {
      degree.set(
        edge.sourceId,
        (degree.get(edge.sourceId) ?? 0) + 1,
      );

      degree.set(
        edge.targetId,
        (degree.get(edge.targetId) ?? 0) + 1,
      );
    }

    return degree;
  }, [relations]);

  const searchTerm = search.trim().toLowerCase();
  const hasSearch = searchTerm.length > 0;

  const matchingIds = useMemo(() => {
    const ids = new Set<string>();

    if (!searchTerm) return ids;

    for (const node of nodes) {
      const searchableText = [
        node.name,
        node.label,
        node.type,
        node.description,
      ]
        .join(' ')
        .toLowerCase();

      if (searchableText.includes(searchTerm)) {
        ids.add(node.id);
      }
    }

    return ids;
  }, [nodes, searchTerm]);

  const visibleNodes = useMemo(
    () =>
      typeFilter === 'all'
        ? nodes
        : nodes.filter((node) => node.type === typeFilter),
    [nodes, typeFilter],
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes],
  );

  const visibleRelations = useMemo(
    () =>
      relations.filter(
        (edge) =>
          visibleNodeIds.has(edge.sourceId) &&
          visibleNodeIds.has(edge.targetId),
      ),
    [relations, visibleNodeIds],
  );

  const selectedNode = selectedNodeId
    ? nodeById.get(selectedNodeId)
    : undefined;

  useEffect(() => {
    if (!requestedNodeId || !nodes.length) return;

    const matchingNode = nodes.find(
      (node) => node.id === requestedNodeId,
    );

    if (matchingNode) {
      setSelectedNodeId(matchingNode.id);
    }
  }, [requestedNodeId, nodes]);

  const selectedRelations = selectedNode
    ? relations.filter(
        (edge) =>
          edge.sourceId === selectedNode.id ||
          edge.targetId === selectedNode.id,
      )
    : [];

  const evidenceQuery = useQuery<KnowledgeEvidenceResponse, Error>({
    queryKey: ['knowledge', 'evidence', selectedNodeId],
    queryFn: async () => {
      if (!selectedNodeId) {
        return { nodeId: '', total: 0, sources: [] };
      }

      const response = await api.get<unknown>(
        `/knowledge/nodes/${selectedNodeId}/evidence`,
      );

      const payload = unwrapResponse(response.data);

      if (!isRecord(payload)) {
        throw new Error('Invalid evidence response.');
      }

      const sources = Array.isArray(payload.sources)
        ? payload.sources.filter(isRecord).map((source) => ({
            documentId: stringValue(source.documentId),
            documentName: stringValue(source.documentName, 'Untitled document'),
            documentType: stringValue(source.documentType),
            relationship: stringValue(source.relationship),
            evidenceType: stringValue(source.evidenceType),
            chunkId: typeof source.chunkId === 'string' ? source.chunkId : null,
            chunkIndex:
              typeof source.chunkIndex === 'number' ||
              typeof source.chunkIndex === 'string'
                ? source.chunkIndex
                : null,
            excerpt: typeof source.excerpt === 'string' ? source.excerpt : null,
            confidence:
              typeof source.confidence === 'number'
                ? source.confidence
                : null,
            firstSeenAt:
              typeof source.firstSeenAt === 'string'
                ? source.firstSeenAt
                : null,
            lastSeenAt:
              typeof source.lastSeenAt === 'string'
                ? source.lastSeenAt
                : null,
            supersededAt:
              typeof source.supersededAt === 'string'
                ? source.supersededAt
                : null,
            status: stringValue(source.status, 'active'),
          }))
        : [];

      return {
        nodeId: stringValue(payload.nodeId, selectedNodeId),
        total: Number(payload.total ?? sources.length),
        sources,
      };
    },
    enabled: Boolean(selectedNodeId),
    retry: 0,
  });
  const selectedProperties = isRecord(selectedNode?.properties)
    ? Object.entries(selectedNode.properties).slice(0, 8)
    : [];

  const connectedNodeName = (edge: GraphEdge) => {
    const relatedId =
      edge.sourceId === selectedNode?.id
        ? edge.targetId
        : edge.sourceId;

    return nodeById.get(relatedId)?.name ?? 'Unknown node';
  };

  const connectedEntityCount = nodes.filter(
    (node) => (degreeById.get(node.id) ?? 0) > 0,
  ).length;

  return (
    <div className="mx-auto max-w-[1800px] space-y-6">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-3">
            <Network className="h-6 w-6 text-indigo-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">
              Knowledge Graph
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Explore relationships across your organisation.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isFetching ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Sync from documents
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Total nodes
          </p>

          <p className="mt-1 text-2xl font-bold tabular-nums">
            {isLoading ? 'Ã¢â‚¬â€' : nodes.length}
          </p>

          <p className="text-xs text-muted-foreground">
            Knowledge entities
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Relationships
          </p>

          <p className="mt-1 text-2xl font-bold tabular-nums">
            {isLoading ? 'Ã¢â‚¬â€' : relations.length}
          </p>

          <p className="text-xs text-muted-foreground">
            Recorded connections
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Entity types
          </p>

          <p className="mt-1 text-2xl font-bold tabular-nums">
            {isLoading ? 'Ã¢â‚¬â€' : nodeTypes.length}
          </p>

          <p className="text-xs text-muted-foreground">
            Categories in your graph
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Connected entities
          </p>

          <p className="mt-1 text-2xl font-bold tabular-nums">
            {isLoading ? 'Ã¢â‚¬â€' : connectedEntityCount}
          </p>

          <p className="text-xs text-muted-foreground">
            Nodes with relationships
          </p>
        </div>
      </div>

      {/* Knowledge intelligence analytics */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-brand-500/10 p-2.5 text-brand-500">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-500">
                Intelligence metrics
              </p>
              <h2 className="mt-0.5 text-lg font-semibold">
                Knowledge health
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void analyticsQuery.refetch()}
            disabled={analyticsQuery.isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${analyticsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh analytics
          </button>
        </div>

        {analyticsQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-xl bg-muted/60"
              />
            ))}
          </div>
        ) : analyticsQuery.isError ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
            <p className="text-sm font-medium text-rose-600">
              Knowledge analytics unavailable
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {analyticsQuery.error.message}
            </p>
            <button
              type="button"
              onClick={() => void analyticsQuery.refetch()}
              className="mt-3 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : analytics ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                {
                  label: 'Indexed documents',
                  value: analytics.indexedDocuments,
                  detail: 'Accessible documents',
                  icon: FileCheck2,
                },
                {
                  label: 'Entities',
                  value: analytics.entities,
                  detail: 'Evidence-supported nodes',
                  icon: Network,
                },
                {
                  label: 'Relationships',
                  value: analytics.relationships,
                  detail: 'Supported connections',
                  icon: GitBranch,
                },
                {
                  label: 'Evidence records',
                  value: analytics.evidenceRecords,
                  detail: `${analytics.activeEvidence} active`,
                  icon: Database,
                },
                {
                  label: 'Extraction coverage',
                  value: `${analytics.extractionCoveragePercent.toFixed(1)}%`,
                  detail: `${analytics.completedExtractions} completed`,
                  icon: Activity,
                },
              ].map((metric) => {
                const MetricIcon = metric.icon;

                return (
                  <div
                    key={metric.label}
                    className="min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {metric.label}
                      </span>
                      <MetricIcon className="h-4 w-4 shrink-0 text-brand-500" />
                    </div>
                    <p className="mt-3 break-words text-2xl font-semibold tabular-nums">
                      {metric.value}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {metric.detail}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Entity distribution
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {analytics.entityAliases} registered aliases
                  </span>
                </div>

                {analytics.entityTypes.length === 0 ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    No evidence-supported entities are available yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {analytics.entityTypes.slice(0, 8).map((item) => {
                      const maxCount = Math.max(
                        1,
                        ...analytics.entityTypes.map((entry) => entry.count),
                      );

                      const width = Math.max(
                        2,
                        (item.count / maxCount) * 100,
                      );

                      return (
                        <div key={item.type}>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-xs capitalize text-muted-foreground">
                              {item.type}
                            </span>
                            <span className="text-xs font-semibold tabular-nums">
                              {item.count}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-brand-500 transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold">
                  Extraction and evidence health
                </h3>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Pending or processing
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {analytics.pendingExtractions}
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Failed extractions
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {analytics.failedExtractions}
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Disputed evidence
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {analytics.disputedEvidence}
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[10px] text-muted-foreground">
                      Superseded evidence
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {analytics.supersededEvidence}
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-medium">
                    Knowledge freshness
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {analytics.evidenceLast7Days}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Observed in 7 days
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {analytics.evidenceLast30Days}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Observed in 30 days
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="flex items-start gap-2 text-[10px] leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Metrics reflect evidence and documents accessible to the current account. Extraction coverage measures completed extraction runs against accessible indexed documents; it does not measure factual correctness.
            </p>
          </>
        ) : null}
      </section>
      <KnowledgeConflictPanel />

      {/* Search and filtering */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people, projects, documents or goalsÃ¢â‚¬Â¦"
              aria-label="Search graph nodes"
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />

            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />

            <select
              aria-label="Filter by entity type"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setSelectedNodeId(null);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500 sm:w-56"
            >
              <option value="all">All entity types</option>

              {nodeTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs text-muted-foreground">
            Filter:
          </span>

          {nodeTypes.map((type) => (
            <button
              type="button"
              key={type}
              onClick={() => {
                setTypeFilter(
                  typeFilter === type ? 'all' : type,
                );
                setSelectedNodeId(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${
                typeFilter === type
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: getNodeColor(type),
                }}
              />
              {type}
            </button>
          ))}
        </div>
      </section>

      {/* Graph content */}
      {isLoading ? (
        <div className="flex min-h-[500px] items-center justify-center rounded-xl border border-border bg-card">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />
            <p className="mt-3 text-sm text-muted-foreground">
              Loading your knowledge graphÃ¢â‚¬Â¦
            </p>
          </div>
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-card p-6"
        >
          <h2 className="font-semibold">
            Could not load the Knowledge Graph
          </h2>

          <p className="mt-2 text-sm text-red-500">
            {getErrorMessage(
              error,
              'The graph API request failed.',
            )}
          </p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Network className="mx-auto h-12 w-12 text-muted-foreground/40" />

          <h2 className="mt-4 font-semibold">
            No knowledge nodes found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            No graph nodes were returned for the current organisation.
            Check the active account or sync your documents if appropriate.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Network canvas */}
          <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-semibold">
                  Entity network
                </h2>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  {visibleNodes.length} nodes Ã‚Â· {visibleRelations.length}{' '}
                  relationships
                </p>
              </div>

              <span className="text-xs text-muted-foreground">
                Select a node to inspect its connections
              </span>
            </div>

            {visibleNodes.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                No nodes match the selected entity type.
              </div>
            ) : (
              <div className="overflow-auto">
                <svg
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  role="img"
                  aria-label="Interactive network diagram of knowledge nodes and their relationships"
                  className="block h-auto w-full min-w-[1260px]"
                >
                  <defs>
                    <marker
                      id="knowledge-graph-arrow"
                      markerWidth="7"
                      markerHeight="7"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path
                        d="M0,0 L6,3 L0,6 Z"
                        fill="#64748b"
                      />
                    </marker>

                    <radialGradient id="knowledge-graph-glow">
                      <stop
                        offset="0%"
                        stopColor="#64748b"
                        stopOpacity="0.07"
                      />
                      <stop
                        offset="100%"
                        stopColor="#64748b"
                        stopOpacity="0"
                      />
                    </radialGradient>
                  </defs>

                  <rect
                    width={WIDTH}
                    height={HEIGHT}
                    fill="url(#knowledge-graph-glow)"
                  />

                  {/* Draw connections first, behind the nodes. */}
                  <g>
                    {visibleRelations.map((edge) => {
                      const source = positionById.get(
                        edge.sourceId,
                      );
                      const target = positionById.get(
                        edge.targetId,
                      );

                      if (!source || !target) return null;

                      const touchesSelected =
                        selectedNodeId === edge.sourceId ||
                        selectedNodeId === edge.targetId;

                      const touchesSearchMatch =
                        matchingIds.has(edge.sourceId) ||
                        matchingIds.has(edge.targetId);

                      const opacity = selectedNodeId
                        ? touchesSelected
                          ? 0.88
                          : 0.07
                        : hasSearch
                          ? touchesSearchMatch
                            ? 0.7
                            : 0.06
                          : 0.2;

                      const midX = (source.x + target.x) / 2;
                      const midY = (source.y + target.y) / 2;

                      return (
                        <g key={edge.id}>
                          <line
                            x1={source.x}
                            y1={source.y}
                            x2={target.x}
                            y2={target.y}
                            stroke="#64748b"
                            strokeOpacity={opacity}
                            strokeWidth={touchesSelected ? 2 : 0.9}
                            markerEnd="url(#knowledge-graph-arrow)"
                          />

                          <title>
                            {nodeById.get(edge.sourceId)?.name ??
                              edge.sourceId}{' '}
                            Ã¢â‚¬â€ {edge.relationship} Ã¢â€ â€™{' '}
                            {nodeById.get(edge.targetId)?.name ??
                              edge.targetId}
                          </title>

                          {touchesSelected && (
                            <text
                              x={midX}
                              y={midY - 6}
                              textAnchor="middle"
                              fontSize="11"
                              fill="currentColor"
                              className="pointer-events-none"
                            >
                              {readableRelationship(
                                edge.relationship,
                              ).slice(0, 24)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* Nodes and shortened labels. */}
                  <g>
                    {visibleNodes.map((node) => {
                      const position = positionById.get(node.id);

                      if (!position) return null;

                      const color = getNodeColor(node.type);
                      const degree =
                        degreeById.get(node.id) ?? 0;

                      const radius = Math.min(
                        12,
                        6.5 + Math.sqrt(degree) * 1.1,
                      );

                      const isSelected =
                        selectedNodeId === node.id;

                      const isSearchMatch =
                        matchingIds.has(node.id);

                      const connectedToSelected =
                        selectedNodeId !== null &&
                        visibleRelations.some(
                          (edge) =>
                            (edge.sourceId === selectedNodeId &&
                              edge.targetId === node.id) ||
                            (edge.targetId === selectedNodeId &&
                              edge.sourceId === node.id),
                        );

                      const opacity = isSelected
                        ? 1
                        : hasSearch
                          ? isSearchMatch
                            ? 1
                            : 0.2
                          : selectedNodeId
                            ? connectedToSelected
                              ? 1
                              : 0.3
                            : 1;

                      const label =
                        node.name.length > 20
                          ? `${node.name.slice(0, 18)}Ã¢â‚¬Â¦`
                          : node.name;

                      const labelOnRight =
                        position.x < WIDTH / 2;

                      const labelX = labelOnRight
                        ? position.x + radius + 8
                        : position.x - radius - 8;

                      return (
                        <g
                          key={node.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${node.name}, ${node.type}, ${degree} connections`}
                          aria-pressed={isSelected}
                          onClick={() =>
                            setSelectedNodeId(node.id)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              setSelectedNodeId(node.id);
                            }
                          }}
                          style={{
                            cursor: 'pointer',
                            opacity,
                            transition: 'opacity 160ms ease',
                            outline: 'none',
                          }}
                        >
                          {isSelected && (
                            <circle
                              cx={position.x}
                              cy={position.y}
                              r={radius + 7}
                              fill={color}
                              fillOpacity="0.12"
                              stroke={color}
                              strokeWidth="1.5"
                            />
                          )}

                          {isSearchMatch && hasSearch && (
                            <circle
                              cx={position.x}
                              cy={position.y}
                              r={radius + 4}
                              fill="none"
                              stroke={color}
                              strokeOpacity="0.7"
                              strokeWidth="1.5"
                            />
                          )}

                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={radius}
                            fill={color}
                            stroke={isSelected ? '#ffffff' : color}
                            strokeWidth={isSelected ? 2 : 0.5}
                          />

                          <text
                            x={labelX}
                            y={position.y + 4}
                            textAnchor={
                              labelOnRight ? 'start' : 'end'
                            }
                            fontSize="12"
                            fontWeight={isSelected ? 700 : 500}
                            fill="currentColor"
                            className="pointer-events-none select-none"
                          >
                            {label}
                          </text>

                          <title>
                            {node.name} ({node.type}) Ã¢â‚¬â€ {degree}{' '}
                            connections
                            {node.description
                              ? ` Ã¢â‚¬â€ ${node.description}`
                              : ''}
                          </title>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Arrows show relationship direction.
              </p>

              {hasSearch && (
                <p className="text-xs text-muted-foreground">
                  {matchingIds.size} matching node
                  {matchingIds.size === 1 ? '' : 's'} highlighted
                </p>
              )}
            </div>
          </section>

          {/* Selected-node inspector */}
          <aside className="min-w-0 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">Node details</h2>

              {selectedNode && (
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="Clear selected node"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {!selectedNode ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Network className="h-6 w-6 text-muted-foreground" />
                </div>

                <p className="mt-3 text-sm font-medium">
                  Select a node
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  View its description, metadata and connected entities.
                </p>
              </div>
            ) : (
              <div className="space-y-5 p-4">
                <div>
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: getNodeColor(
                          selectedNode.type,
                        ),
                      }}
                    />

                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {selectedNode.name}
                      </h3>

                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {selectedNode.type}
                      </p>
                    </div>
                  </div>

                  {selectedNode.description ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                      {selectedNode.description}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm italic text-muted-foreground">
                      No description has been recorded.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      Connections
                    </p>

                    <p className="mt-1 text-xl font-semibold">
                      {selectedRelations.length}
                    </p>
                  </div>

                  <div className="rounded-lg bg-muted/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      Entity type
                    </p>

                    <p className="mt-1 break-words text-sm font-semibold capitalize">
                      {selectedNode.type}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    Relationships
                  </h3>

                  {selectedRelations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This node has no recorded relationships.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRelations.slice(0, 20).map((edge) => {
                        const relatedId =
                          edge.sourceId === selectedNode.id
                            ? edge.targetId
                            : edge.sourceId;

                        const isOutgoing =
                          edge.sourceId === selectedNode.id;

                        const relatedNode = nodeById.get(relatedId);

                        return (
                          <button
                            type="button"
                            key={edge.id}
                            onClick={() => {
                              setTypeFilter('all');
                              setSelectedNodeId(relatedId);
                            }}
                            className="w-full rounded-lg border border-border p-3 text-left transition hover:bg-muted/60"
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-medium">
                                  {relatedNode?.name ?? relatedId}
                                </span>

                                <span className="mt-1 block text-xs capitalize text-muted-foreground">
                                  {isOutgoing
                                    ? `Outgoing Ã‚Â· ${readableRelationship(edge.relationship)}`
                                    : `Incoming Ã‚Â· ${readableRelationship(edge.relationship)}`}
                                </span>
                              </span>

                              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            </span>
                          </button>
                        );
                      })}

                      {selectedRelations.length > 20 && (
                        <p className="text-xs text-muted-foreground">
                          Showing 20 of {selectedRelations.length}{' '}
                          relationships.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      Evidence & Sources
                    </h3>

                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {evidenceQuery.data?.total ?? 0} records
                    </span>
                  </div>

                  {evidenceQuery.isLoading ? (
                    <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                      Loading supporting evidence...
                    </div>
                  ) : evidenceQuery.isError ? (
                    <div className="rounded-lg border border-red-500/30 p-4 text-sm text-red-500">
                      Could not retrieve evidence:
                      {' '}
                      {evidenceQuery.error.message}
                    </div>
                  ) : evidenceQuery.data?.sources.length ? (
                    <div className="space-y-3">
                      {evidenceQuery.data.sources.map((source, index) => (
                        <article
                          key={`${source.documentId}-${source.chunkId ?? index}-${source.relationship ?? ''}`}
                          className="rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium">
                                {source.documentName}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {source.documentType || 'Document'}
                                {source.chunkIndex !== null &&
                                source.chunkIndex !== undefined
                                  ? ` · Chunk ${source.chunkIndex}`
                                  : ''}
                              </p>
                            </div>

                            {source.relationship && (
                              <span className="shrink-0 rounded-md bg-brand-500/10 px-2 py-1 text-xs text-brand-500">
                                {readableRelationship(source.relationship)}
                              </span>
                            )}
                          </div>

                          {source.excerpt ? (
                            <blockquote className="mt-3 border-l-2 border-brand-500/50 pl-3 text-sm leading-6 text-muted-foreground">
                              {source.excerpt}
                            </blockquote>
                          ) : (
                            <p className="mt-3 text-xs italic text-muted-foreground">
                              Source document identified; no matching chunk excerpt was retained.
                            </p>
                          )}

                          {source.evidenceType && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Evidence: {readableRelationship(source.evidenceType)}
                            </p>
                          )}

                          <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-muted-foreground">
                                Evidence status
                              </span>

                              <span
                                className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                                  source.status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : source.status === 'disputed'
                                      ? 'bg-amber-500/10 text-amber-600'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {source.status ?? 'active'}
                              </span>
                            </div>

                            <p className="text-xs text-muted-foreground">
                              First observed: {formatEvidenceDate(source.firstSeenAt)}
                            </p>

                            <p className="text-xs text-muted-foreground">
                              Last observed: {formatEvidenceDate(source.lastSeenAt)}
                            </p>

                            {source.supersededAt && (
                              <p className="text-xs text-amber-600">
                                Superseded: {formatEvidenceDate(source.supersededAt)}
                              </p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No supporting document excerpts have been recorded for this node yet.
                      Re-index its source document to generate evidence.
                    </div>
                  )}
                </section>
                {typeof selectedNode.source_type === 'string' &&
                  selectedNode.source_type && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">
                        Source
                      </h3>

                      <p className="text-sm capitalize text-muted-foreground">
                        {selectedNode.source_type}
                      </p>
                    </div>
                  )}

                {selectedProperties.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Metadata
                    </h3>

                    <dl className="space-y-2">
                      {selectedProperties.map(([key, value]) => (
                        <div
                          key={key}
                          className="flex flex-col gap-1 border-b border-border/60 pb-2"
                        >
                          <dt className="text-xs capitalize text-muted-foreground">
                            {key.replace(/[_-]+/g, ' ')}
                          </dt>

                          <dd className="break-words text-sm">
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value ?? 'Ã¢â‚¬â€')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Node ID
                  </h3>

                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {selectedNode.id}
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
