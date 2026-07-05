'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { Mic, Upload, Clock, CheckCircle, Loader2, ChevronRight, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';

const STATUS_STYLES: Record<string, string> = {
  uploading: 'bg-yellow-100 text-yellow-700',
  transcribing: 'bg-blue-100 text-blue-700',
  analyzing: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function MeetingsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await api.get('/meetings', { params: { pageSize: 50 } });
      return res.data.data;
    },
    refetchInterval: 10000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      if (title) form.append('title', title);
      const res = await api.post('/meetings/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Meeting uploaded — transcription in progress');
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => toast.error('Upload failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/meetings/${id}`),
    onSuccess: () => {
      toast.success('Meeting deleted');
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: useCallback((files: File[]) => files[0] && uploadMutation.mutate(files[0]), [uploadMutation]),
    accept: { 'audio/*': [], 'video/*': [] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-500/10 rounded-xl">
          <Mic className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Meeting Intelligence</h1>
          <p className="text-muted-foreground text-sm">Upload recordings. Get transcripts, summaries, and action items.</p>
        </div>
      </div>

      {/* Upload */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title (optional)"
          className="w-full px-4 py-2.5 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragActive ? 'border-brand-500 bg-brand-500/5' : 'border-border hover:border-brand-400'
          }`}
        >
          <input {...getInputProps()} />
          {uploadMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading recording…</span>
            </div>
          ) : (
            <>
              <Upload className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
              <p className="font-medium text-foreground">Drop audio/video file here</p>
              <p className="text-xs text-muted-foreground mt-1">MP3, MP4, WAV, M4A, WEBM • Max 500MB</p>
            </>
          )}
        </div>
      </div>

      {/* Meetings list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))
        ) : (data?.data ?? []).length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Mic className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No meetings yet. Upload your first recording.</p>
          </div>
        ) : (
          (data?.data ?? []).map((meeting: Record<string, unknown>) => (
            <motion.div
              key={meeting.id as string}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:shadow-sm transition group"
            >
              <div className={`p-2.5 rounded-xl ${
                meeting.status === 'completed' ? 'bg-green-500/10' : 'bg-blue-500/10'
              }`}>
                {meeting.status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Clock className="w-4 h-4 text-blue-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{meeting.title as string}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatRelative(meeting.created_at as string)}
                  {meeting.duration_seconds && ` · ${Math.round(Number(meeting.duration_seconds) / 60)} min`}
                  {meeting.created_by_name && ` · ${meeting.created_by_name as string}`}
                </p>
              </div>
              {meeting.summary && (
                <p className="text-xs text-muted-foreground max-w-48 truncate hidden md:block">
                  {meeting.summary as string}
                </p>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize shrink-0 ${STATUS_STYLES[meeting.status as string] ?? 'bg-muted text-muted-foreground'}`}>
                {meeting.status as string}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <Link
                  href={`/meetings/${meeting.id as string}`}
                  className="p-1.5 rounded-lg hover:bg-muted transition"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
                <button
                  onClick={() => deleteMutation.mutate(meeting.id as string)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
