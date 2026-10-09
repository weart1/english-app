import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdatePrompt } from './UpdatePrompt';
import { Toaster } from '@/components/Toaster';
import { useEditorStore } from '@/store/ui';
import { useSessionUi } from '@/store/session';
import { useActiveSession } from '@/db/queries';
import { ru } from '@/i18n/ru';

const WordEditorHost = lazy(() => import('@/screens/WordEditor'));
const ResumePrompt = lazy(() => import('./ResumePrompt'));

/** Loads the resume dialog (and the animation library behind it) only when there is a session to resume. */
function ResumeGate() {
  const active = useActiveSession();
  const prompted = useSessionUi((s) => s.resumePrompted);
  if (!active || prompted) return null;
  return (
    <Suspense fallback={null}>
      <ResumePrompt />
    </Suspense>
  );
}

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
  // Mount the editor chunk only once it has been opened.
  const editorUsed = useEditorStore((s) => s.nonce > 0);
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
      {editorUsed && (
        <Suspense fallback={null}>
          <WordEditorHost />
        </Suspense>
      )}
      <Toaster />
      <UpdatePrompt />
      <ResumeGate />
    </div>
  );
}
