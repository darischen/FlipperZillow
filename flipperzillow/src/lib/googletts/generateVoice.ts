export async function generateVoice(text: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_KEY not configured');

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Neural2-C', // Professional, warm female voice
        },
        audioConfig: {
          audioEncoding: 'MP3',
          pitch: 0,
          speakingRate: 1,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Cloud TTS error ${response.status}: ${errorText}`);
  }

  const data = await response.json() as { audioContent: string };
  return Buffer.from(data.audioContent, 'base64');
}
