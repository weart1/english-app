import { useEffect } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToastStore, type Toast } from '@/store/toast';
import { GlassPanel } from './GlassPanel';
import { ru } from '@/i18n/ru';

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(t.id), t.durationMs);
    return () => window.clearTimeout(timer);
  }, [t.id, t.durationMs, dismiss]);

  const Icon = t.tone === 'error' ? CircleAlert : t.tone === 'success' ? CircleCheck : Info;
  const iconColor =
    t.tone === 'error' ? 'text-danger-600' : t.tone === 'success' ? 'text-success-600' : 'text-primary-600';

  return (
    <GlassPanel
      role={t.tone === 'error' ? 'alert' : 'status'}
      className="animate-fade-in pointer-events-auto flex min-h-12 items-center gap-3 py-2 pr-2 pl-4"
      rounded="rounded-[18px]"
    >
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${iconColor}`} />
      <p className="text-body flex-1 py-1 leading-snug">{t.message}</p>
      {t.action && (
        <button
          type="button"
          className="text-primary-600 min-h-11 shrink-0 rounded-xl px-3 font-semibold"
          onClick={() => {
            t.action?.onClick();
            dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={ru.common.close}
        className="text-muted-glass flex size-11 shrink-0 items-center justify-center rounded-xl"
        onClick={() => dismiss(t.id)}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </GlassPanel>
  );
}

/** Toast stack shown above the tab bar. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex max-w-lg flex-col gap-2 px-4"
      style={{ bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 12px)' }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
