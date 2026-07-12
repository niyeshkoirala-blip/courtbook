import type OpenAI from 'openai';
import { formatNPT, nowNPT } from '@courtbook/shared';
import { AppError } from '../../core/errors.js';
import { Venue } from '../venues/venue.model.js';
import { Court } from '../courts/court.model.js';
import { listVenues } from '../venues/venue.service.js';
import { computeAvailability, getBookableCourt } from '../bookings/availability.js';
import { createBooking } from '../bookings/booking.service.js';

/**
 * Assistant tools (blueprint §4.4/§7.7). Every handler goes through the SAME
 * service layer as the REST API — the LLM has no privileged path. The user
 * context comes from the authenticated request, never from model input, so
 * the model cannot act as someone else no matter what the prompt says.
 */

// OpenAI/Groq function-calling format (Groq is OpenAI-compatible).
export const ASSISTANT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_venues',
      description:
        'Search published futsal venues in Kathmandu. Call this when the user asks where they can play or mentions an area of the city.',
      parameters: {
        type: 'object',
        properties: {
          area: { type: 'string', description: 'Area/neighbourhood, e.g. "Baneshwor". Optional.' },
          priceMax: { type: 'number', description: 'Maximum price per hour in NPR. Optional.' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Get free slots for a venue on a date. Call this when the user asks whether a court is free at some time. Dates are YYYY-MM-DD in Nepal Time.',
      parameters: {
        type: 'object',
        properties: {
          venueSlug: { type: 'string', description: 'Venue slug from search_venues results' },
          date: { type: 'string', description: 'YYYY-MM-DD (Nepal Time)' },
        },
        required: ['venueSlug', 'date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking_draft',
      description:
        'Create a 10-minute booking hold for the logged-in user. Only call after the user explicitly confirms a specific slot. Payment happens at checkout — never collect payment details.',
      parameters: {
        type: 'object',
        properties: {
          courtId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD (Nepal Time)' },
          startMin: { type: 'number', description: 'Slot start, minutes from midnight NPT' },
        },
        required: ['courtId', 'date', 'startMin'],
        additionalProperties: false,
      },
    },
  },
];

export interface ToolContext {
  /** From the authenticated request — the only identity the tools ever use. */
  userId?: string | undefined;
}

/** Executes one tool call; errors come back as strings for the model to relay. */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: string; bookingId?: string }> {
  try {
    switch (name) {
      case 'search_venues': {
        const { venues } = await listVenues({
          area: typeof input.area === 'string' ? input.area : undefined,
          priceMax: typeof input.priceMax === 'number' ? input.priceMax : undefined,
          limit: 5,
        } as Parameters<typeof listVenues>[0]);
        if (venues.length === 0) return { result: 'No published venues matched.' };
        return {
          result: JSON.stringify(venues.map((v) => ({ name: v.name, slug: v.slug, area: v.area }))),
        };
      }

      case 'check_availability': {
        const venue = await Venue.findOne({
          slug: String(input.venueSlug ?? ''),
          status: 'approved',
          deletedAt: null,
        });
        if (!venue) return { result: 'Venue not found.' };
        const courts = await Court.find({ venueId: venue._id, active: true, deletedAt: null });
        const date = String(input.date ?? nowNPT().date);
        const lines: string[] = [];
        for (const court of courts) {
          const [day] = await computeAvailability(court, date, 1);
          const free = (day?.slots ?? []).filter((s) => s.state === 'available');
          lines.push(
            `${court.name} (courtId ${court.id as string}): ${
              free.length === 0
                ? 'no free slots'
                : free
                    .map((s) => `${formatNPT(s.startMin)} (startMin ${s.startMin}, Rs ${s.price})`)
                    .join(', ')
            }`,
          );
        }
        return { result: `${venue.name} on ${date}:\n${lines.join('\n')}` };
      }

      case 'create_booking_draft': {
        // §7.7: drafts require a real authenticated user — no auth, no booking
        if (!ctx.userId) {
          return { result: 'The user is not logged in. Ask them to log in first, then retry.' };
        }
        await getBookableCourt(String(input.courtId ?? ''));
        const { booking } = await createBooking(
          {
            courtId: String(input.courtId),
            date: String(input.date),
            startMin: Number(input.startMin),
          },
          ctx.userId,
        );
        return {
          result: `Draft created: booking ${booking.id}, ${booking.date} ${formatNPT(booking.startMin)}, Rs ${booking.price}. It is held for 10 minutes — the user must pay at checkout to confirm.`,
          bookingId: booking.id,
        };
      }

      default:
        return { result: `Unknown tool ${name}.` };
    }
  } catch (err) {
    // AppErrors (SLOT_TAKEN, SLOT_INVALID…) become plain text the model relays
    const message = err instanceof AppError ? err.message : 'Tool failed unexpectedly.';
    return { result: `Error: ${message}` };
  }
}
