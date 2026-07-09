import { z } from 'zod';

/** Assistant chat schema (blueprint §4.4 Assistant). */
export const assistantChatSchema = z.object({
  sessionId: z.string().min(8).max(100),
  message: z.string().trim().min(1).max(1000),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export interface AssistantReply {
  reply: string;
  /** Set when the assistant created a booking draft — SPA links to /book/:id. */
  bookingId?: string;
}
