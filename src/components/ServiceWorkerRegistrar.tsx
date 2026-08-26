'use client';

/**
 * Registers the PWA service worker (public/sw.js) in production builds.
 * Skipped in dev so hot reload never fights a stale cache.
 */
import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure just means no offline cache — never block the app.
    });
  }, []);

  return null;
}
