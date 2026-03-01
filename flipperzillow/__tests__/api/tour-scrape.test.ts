import { POST } from '@/app/api/tour/scrape/route';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/tour/scrape
 * Phase 2 test criteria:
 * 1. Returns ≥5 image URLs for valid address
 * 2. Returns correct JSON structure
 * 3. Handles missing/empty address validation
 * 4. Proxies to Python backend correctly
 */

// Mock the fetch function
global.fetch = jest.fn();

describe('/api/tour/scrape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PYTHON_BACKEND_URL = 'http://localhost:8000';
  });

  describe('POST request handling', () => {
    it('should validate address field is required', async () => {
      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    it('should reject empty address', async () => {
      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: '' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    it('should return 500 if PYTHON_BACKEND_URL is not configured', async () => {
      delete process.env.PYTHON_BACKEND_URL;

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Test Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('configuration');
    });
  });

  describe('Successful scrape response', () => {
    it('should return images with correct structure', async () => {
      const mockImages = [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg',
        'https://example.com/img3.jpg',
        'https://example.com/img4.jpg',
        'https://example.com/img5.jpg',
        'https://example.com/img6.jpg',
        'https://example.com/img7.jpg',
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: 'Test Address',
          images: mockImages,
          count: mockImages.length,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Test Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('images');
      expect(data).toHaveProperty('count');
      expect(Array.isArray(data.images)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(5);
    });

    it('should return at least 5 images', async () => {
      const mockImages = Array.from({ length: 8 }, (_, i) =>
        `https://example.com/img${i + 1}.jpg`
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: 'Valid Address',
          images: mockImages,
          count: mockImages.length,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Valid Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.count).toBeGreaterThanOrEqual(5);
      expect(data.images.length).toBe(8);
    });

    it('should preserve address from response', async () => {
      const testAddress = 'Test Address 123';
      const mockImages = ['https://example.com/img1.jpg'];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: testAddress,
          images: mockImages,
          count: 1,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: testAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.address).toBe(testAddress);
    });
  });

  describe('Error handling', () => {
    it('should handle backend errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Listing not found' }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Nonexistent Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    it('should return 404 if no images found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: 'Test Address',
          images: [],
          count: 0,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Test Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Test Address' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
    });
  });

  describe('Proxy behavior', () => {
    it('should call Python backend with correct URL', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: 'Test',
          images: ['url1'],
          count: 1,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: 'Test Address' }),
      });

      await POST(request);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/scrape',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should pass address to backend', async () => {
      const testAddress = 'My Test Address';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          address: testAddress,
          images: ['url1'],
          count: 1,
        }),
      });

      const request = new NextRequest('http://localhost:3000/api/tour/scrape', {
        method: 'POST',
        body: JSON.stringify({ address: testAddress }),
      });

      await POST(request);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ address: testAddress }),
        })
      );
    });
  });
});
