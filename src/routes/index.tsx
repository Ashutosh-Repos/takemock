import { createBrowserRouter, useRouteError } from 'react-router';
import App from '@/App';
import { MainLayout } from '@/components/layout/MainLayout';
import { Builder } from '@/pages/Builder';
import { History } from '@/pages/History';
import { Library } from '@/pages/Library';
import { Result } from '@/pages/Result';
import { Runner } from '@/pages/Runner';

function RootErrorBoundary() {
  const error = useRouteError();
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="mb-2 text-2xl font-bold">Oops! Something went wrong.</h1>
      <p className="text-base-content/70">
        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
      </p>
    </div>
  );
}

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
          {
            index: true,
            Component: Library,
          },
          {
            path: 'builder',
            Component: Builder,
          },
          {
            path: 'history',
            Component: History,
          },
          {
            path: 'result/:attemptId',
            Component: Result,
          },
          {
            path: '*',
            Component: () => (
              <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
                <h2 className="text-3xl font-bold">404 - Page Not Found</h2>
                <p className="text-base-content/60 mt-2">The requested view does not exist.</p>
              </div>
            ),
          },
        ],
      },
    ],
  },
]);
