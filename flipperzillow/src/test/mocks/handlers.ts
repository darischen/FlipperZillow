import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/tour/start', async ({ request }) => {
    const body = (await request.json()) as { address?: string };

    if (!body.address || body.address.trim() === '') {
      return HttpResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    return HttpResponse.json({
      success: true,
      lat: 37.7749,
      lng: -122.4194,
      formattedAddress: '123 Test St, San Francisco, CA 94102',
    });
  }),
];
