
'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import {
  Mic,
  Upload,
  Clock,
  CheckCircle,
  Loader2,
  ChevronRight,
  Trash2,
} from 'lucide-react';
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

interface MeetingRecord {
  id: string;
  title?: string | null;
  status: string;
  created_at: string;
  duration_seconds?: number | string | null;
  created_by_name?: string | null;
  summary?: string | null;
}

interface MeetingsResponse {
  data?: MeetingRecord[];
}

export default function MeetingsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');

  const { data, isLoading, isError } = useQuery<MeetingsResponse>({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await api.get('/meetings', {
        params: { pageSize: 50 },
      });
      return res.data.data as MeetingsResponse;
    },
    refetchInterval: 10000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);

      const meetingTitle = title.trim();
      if (meetingTitle) {
        form.append('title', meetingTitle);
      }

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
    onError: () => {
      toast.error('Upload failed. Check the file and try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/meetings/${id}`),
    onSuccess: () => {
      toast.success('Meeting deleted');
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: () => {
      toast.error('Failed to delete meeting');
    },
  });

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (file) {
        uploadMutation.mutate(file);
      }
    },
    [uploadMutation],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'audio/*': [],
      'video/*': [],
    },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
    disabled: uploadMutation.isPending,
    noClick: true,
  });

  const meetings = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-green-500/10 p-2">
          <Mic className="h-5 w-5 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Meeting Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Upload recordings. Get transcripts, summaries, and action items.
          </p>
        </div>
      </div>

      {/* Upload */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <label htmlFor="meeting-title" className="sr-only">
          Meeting title
        </label>
        <input
          id="meeting-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Meeting title (optional)"
          className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          disabled={uploadMutation.isPending}
        />

        <div
          {...getRootProps()}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-all ${
            uploadMutation.isPending
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer'
          } ${
            isDragActive
              ? 'border-brand-500 bg-brand-500/5'
              : 'border-border hover:border-brand-400'
          }`}
        >
          <input {...getInputProps()} />

          {uploadMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Uploading recording…</span>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
              <p className="font-medium text-foreground">
                {isDragActive
                  ? 'Drop your recording here'
                  : 'Drop an audio/video file here'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                MP3, MP4, WAV, M4A, WEBM · Maximum 500 MB
              </p>
              <button
                type="button"
                onClick={open}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Browse files
              </button>
            </>
          )}
        </div>
      </section>

      {/* Meetings list */}
      <section className="space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl border border-border bg-card"
            />
          ))
        ) : isError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 p-6 text-sm text-destructive"
          >
            Meetings could not be loaded. Please try refreshing the page.
          </div>
        ) : meetings.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Mic className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>No meetings yet. Upload your first recording.</p>
          </div>
        ) : (
          meetings.map((meeting) => {
            const status = meeting.status || 'uploading';
            const duration = Number(meeting.duration_seconds);
            const hasDuration =
              meeting.duration_seconds !== null &&
              meeting.duration_seconds !== undefined &&
              meeting.duration_seconds !== '' &&
              Number.isFinite(duration) &&
              duration >= 0;

            return (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:shadow-sm"
              >
                <div
                  className={`rounded-xl p-2.5 ${
                    status === 'completed'
                      ? 'bg-green-500/10'
                      : 'bg-blue-500/10'
                  }`}
                >
                  {status === 'completed' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-blue-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {meeting.title?.trim() || 'Untitled meeting'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meeting.created_at
                      ? formatRelative(meeting.created_at)
                      : 'Date unavailable'}
                    {hasDuration &&
                      ` · ${Math.round(duration / 60)} min`}
                    {typeof meeting.created_by_name === 'string' &&
                      meeting.created_by_name.trim() &&
                      ` · ${meeting.created_by_name}`}
                  </p>
                </div>

                {typeof meeting.summary === 'string' &&
                  meeting.summary.trim().length > 0 && (
                    <p className="hidden max-w-48 truncate text-xs text-muted-foreground md:block">
                      {meeting.summary}
                    </p>
                  )}

                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_STYLES[status] ??
                    'bg-muted text-muted-foreground'
                  }`}
                >
                  {status}
                </span>

                <div className="flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <Link
                    href={`/meetings/${encodeURIComponent(meeting.id)}`}
                    aria-label={`View ${meeting.title || 'meeting'}`}
                    className="rounded-lg p-1.5 transition hover:bg-muted"
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Delete this meeting permanently?')) {
                        deleteMutation.mutate(meeting.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    aria-label={`Delete ${meeting.title || 'meeting'}`}
                    className="rounded-lg p-1.5 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </section>
    </div>
  );
}
