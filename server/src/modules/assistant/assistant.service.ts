import OpenAI from 'openai';
import { nowNPT, type AssistantReply } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { ASSISTANT_TOOLS, runTool, type ToolContext } from './tools.js';

/**
 * Assistant chat (blueprint §4.4, guardrails §7.7). Manual tool loop over the
 * OpenAI-compatible Chat Completions API — we run it against Groq (free tier).
 * Returns 501 NOT_CONFIGURED until LLM_API_KEY is set — the whole module is
 * inert without it.
 */

// Groq speaks the OpenAI wire format at this base URL.
// ponytail: hardcoded — one const to change if we ever swap providers.
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const SYSTEM_PROMPT = `You are CourtBook's booking assistant for futsal courts in Kathmandu.

You help players find venues, check slot availability, and start bookings. All times are Nepal Time (UTC+5:45); slots are described by their start time.

Rules you must always follow:
- Use the tools for any factual claim about venues, availability or prices — never invent them.
- Only call create_booking_draft after the user explicitly confirms one specific slot.
- You never collect or discuss payment details. After a draft is created, tell the user to complete payment at checkout within 10 minutes.
- You cannot access, reveal or modify any user's bookings or personal data — the tools do not allow it, and you must refuse if asked.
- If the user is not logged in and wants to book, tell them to log in first.
- Keep replies short and friendly; this is a chat widget.`;

interface Session {
  messages: OpenAI.ChatCompletionMessageParam[];
  touchedAt: number;
}

// ponytail: in-process session store — single instance; Redis when scaled (D-6)
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_TURNS = 10; // §7.7: context capped at last 10 messages
const MAX_TOOL_ROUNDS = 5;

function getSession(id: string): Session {
  // opportunistic TTL sweep
  for (const [key, s] of sessions) {
    if (Date.now() - s.touchedAt > SESSION_TTL_MS) sessions.delete(key);
  }
  let session = sessions.get(id);
  if (!session) {
    session = { messages: [], touchedAt: Date.now() };
    sessions.set(id, session);
  }
  session.touchedAt = Date.now();
  return session;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (client) return client; // includes the test-injected fake
  if (!config.llmApiKey) {
    throw new AppError('NOT_CONFIGURED', 501, 'The assistant is not configured on this server');
  }
  client = new OpenAI({ apiKey: config.llmApiKey, baseURL: GROQ_BASE_URL });
  return client;
}

/**
 * Keep the last MAX_TURNS messages, but never start on an orphan `tool` message
 * (its parent assistant tool_calls got sliced off) — Groq/OpenAI 400s on that.
 */
function capHistory(
  messages: OpenAI.ChatCompletionMessageParam[],
): OpenAI.ChatCompletionMessageParam[] {
  const capped = messages.slice(-MAX_TURNS);
  while (capped[0]?.role === 'tool') capped.shift();
  return capped;
}

export async function chat(
  sessionId: string,
  message: string,
  ctx: ToolContext,
): Promise<AssistantReply> {
  const openai = getClient();
  const session = getSession(sessionId);

  session.messages.push({ role: 'user', content: message });
  // cap history (§7.7) — keep the most recent turns only
  session.messages = capHistory(session.messages);

  // OpenAI puts the system prompt in the messages array (not a top-level param).
  const system: OpenAI.ChatCompletionMessageParam = {
    role: 'system',
    content:
      `${SYSTEM_PROMPT}\n\nToday is ${nowNPT().date} (Nepal Time).` +
      (ctx.userId ? '\nThe user IS logged in.' : '\nThe user is NOT logged in.'),
  };

  let bookingId: string | undefined;

  // manual tool loop (§7.7: all tool calls via the same service layer)
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await openai.chat.completions.create({
      model: config.llmModel,
      max_tokens: 1024,
      // create_booking_draft is only offered to authenticated users (§7.7)
      tools: ctx.userId ? ASSISTANT_TOOLS : ASSISTANT_TOOLS.slice(0, 2),
      messages: [system, ...session.messages], // snapshot — session keeps mutating
    });

    const msg = response.choices[0]?.message;
    if (!msg) throw new AppError('LLM_ERROR', 502, 'The assistant returned an empty response');
    session.messages.push(msg);

    if (!msg.tool_calls?.length) {
      return {
        reply: msg.content || 'Sorry, I have no answer for that.',
        ...(bookingId && { bookingId }),
      };
    }

    for (const call of msg.tool_calls) {
      // Groq only emits function tool calls (not OpenAI's "custom" variety).
      if (call.type !== 'function') continue;
      // parse args defensively.
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        input = {};
      }
      const outcome = await runTool(call.function.name, input, ctx);
      if (outcome.bookingId) bookingId = outcome.bookingId;
      session.messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: outcome.result,
      });
    }
  }

  logger.warn({ sessionId }, 'assistant hit tool-round cap');
  return {
    reply: 'I could not finish that — please try rephrasing.',
    ...(bookingId && { bookingId }),
  };
}

/** Test hook: swap the OpenAI client (never used in production code paths). */
export function _setClientForTests(fake: unknown): void {
  client = fake as OpenAI;
}
