import { useLocation } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { GlassPanel } from '@/components/GlassPanel';
import { ru } from '@/i18n/ru';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Service-worker update flow (registerType: 'prompt'). A waiting worker is only
 * activated when the user taps "Обновить", and the toast is hidden during a
 * training session so code is never swapped mid-session.
 */
export function UpdatePrompt() {
  const location = useLocation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          registration.update().catch(() => undefined);
        }
      };
      window.setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', check);
    },
  });

  const inSession = location.pathname.startsWith('/session');
  if (!needRefresh || inSession) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] mx-auto max-w-lg px-4"
      style={{ top: 'calc(var(--safe-top) + 8px)' }}
    >
      <GlassPanel
        role="status"
        className="animate-fade-in pointer-events-auto flex items-center gap-3 py-2 pr-2 pl-4"
        rounded="rounded-[18px]"
      >
        <RefreshCw aria-hidden="true" className="text-primary-600 size-5 shrink-0" />
        <p className="flex-1 font-medium">{ru.update.available}</p>
        <button
          type="button"
          className="text-primary-600 min-h-11 rounded-xl px-3 font-semibold"
          onClick={() => void updateServiceWorker(true)}
        >
          {ru.update.action}
        </button>
        <button
          type="button"
          aria-label={ru.common.close}
          className="text-muted-glass min-h-11 min-w-11 rounded-xl"
          onClick={() => setNeedRefresh(false)}
        >
          ×
        </button>
      </GlassPanel>
    </div>
  );
}
