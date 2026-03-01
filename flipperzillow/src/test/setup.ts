import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { setupGoogleMapsMock } from './mocks/google-maps';
import { server } from './mocks/server';

// Setup Google Maps mock before all tests
beforeAll(() => {
  setupGoogleMapsMock();
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
