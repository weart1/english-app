import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdatePrompt } from './UpdatePrompt';
import { Toaster } from '@/components/Toaster';
import { ru } from '@/i18n/ru';

export function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status" aria-live="polite">
      <span className="text-muted">{ru.common.loading}</span>
    </div>
  );
}

/**
 * Fixed-height flex column: only the screen's own scroll area scrolls,
 * the tab bar stays pinned above the home indicator.
 */
export function AppShell() {
  const location = useLocation();
  const fullscreen = location.pathname.startsWith('/session');
  return (
    <div className="app-shell relative z-[1] flex flex-col overflow-hidden">
      <main className="relative flex min-h-0 flex-1 flex-col">
        <ErrorBoundary level="screen" resetKey={location.pathname}>
          <Suspense fallback={<ScreenFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      {!fullscreen && <TabBar />}
      <Toaster />
      <UpdatePrompt />
    </div>
  );
}
