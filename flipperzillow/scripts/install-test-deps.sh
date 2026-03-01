#!/bin/bash
# Run this after the development agent finishes to install test dependencies
cd "$(dirname "$0")/.."
npm install --save-dev \
  vitest \
  @vitejs/plugin-react \
  jsdom \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  msw \
  playwright \
  @playwright/test
npx playwright install chromium
