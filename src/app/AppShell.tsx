import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { LazyMotion, MotionConfig } from 'motion/react';
import { TabBar } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';
import { UpdatePrompt } from './UpdatePrompt';
import { ResumePrompt } from './ResumePrompt';
import { Toaster } from '@/components/Toaster';
import { useEditorStore } from '@/store/ui';
import { ru } from '@/i18n/ru';

const WordEditorHost = lazy(() => import('@/screens/WordEditor'));
const loadMotionFeatures = () => import('./motionFeatures').then((m) => m.default);

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
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">
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
          <ResumePrompt />
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
