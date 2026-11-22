
'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Bot,
  Copy,
  Search,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  User,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';

interface Conversation {
  id: string;
  title?: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sources?: ChatSource[];
}

interface ChatSource {
  citationId: string;
  sourceType: string;
  title: string;
  excerpt: string;
}

interface ChatResponse {
  conversationId?: string;
  response: string;
  sources: ChatSource[];
}

type DataRecord = Record<string, unknown>;

function isRecord(value: unknown): value is DataRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Supports a direct response as well as common API envelopes:
 * [...]
 * { data: [...] }
 * { data: { data: [...] } }
 */
function unwrapApiResponse(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) {
      return current;
    }

    if (!isRecord(current)) {
      return current;
    }

    if (
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
      continue;
    }

    return current;
  }

  return current;
}

function extractList(
  value: unknown,
  collectionKeys: string[],
  description: string,
): unknown[] {
  const payload = unwrapApiResponse(value);

  if (Array.isArray(payload)) {
    return payload;
  }

  if (isRecord(payload)) {
    for (const key of collectionKeys) {
      if (Array.isArray(payload[key])) {
        return payload[key] as unknown[];
      }
    }
  }

  throw new Error(
    `The ${description} API returned an unexpected response format.`,
  );
}

function normalizeConversations(
  value: unknown,
): Conversation[] {
  const items = extractList(
    value,
    ['conversations', 'items', 'results'],
    'AI conversations',
  );

  return items.filter(
    (item): item is Conversation =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      item.id.length > 0,
  ).map((item) => ({
    id: item.id,
    title:
      typeof item.title === 'string'
        ? item.title
        : undefined,
    updated_at:
      typeof item.updated_at === 'string'
        ? item.updated_at
        : '',
  }));
}

function normalizeMessages(value: unknown): ChatMessage[] {
  const items = extractList(
    value,
    ['messages', 'items', 'results'],
    'conversation messages',
  );

  return items
    .filter(isRecord)
    .filter(
      (item) =>
        item.role === 'user' ||
        item.role === 'assistant',
    )
    .filter(
      (item) => typeof item.content === 'string',
    )
    .map((item, index) => ({
      id:
        typeof item.id === 'string'
          ? item.id
          : `message-${index}-${String(item.created_at ?? '')}`,
      role: item.role as 'user' | 'assistant',
      content: item.content as string,
      created_at:
        typeof item.created_at === 'string'
          ? item.created_at
          : '',
      sources: normalizeSources(item.sources),
    }));
}

function normalizeSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .filter((item) =>
      typeof item.citationId === 'string' &&
      typeof item.sourceType === 'string' &&
      typeof item.title === 'string' &&
      typeof item.excerpt === 'string',
    )
    .map((item) => ({
      citationId: item.citationId as string,
      sourceType: item.sourceType as string,
      title: item.title as string,
      excerpt: item.excerpt as string,
    }));
}

function normalizeChatResponse(
  value: unknown,
): ChatResponse {
  const payload = unwrapApiResponse(value);

  if (!isRecord(payload)) {
    throw new Error(
      'The AI API returned an unexpected chat response.',
    );
  }

  const responseText =
    typeof payload.response === 'string'
      ? payload.response
      : typeof payload.answer === 'string'
        ? payload.answer
        : typeof payload.content === 'string'
          ? payload.content
          : null;

  if (responseText === null) {
    throw new Error(
      'The AI API response did not contain a reply.',
    );
  }

  const conversationId =
    typeof payload.conversationId === 'string'
      ? payload.conversationId
      : typeof payload.conversation_id === 'string'
        ? payload.conversation_id
        : undefined;

  return {
    conversationId,
    response: responseText,
    sources: normalizeSources(payload.sources),
  };
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isRecord(error) && isRecord(error.response)) {
    const body = error.response.data;

    if (isRecord(body)) {
      const message = body.message;

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

function formatConversationDate(value: string): string {
  if (!value) return 'Date unavailable';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return 'Date unavailable';
  }

  return formatRelative(value);
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{token.slice(1, -1)}</code>;
    return token;
  });
}

function StrategyReply({ content }: { content: string }) {
  return <div className="space-y-3 break-words text-sm leading-7">
    {content.split(/^```[^\n]*\n|^```[ \t]*$/gm).map((block, index) => {
      if (index % 2) return <pre key={index} className="overflow-x-auto rounded-xl bg-muted p-3 text-xs leading-6"><code>{block.trimEnd()}</code></pre>;
      return block.trim().split(/\n\s*\n/).filter(Boolean).map((part, paragraph) => {
        const key = index + '-' + paragraph;
        const lines = part.split('\n');
        if (lines.every((line) => /^\s*[-*] /.test(line))) return <ul key={key} className="list-disc space-y-1 pl-5">{lines.map((line, row) => <li key={row}>{renderInline(line.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
        return <div key={key} className="whitespace-pre-wrap">{lines.map((line, row) => /^#{1,6} /.test(line) ? <h3 key={row} className="font-semibold">{renderInline(line.replace(/^#{1,6} /, ''))}</h3> : <p key={row}>{renderInline(line)}</p>)}</div>;
      });
    })}
  </div>;
}

export default function AdvisorChat({ account }: { account: string }) {
  const queryClient = useQueryClient();

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const composer = useRef<HTMLTextAreaElement>(null);

  const [loadingConversationId, setLoadingConversationId] =
    useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const loadSequence = useRef(0);

  // Always return an array or throw a readable error.
  const conversationsQuery = useQuery<
    Conversation[],
    Error
  >({
    queryKey: ['ai', 'conversations', account],

    queryFn: async () => {
      const response = await api.get<unknown>(
        '/ai/conversations',
      );

      return normalizeConversations(response.data);
    },

    retry: 1,
  });

  const conversations = conversationsQuery.data ?? [];
  const visibleConversations = conversations.filter((item) => (item.title ?? 'New conversation').toLowerCase().includes(conversationSearch.trim().toLowerCase()));

  const sendMutation = useMutation<
    ChatResponse,
    Error,
    {
      message: string;
      conversationId: string | null;
    }
  >({
    mutationFn: async (request) => {
      const response = await api.post<unknown>(
        '/ai/chat',
        request,
      );

      return normalizeChatResponse(response.data);
    },

    onSuccess: (data, request) => {
      // Ignore a response belonging to a conversation that is
      // no longer active.
      if (
        request.conversationId &&
        request.conversationId !== activeConversationId
      ) {
        return;
      }

      if (
        !request.conversationId &&
        data.conversationId
      ) {
        setActiveConversationId(data.conversationId);
      }

      setMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString(),
          sources: data.sources,
        },
      ]);

      void queryClient.invalidateQueries({
        queryKey: ['ai', 'conversations', account],
      });
    },

    onError: (error) => {
      toast.error(
        getErrorMessage(
          error,
          'Message could not be sent. Check your AI provider settings.',
        ),
      );
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, sendMutation.isPending]);

  const startNew = () => {
    loadSequence.current += 1;

    setActiveConversationId(null);
    setMessages([]);
    setInput('');
    setLoadingConversationId(null);
    composer.current?.focus();
  };

  const loadConversation = async (
    conversationId: string,
  ) => {
    const sequence = ++loadSequence.current;

    setLoadingConversationId(conversationId);
    setActiveConversationId(conversationId);
    setMessages([]);

    try {
      const response = await api.get<unknown>(
        `/ai/conversations/${conversationId}/messages`,
      );

      const loadedMessages = normalizeMessages(
        response.data,
      );

      if (sequence === loadSequence.current) {
        setMessages(loadedMessages);
      }
    } catch (error) {
      if (sequence === loadSequence.current) {
        toast.error(
          getErrorMessage(
            error,
            'Conversation could not be loaded.',
          ),
        );
      }
    } finally {
      if (sequence === loadSequence.current) {
        setLoadingConversationId(null);
      }
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();

    const message = input.trim();

    if (!message || sendMutation.isPending || loadingConversationId) {
      return;
    }

    setInput('');

    setMessages((previous) => [
      ...previous,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      },
    ]);

    sendMutation.mutate({
      message,
      conversationId: activeConversationId,
    });
  };

  return (
    <div className="grid min-h-[560px] grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Conversation sidebar */}
      <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-card p-3">
        <button
          type="button"
          onClick={startNew}
          disabled={sendMutation.isPending}
          className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} aria-label="Search conversation titles" placeholder="Search chats…" className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-2 text-xs" />
        </label>
        {conversationSearch && !visibleConversations.length && <p className="p-2 text-xs text-muted-foreground">No matching chats.</p>}

        <p className="mb-2 mt-4 px-2 text-xs font-semibold  text-muted-foreground">
          Recent conversations
        </p>

        <div className="flex-1 space-y-1 overflow-y-auto">
          {conversationsQuery.isLoading && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Loading conversations…
            </p>
          )}

          {conversationsQuery.isError && (
            <div className="px-2 py-3">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

                <p>
                  {getErrorMessage(
                    conversationsQuery.error,
                    'Conversation history is unavailable.',
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void conversationsQuery.refetch()
                }
                className="mt-2 inline-flex items-center gap-1 px-1 text-xs font-medium text-brand-500 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          )}

          {visibleConversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() =>
                void loadConversation(conversation.id)
              }
              disabled={sendMutation.isPending}
              className={`w-full rounded-lg px-3 py-2 text-left transition disabled:opacity-50 ${
                activeConversationId === conversation.id
                  ? 'bg-brand-500/10 text-brand-500'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="block truncate text-xs font-medium">
                {conversation.title || 'New conversation'}
              </span>

              <span className="mt-1 block text-xs opacity-70">
                {formatConversationDate(
                  conversation.updated_at,
                )}
              </span>
            </button>
          ))}

          {!conversationsQuery.isLoading &&
            !conversationsQuery.isError &&
            conversations.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No saved conversations yet.
              </p>
            )}
        </div>
      </aside>

      {/* Chat panel */}
      <section className="flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-muted/35 px-4 py-3">
          <span className="rounded-lg bg-brand-500/10 p-2 text-brand-500">
            <MessageSquare className="h-4 w-4" />
          </span>

          <div>
            <h2 className="text-sm font-semibold text-foreground">
              AI Advisor
            </h2>

            <p className="text-xs text-muted-foreground">
              Saved conversations
            </p>
          </div>
        </div>

        <div
          className="mx-auto w-full max-w-4xl flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-7"
          aria-live="polite"
        >
          {messages.length === 0 &&
            !loadingConversationId && (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <span className="rounded-2xl bg-brand-500/10 p-3 text-brand-500">
                  <Bot className="h-7 w-7" />
                </span>

                <p className="mt-3 text-sm font-semibold text-foreground">
                  What are you working on?
                </p>

                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                  Ask about profit, costs, growth, risks or priorities. Answers use your
                  documents, meetings, decisions, tasks and financial records; sources appear beneath each reply.
                </p>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    'What can we do to improve profit?',
                    'Where are we losing money?',
                    'What should I focus on this week?',
                    'What risks should I review?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => { setInput(suggestion); composer.current?.focus(); }}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {loadingConversationId && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading conversation…
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-2.5 ${
                message.role === 'user'
                  ? 'flex-row-reverse'
                  : ''
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  message.role === 'user'
                    ? 'hidden bg-muted text-foreground sm:flex'
                    : 'bg-muted text-foreground'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </span>

              <div className={message.role === 'user' ? 'max-w-[85%] min-w-0' : 'min-w-0 flex-1'}>
                {message.role === 'user'
                  ? <p className="whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6">{message.content}</p>
                  : <StrategyReply content={message.content} />}
                {message.role === 'assistant' && <button type="button" onClick={async () => {
                  try { await navigator.clipboard.writeText(message.content); toast.success('Reply copied'); }
                  catch { toast.error('Could not copy the reply.'); }
                }} className="mt-1 inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground hover:bg-muted"><Copy className="h-3.5 w-3.5" /> Copy</button>}
                {message.role === 'assistant' && Boolean(message.sources?.length) && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold  text-muted-foreground">
                      Evidence
                    </p>
                    {message.sources?.map((source) => (
                      <details key={source.citationId} className="rounded-lg border border-border px-2.5 py-1.5 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          [{source.citationId}] {source.title} · {source.sourceType.replace(/_/g, ' ')}
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap text-foreground">
                          {source.excerpt}
                        </p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sendMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Advisor is responding…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {sendMutation.isError && (
          <p
            role="alert"
            className="border-t border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive"
          >
            {getErrorMessage(sendMutation.error, 'The AI provider could not send a reply. Check the provider and try again.')}
          </p>
        )}

        <form
          onSubmit={submit}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <textarea
            ref={composer}
            maxLength={4000}
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            aria-label="Message the AI Advisor"
            placeholder="Ask about profit, costs, strategy, priorities or risks…"
            className="min-h-11 flex-1 resize-y rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand-500"
          />

          <button
            type="submit"
            disabled={
              !input.trim() ||
              sendMutation.isPending ||
              Boolean(loadingConversationId)
            }
            aria-label="Send message"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </section>
    </div>
  );
}
