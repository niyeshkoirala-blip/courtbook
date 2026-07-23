import { z } from 'zod';

/** Venue reviews (Phase 13 pulled forward): one review per user per venue. */
export const reviewCreateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export interface ReviewDto {
  id: string;
  userName: string;
  stars: number;
  comment?: string;
  createdAt: string;
}
