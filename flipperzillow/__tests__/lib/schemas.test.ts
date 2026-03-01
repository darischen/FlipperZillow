import { describe, it, expect } from 'vitest';

// We dynamically import the schemas since they may not exist yet during parallel development.
// Each test suite wraps in a try/catch for resilience.

describe('RoomAnalysisSchema', () => {
  it('validates a valid kitchen room', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const validKitchen = {
      room_type: 'kitchen',
      description: 'A modern kitchen with granite countertops and stainless steel appliances.',
      highlights: ['Granite countertops', 'Stainless steel appliances', 'Island seating'],
      drawbacks: ['Limited cabinet space'],
      estimated_sq_ft: 250,
      natural_light: 'high',
      condition: 'excellent',
    };

    const result = RoomAnalysisSchema.safeParse(validKitchen);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.room_type).toBe('kitchen');
      expect(result.data.highlights).toHaveLength(3);
      expect(result.data.estimated_sq_ft).toBe(250);
    }
  });

  it('validates a valid bedroom with null sq_ft', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const validBedroom = {
      room_type: 'bedroom',
      description: 'Spacious master bedroom with walk-in closet.',
      highlights: ['Walk-in closet', 'En-suite bathroom'],
      drawbacks: ['No ceiling fan'],
      estimated_sq_ft: null,
      natural_light: 'medium',
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(validBedroom);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.room_type).toBe('bedroom');
      expect(result.data.estimated_sq_ft).toBeNull();
    }
  });

  it('validates a valid bathroom', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const validBathroom = {
      room_type: 'bathroom',
      description: 'Updated bathroom with dual vanity.',
      highlights: ['Dual vanity', 'Heated floors'],
      drawbacks: ['Small shower'],
      estimated_sq_ft: 80,
      natural_light: 'low',
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(validBathroom);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.room_type).toBe('bathroom');
    }
  });

  it('validates all room_type enum values', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const roomTypes = ['kitchen', 'bedroom', 'bathroom', 'living_room', 'dining_room', 'other'];

    for (const roomType of roomTypes) {
      const room = {
        room_type: roomType,
        description: `A ${roomType} room.`,
        highlights: [],
        drawbacks: [],
        estimated_sq_ft: null,
        natural_light: 'medium',
        condition: 'fair',
      };

      const result = RoomAnalysisSchema.safeParse(room);
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing room_type', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      description: 'A room without a type.',
      highlights: ['Nice'],
      drawbacks: [],
      estimated_sq_ft: 100,
      natural_light: 'high',
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid room_type value', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      room_type: 'garage',
      description: 'A garage.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: 400,
      natural_light: 'low',
      condition: 'fair',
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid natural_light value', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: 200,
      natural_light: 'bright', // invalid: must be low/medium/high
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid condition value', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      room_type: 'bedroom',
      description: 'A bedroom.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: null,
      natural_light: 'medium',
      condition: 'amazing', // invalid: must be poor/fair/good/excellent
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts empty highlights array', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const room = {
      room_type: 'other',
      description: 'A utility closet.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: 20,
      natural_light: 'low',
      condition: 'fair',
    };

    const result = RoomAnalysisSchema.safeParse(room);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    // Missing description
    const missingDescription = {
      room_type: 'kitchen',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: null,
      natural_light: 'low',
      condition: 'fair',
    };
    expect(RoomAnalysisSchema.safeParse(missingDescription).success).toBe(false);

    // Missing highlights
    const missingHighlights = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      drawbacks: [],
      estimated_sq_ft: null,
      natural_light: 'low',
      condition: 'fair',
    };
    expect(RoomAnalysisSchema.safeParse(missingHighlights).success).toBe(false);

    // Missing drawbacks
    const missingDrawbacks = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [],
      estimated_sq_ft: null,
      natural_light: 'low',
      condition: 'fair',
    };
    expect(RoomAnalysisSchema.safeParse(missingDrawbacks).success).toBe(false);

    // Missing natural_light
    const missingNaturalLight = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: null,
      condition: 'fair',
    };
    expect(RoomAnalysisSchema.safeParse(missingNaturalLight).success).toBe(false);

    // Missing condition
    const missingCondition = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: null,
      natural_light: 'low',
    };
    expect(RoomAnalysisSchema.safeParse(missingCondition).success).toBe(false);
  });

  it('rejects non-string values in highlights array', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [123, true], // should be strings
      drawbacks: [],
      estimated_sq_ft: null,
      natural_light: 'high',
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-number estimated_sq_ft (other than null)', async () => {
    const { RoomAnalysisSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      room_type: 'kitchen',
      description: 'A kitchen.',
      highlights: [],
      drawbacks: [],
      estimated_sq_ft: 'large', // should be number or null
      natural_light: 'high',
      condition: 'good',
    };

    const result = RoomAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('TourStartResponseSchema', () => {
  it('validates a valid response', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const validResponse = {
      success: true,
      lat: 37.7749,
      lng: -122.4194,
      formattedAddress: '123 Test St, San Francisco, CA 94102',
    };

    const result = TourStartResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.lat).toBe(37.7749);
      expect(result.data.lng).toBe(-122.4194);
      expect(result.data.formattedAddress).toBe('123 Test St, San Francisco, CA 94102');
    }
  });

  it('rejects response missing lat', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      success: true,
      lng: -122.4194,
      formattedAddress: '123 Test St',
    };

    const result = TourStartResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects response missing lng', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      success: true,
      lat: 37.7749,
      formattedAddress: '123 Test St',
    };

    const result = TourStartResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects response missing formattedAddress', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      success: true,
      lat: 37.7749,
      lng: -122.4194,
    };

    const result = TourStartResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects response missing success', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const invalid = {
      lat: 37.7749,
      lng: -122.4194,
      formattedAddress: '123 Test St',
    };

    const result = TourStartResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects wrong types', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const wrongTypes = {
      success: 'true', // should be boolean
      lat: '37.7749', // should be number
      lng: -122.4194,
      formattedAddress: 123, // should be string
    };

    const result = TourStartResponseSchema.safeParse(wrongTypes);
    expect(result.success).toBe(false);
  });

  it('validates response with success: false', async () => {
    const { TourStartResponseSchema } = await import('@/lib/schemas/roomAnalysis');

    const failedResponse = {
      success: false,
      lat: 0,
      lng: 0,
      formattedAddress: '',
    };

    const result = TourStartResponseSchema.safeParse(failedResponse);
    expect(result.success).toBe(true);
  });
});
