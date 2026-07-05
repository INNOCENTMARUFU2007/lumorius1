'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Search, FileText, Trash2, Brain, MessageSquare, X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatBytes, formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

const DOC_ICONS: Record<string, string> = {
  pdf: '📄', docx: '📝', xlsx: '📊', csv: '📊', pptx: '📑', txt: '📃', md: '📋',
};

export default function BrainPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; sources: unknown[] } | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', search],
    queryFn: async () => {
      const res = await api.get('/documents', { params: { search, pageSize: 50 } });
      return res.data.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const results = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/documents/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        results.push(res.data.data);
      }
      return results;
    },
    onSuccess: (docs) => {
      toast.success(`${docs.length} document(s) uploaded and queued for processing`);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: useCallback(
      (files: File[]) => uploadMutation.mutate(files),
      [uploadMutation],
    ),
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
  });

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAskLoading(true);
    try {
      const res = await api.post('/documents/ask', { question });
      setAnswer(res.data.data);
    } catch {
      toast.error('Failed to get answer');
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/10 rounded-xl">
          <Brain className="w-5 h-5 text-purple-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Brain</h1>
          <p className="text-muted-foreground text-sm">Upload documents. Ask questions. Get answers.</p>
        </div>
      </div>

      {/* Upload */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-400 hover:bg-muted/30'
        }`}
      >
        <input {...getInputProps()} />
        {uploadMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Uploading…</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">Drop files here or click to upload</p>
            <p className="text-sm text-muted-foreground mt-1">PDF, DOCX, XLSX, CSV, TXT, MD • Max 100MB per file</p>
          </>
        )}
      </div>

      {/* Ask AI */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-brand-500" />
          <h3 className="font-semibold">Ask Your Documents</h3>
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="What is our refund policy? What were last quarter's revenue numbers?"
            className="flex-1 px-4 py-2.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleAsk}
            disabled={askLoading || !question.trim()}
            className="px-5 py-2.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50 flex items-center gap-2"
          >
            {askLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Ask
          </button>
        </div>

        <AnimatePresence>
          {answer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-4 bg-muted/50 rounded-xl border border-border"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-brand-500">AI Answer</span>
                <button onClick={() => setAnswer(null)}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{answer.answer}</p>
              {(answer.sources as Array<Record<string, unknown>>).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1.5">Sources:</p>
                  <div className="space-y-1">
                    {(answer.sources as Array<Record<string, unknown>>).slice(0, 3).map((s, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        [{i + 1}] {s.documentName as string}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Search + Documents */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{data?.total ?? 0} documents</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {(data?.data ?? []).map((doc: Record<string, unknown>) => (
              <motion.div
                key={doc.id as string}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:shadow-sm transition"
              >
                <span className="text-2xl">{DOC_ICONS[doc.type as string] ?? '📄'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm truncate">{doc.name as string}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.size_bytes as number)} · {formatRelative(doc.created_at as string)}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                  doc.status === 'indexed' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                  : doc.status === 'processing' ? 'bg-blue-100 text-blue-700'
                  : doc.status === 'failed' ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
                }`}>{doc.status as string}</span>
                <span className="text-xs text-muted-foreground">{doc.chunk_count as number} chunks</span>
                <button
                  onClick={() => deleteMutation.mutate(doc.id as string)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
