import { useRouteError } from 'react-router';

export function RootErrorBoundary() {
  const error = useRouteError();
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="mb-2 text-2xl font-bold">Oops! Something went wrong.</h1>
      <p className="text-muted-foreground">
        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
      </p>
    </div>
  );
}
