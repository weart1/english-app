import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { scrollFocusedIntoView, useVisualViewport } from '@/hooks/useVisualViewport';
import { ru } from '@/i18n/ru';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Sticky footer (actions). Stays visible above the keyboard. */
  footer?: ReactNode;
  /** Go full-screen on small phones (height ≤ 700px). */
  fullOnSmall?: boolean;
  /** Close on backdrop tap (default true). */
  dismissible?: boolean;
  labelId?: string;
}

/**
 * Glass bottom sheet. Sits above the iOS keyboard (visualViewport), respects
 * safe areas, keeps the focused field centred, closes on Escape / backdrop.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  fullOnSmall = false,
  dismissible = true,
}: BottomSheetProps) {
  const vp = useVisualViewport(open);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the dialog for screen readers (no keyboard pop-up: it's the panel).
    const t = window.setTimeout(() => {
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
        panelRef.current.focus({ preventScroll: true });
      }
    }, 50);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      const prev = restoreFocus.current;
      if (prev instanceof HTMLElement) prev.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  const small = typeof window !== 'undefined' && window.innerHeight <= 700;
  const full = fullOnSmall && small;
  const keyboardOpen = vp.keyboard > 80;
  const maxHeight = full ? vp.height : Math.max(280, vp.height - 24);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" role="presentation">
            <motion.div
              className="absolute inset-0 bg-[rgba(11,27,58,0.28)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={dismissible ? onClose : undefined}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className={`glass absolute inset-x-0 mx-auto flex max-w-2xl flex-col overflow-hidden outline-none ${
                full ? 'rounded-none' : 'rounded-t-[28px] rounded-b-none'
              }`}
              style={{
                bottom: vp.keyboard,
                maxHeight,
                height: full ? maxHeight : undefined,
                background: 'rgba(255,255,255,0.93)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', ease: [0.2, 0.8, 0.2, 1], duration: 0.28 }}
              onFocus={(e) => scrollFocusedIntoView(e.target)}
            >
              <div
                className="flex shrink-0 items-center gap-2 px-5 pt-3 pb-2"
                style={{ paddingTop: full ? 'calc(var(--safe-top) + 8px)' : undefined }}
              >
                {!full && (
                  <div
                    aria-hidden="true"
                    className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[#0b1b3a]/15"
                  />
                )}
                <h2 id={titleId} className="text-title flex-1 pt-2 font-semibold">
                  {title}
                </h2>
                <IconButton label={ru.a11y.closeSheet} onClick={onClose} className="-mr-2">
                  <X aria-hidden="true" className="size-6" />
                </IconButton>
              </div>
              <div className="scroll-area min-h-0 flex-1 px-5 pb-4">{children}</div>
              {footer && (
                <div
                  className="shrink-0 border-t border-white/70 px-5 pt-3"
                  style={{ paddingBottom: keyboardOpen ? 12 : 'calc(var(--safe-bottom) + 12px)' }}
                >
                  {footer}
                </div>
              )}
              {!footer && <div style={{ height: keyboardOpen ? 0 : 'var(--safe-bottom)' }} />}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
