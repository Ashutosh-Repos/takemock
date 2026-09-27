import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './index.css';
import { RouterProvider } from 'react-router';
import { router } from '@/routes';
import { initializeDatabaseSeed } from '@/core/storage/seed';

// Bootstrap database with starter questions only in local development; production is a clean slate
if (import.meta.env.DEV) {
  initializeDatabaseSeed().catch((err) => {
    console.error('[takemock] Failed to initialize seed data:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
