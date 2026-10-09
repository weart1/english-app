import { useEffect, useState, type ReactNode } from 'react';
import { Database, RotateCcw } from 'lucide-react';
import { db } from '@/db/schema';
import { requestPersistentStorage } from '@/lib/storage';
import { errorMessage, isQuotaError } from '@/lib/errors';
import { toast } from '@/store/toast';
import { ru } from '@/i18n/ru';

/**
 * Opens IndexedDB before rendering the app. If that fails (private mode,
 * storage blocked, quota), show a clear Russian message instead of a white screen.
 */
export function DbGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'opening' | 'ready' | 'failed'>('opening');
  const [message, setMessage] = useState<string>(ru.errors.dbOpen);

  useEffect(() => {
    let alive = true;
    db.open()
      .then(() => {
        if (!alive) return;
        setState('ready');
        // Ask the browser not to evict our data (also re-asked after the first word is added).
        void requestPersistentStorage();
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setMessage(isQuotaError(e) ? ru.errors.quota : ru.errors.dbOpen);
        setState('failed');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Any unhandled async failure (e.g. a write hitting the quota) becomes a toast, never a crash.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      toast.error(errorMessage(e.reason));
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  if (state === 'ready') return <>{children}</>;
  if (state === 'opening') return <div className="app-shell" aria-busy="true" />;
  return (
    <div role="alert" className="app-shell pt-safe pb-safe relative z-[1] flex flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="bg-accent-100 flex size-16 items-center justify-center rounded-full">
        <Database aria-hidden="true" className="text-accent-700 size-8" />
      </div>
      <h1 className="text-title font-semibold">{ru.errors.title}</h1>
      <p className="text-muted max-w-sm">{message}</p>
      <button
        type="button"
        className="bg-primary-500 text-on-primary flex min-h-11 items-center gap-2 rounded-[15px] px-5 font-semibold"
        onClick={() => window.location.reload()}
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {ru.common.reload}
      </button>
    </div>
  );
}
