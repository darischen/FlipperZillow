'use client';

import { useEffect } from 'react';

export default function ConsoleWarningFilter() {
  useEffect(() => {
    const originalWarn = console.warn;
    console.warn = (...args) => {
      if (args[0]?.includes?.('alpha channel') || args[0]?.includes?.('alpha')) {
        return;
      }
      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
