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

  http.post('/api/tour/scrape', async ({ request }) => {
    const body = (await request.json()) as { address?: string };

    if (!body.address || body.address.trim() === '') {
      return HttpResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // Return mock image URLs
    const mockImages = [
      'https://photos.zillowstatic.com/p_e/IS3pzjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3qzjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3rzjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3szjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3tzjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3uzjzzzzzzzzz.jpg',
      'https://photos.zillowstatic.com/p_e/IS3vzjzzzzzzzzz.jpg',
    ];

    return HttpResponse.json({
      success: true,
      address: body.address,
      images: mockImages,
      count: mockImages.length,
    });
  }),
];
