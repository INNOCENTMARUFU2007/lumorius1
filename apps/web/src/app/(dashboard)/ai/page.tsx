'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Plus, Bot, User, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function AiPage() {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations } = useQuery({
    queryKey: ['ai', 'conversations'],
    queryFn: async () => {
      const res = await api.get('/ai/conversations');
      return res.data.data as Array<{ id: string; title?: string; updated_at: string }>;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post('/ai/chat', { message, conversationId: activeConvId });
      return res.data.data;
    },
    onSuccess: (data) => {
      if (!activeConvId) setActiveConvId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.response,
          created_at: new Date().toISOString(),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    },
    onError: () => toast.error('Failed to send message. Check your AI provider settings.'),
  });

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: msg, created_at: new Date().toISOString() },
    ]);
    await sendMutation.mutateAsync(msg);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNew = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] max-w-5xl mx-auto gap-4">
      {/* Sidebar */}
      <div className="w-56 flex flex-col gap-2 shrink-0">
        <button
          onClick={startNew}
          className="flex items-center gap-2 px-3 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConvId(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                activeConvId === c.id ? 'bg-brand-500/10 text-brand-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <p className="truncate">{c.title ?? 'New conversation'}</p>
              <p className="text-xs opacity-60 mt-0.5">{formatRelative(c.updated_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 p-4 border-b border-border">
          <div className="p-1.5 bg-brand-500/10 rounded-lg">
            <Sparkles className="w-4 h-4 text-brand-500" />
          </div>
          <div>
            <p className="font-semibold text-sm">AI Strategy Advisor</p>
            <p className="text-xs text-muted-foreground">Powered by Lumorius AI</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-16 h-16 bg-brand-500/10 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-brand-500" />
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">How can I help your business?</p>
                <p className="text-sm text-muted-foreground mt-1">Ask me about strategy, risks, opportunities, or anything about your company.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-sm mt-2">
                {[
                  'What should I focus on today?',
                  'What are our biggest risks?',
                  'Suggest growth opportunities',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-brand-500' : 'bg-muted'
                }`}>
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-foreground" />
                  )}
                </div>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-tr-sm'
                    : 'bg-muted text-foreground rounded-tl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {sendMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 bg-muted rounded-2xl rounded-tl-sm">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask anything about your business…"
              className="flex-1 px-4 py-2.5 text-sm bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="px-4 py-2.5 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
