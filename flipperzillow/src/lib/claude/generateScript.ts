import Anthropic from '@anthropic-ai/sdk';

interface PropertySummary {
  room_count: number;
  room_types: Record<string, number>;
  rooms: Array<{
    room_type: string;
    detected_objects: string[];
    layout: {
      has_window: boolean;
      has_door: boolean;
      natural_light: string;
      floor_coverage_pct: number;
      ceiling_coverage_pct: number;
      wall_coverage_pct: number;
      spaciousness: string;
    };
  }>;
}

export async function generateScript(summary: PropertySummary): Promise<{ script: string; word_count: number }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an enthusiastic real estate agent giving a spoken tour introduction for a property listing.

Lead with these two things first, in this order:
1. The listing price — state it prominently and positively (e.g. "Listed at $X, this home is an exceptional value"). If no price is in the data, skip it.
2. The total room count and breakdown by type (e.g. "This beautiful home features X rooms including Y bedrooms, Z bathrooms..."). Derive from room_count and room_type_counts; skip any room type with count zero.

Then, using only facts present in the property data, describe the home in a warm, positive, and inviting tone. Highlight spaciousness, natural light, and any detected highlights. Do not invent features not present in the data, but frame everything optimistically.

Keep the narration natural, spoken, and between 100–200 words. Single flowing paragraph.

IMPORTANT: Return ONLY plain text. No markdown. No asterisks, dashes, bold, italics, or any formatting. Just the spoken words exactly as they should be read aloud.

Property Data:
${JSON.stringify(summary, null, 2)}`,
      },
    ],
  });

  const script = response.content[0].type === 'text' ? response.content[0].text : '';
  const word_count = script.split(/\s+/).filter(Boolean).length;

  return { script, word_count };
}
