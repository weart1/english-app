import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Button, type ButtonVariant } from './Button';
import { ru } from '@/i18n/ru';

interface DialogProps {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered glass modal for confirmations. */
export function Dialog({
  open,
  title,
  body,
  children,
  confirmLabel = ru.common.ok,
  cancelLabel = ru.common.cancel,
  confirmVariant = 'primary',
  confirmDisabled,
  onConfirm,
  onCancel,
}: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      if (prev instanceof HTMLElement) prev.focus({ preventScroll: true });
    };
  }, [open, onCancel]);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center px-6" role="presentation">
            <motion.div
              className="absolute inset-0 bg-[rgba(11,27,58,0.32)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCancel}
              aria-hidden="true"
            />
            <motion.div
              ref={ref}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="glass relative w-full max-w-sm rounded-[26px] p-6 outline-none"
              style={{ background: 'rgba(255,255,255,0.9)' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18 }}
            >
              <h2 id={titleId} className="text-title font-semibold">
                {title}
              </h2>
              {body && <p className="text-muted-glass mt-2">{body}</p>}
              {children && <div className="mt-4">{children}</div>}
              <div className="mt-6 flex gap-3">
                <Button variant="secondary" block onClick={onCancel}>
                  {cancelLabel}
                </Button>
                <Button variant={confirmVariant} block onClick={onConfirm} disabled={confirmDisabled}>
                  {confirmLabel}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
