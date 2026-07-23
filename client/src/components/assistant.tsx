import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssistantReply } from '@courtbook/shared';
import { post, ApiError } from '../lib/api';
import { Button, Spinner } from './ui';

/** Floating AI assistant widget (§3.1 page 14, design/14, guardrails §7.7). */

interface ChatMessage {
  from: 'user' | 'bot';
  text: string;
  bookingId?: string;
}

function sessionId(): string {
  let id = sessionStorage.getItem('courtbook:assistant-session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('courtbook:assistant-session', id);
  }
  return id;
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      from: 'bot',
      text: 'Hi! Ask me things like "any court free in Baneshwor tomorrow evening?"',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text: message }]);
    setBusy(true);
    try {
      const data = await post<AssistantReply>('/assistant/chat', {
        sessionId: sessionId(),
        message,
      });
      setMessages((m) => [
        ...m,
        { from: 'bot', text: data.reply, ...(data.bookingId && { bookingId: data.bookingId }) },
      ]);
    } catch (err) {
      const text =
        err instanceof ApiError && err.code === 'NOT_CONFIGURED'
          ? "I'm not switched on yet — the assistant needs an API key on the server. You can still book through the venue pages!"
          : err instanceof ApiError
            ? err.message
            : 'Something went wrong — try again.';
      setMessages((m) => [...m, { from: 'bot', text }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-accent text-2xl text-white shadow-lg transition-transform hover:scale-105"
      >
        {open ? '✕' : '⚽'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Booking assistant"
          className="fixed bottom-24 right-5 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-card border border-white/10 bg-card shadow-2xl"
        >
          <header className="border-b border-white/10 bg-white/5 px-4 py-3">
            <p className="font-display uppercase tracking-wide text-turf">Court assistant</p>
            <p className="text-xs text-sage">
              Finds venues & free slots — payment stays at checkout
            </p>
          </header>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.from === 'user' ? 'flex justify-end' : 'flex'}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    m.from === 'user' ? 'bg-turf text-paper' : 'bg-white/5 text-ink'
                  }`}
                >
                  {m.text}
                  {m.bookingId && (
                    <Link
                      to={`/book/${m.bookingId}`}
                      className="mt-2 block rounded-full bg-accent px-3 py-1.5 text-center text-xs font-semibold text-white"
                    >
                      Complete checkout →
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {busy && <Spinner className="size-4" />}
          </div>

          <form
            className="flex gap-2 border-t border-white/10 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              aria-label="Message the assistant"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. free courts saturday 7pm"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-sage/60 focus:border-turf/60"
            />
            <Button type="submit" size="sm" disabled={busy || !input.trim()}>
              Send
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
