import Anthropic from '@anthropic-ai/sdk';
import { nowNPT, type AssistantReply } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { ASSISTANT_TOOLS, runTool, type ToolContext } from './tools.js';

/**
 * Assistant chat (blueprint §4.4, guardrails §7.7). Manual tool loop over the
 * Messages API. Returns 501 NOT_CONFIGURED until LLM_API_KEY is set — the
 * whole module is inert without it.
 */

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
  messages: Anthropic.MessageParam[];
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

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client; // includes the test-injected fake
  if (!config.llmApiKey) {
    throw new AppError('NOT_CONFIGURED', 501, 'The assistant is not configured on this server');
  }
  client = new Anthropic({ apiKey: config.llmApiKey });
  return client;
}

export async function chat(
  sessionId: string,
  message: string,
  ctx: ToolContext,
): Promise<AssistantReply> {
  const anthropic = getClient();
  const session = getSession(sessionId);

  session.messages.push({ role: 'user', content: message });
  // cap history (§7.7) — keep the most recent turns only
  session.messages = session.messages.slice(-MAX_TURNS);

  let bookingId: string | undefined;

  // manual tool loop (§7.7: all tool calls via the same service layer)
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const response = await anthropic.messages.create({
      model: config.llmModel,
      max_tokens: 1024,
      system:
        `${SYSTEM_PROMPT}\n\nToday is ${nowNPT().date} (Nepal Time).` +
        (ctx.userId ? '\nThe user IS logged in.' : '\nThe user is NOT logged in.'),
      // create_booking_draft is only offered to authenticated users (§7.7)
      tools: ctx.userId ? ASSISTANT_TOOLS : ASSISTANT_TOOLS.slice(0, 2),
      messages: [...session.messages], // snapshot — the session array keeps mutating
    });

    session.messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        reply: reply || 'Sorry, I have no answer for that.',
        ...(bookingId && { bookingId }),
      };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const outcome = await runTool(block.name, block.input as Record<string, unknown>, ctx);
      if (outcome.bookingId) bookingId = outcome.bookingId;
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.result,
      });
    }
    session.messages.push({ role: 'user', content: toolResults });
  }

  logger.warn({ sessionId }, 'assistant hit tool-round cap');
  return {
    reply: 'I could not finish that — please try rephrasing.',
    ...(bookingId && { bookingId }),
  };
}

/** Test hook: swap the Anthropic client (never used in production code paths). */
export function _setClientForTests(fake: unknown): void {
  client = fake as Anthropic;
}
