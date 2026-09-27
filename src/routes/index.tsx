import { createBrowserRouter, Navigate } from 'react-router';
import App from '@/App';
import { MainLayout } from '@/components/layout/MainLayout';
import { RootErrorBoundary } from '@/components/layout/RootErrorBoundary';
import { Analysis } from '@/pages/Analysis';
import { Builder } from '@/pages/Builder';
import { Library } from '@/pages/Library';
import { MistakeVault } from '@/pages/MistakeVault';
import { Practice } from '@/pages/Practice';
import { Result } from '@/pages/Result';
import { Runner } from '@/pages/Runner';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App, // Global theme and context provider
    ErrorBoundary: RootErrorBoundary,
    children: [
      // Immersive CBT Runner (Full Screen, zero distraction)
      {
        path: 'runner/:attemptId',
        Component: Runner,
      },
      // Application Views with Responsive Dock Navigation
      {
        path: '/',
        Component: MainLayout,
        children: [
          // 1. Home / Papers & Tests
          {
            index: true,
            Component: Library,
          },
          {
            path: 'papers',
            Component: Library,
          },
          // 2. Practice (Topic & Freeform Drill Practice)
          {
            path: 'practice',
            Component: Practice,
          },
          {
            path: 'atlas',
            Component: () => <Navigate to="/practice" replace />,
          },
          // 3. Dedicated Builder & Ingest Studio
          {
            path: 'builder',
            Component: Builder,
          },
          // 4. Dedicated Performance Analysis
          {
            path: 'analysis',
            Component: Analysis,
          },
          // 5. Mistake Vault & Error Diary
          {
            path: 'mistakes',
            Component: MistakeVault,
          },
          // Attempt Result & Solution Review
          {
            path: 'result/:attemptId',
            Component: Result,
          },
          // Backward-compatible redirect for history
          {
            path: 'history',
            Component: () => <Navigate to="/analysis" replace />,
          },
          {
            path: '*',
            Component: () => (
              <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
                <h2 className="text-foreground text-3xl font-bold">404 - Page Not Found</h2>
                <p className="text-muted-foreground mt-2">The requested view does not exist.</p>
              </div>
            ),
          },
        ],
      },
    ],
  },
]);
