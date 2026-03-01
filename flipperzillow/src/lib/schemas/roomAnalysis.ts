import { z } from 'zod';

export const RoomAnalysisSchema = z.object({
  room_type: z.enum([
    'kitchen',
    'bedroom',
    'bathroom',
    'living_room',
    'dining_room',
    'other',
  ]),
  description: z.string(),
  highlights: z.array(z.string()),
  drawbacks: z.array(z.string()),
  estimated_sq_ft: z.number().nullable(),
  natural_light: z.enum(['low', 'medium', 'high']),
  condition: z.enum(['poor', 'fair', 'good', 'excellent']),
});

export type RoomAnalysis = z.infer<typeof RoomAnalysisSchema>;

export const TourStartResponseSchema = z.object({
  success: z.boolean(),
  lat: z.number(),
  lng: z.number(),
  formattedAddress: z.string(),
});

export type TourStartResponse = z.infer<typeof TourStartResponseSchema>;
