import { useEffect, useState } from 'react';

export interface ViewportState {
  /** Visible height (shrinks when the iOS keyboard is open). */
  height: number;
  /** How far iOS has scrolled the visual viewport down inside the layout viewport. */
  offsetTop: number;
  /** Pixels the keyboard covers at the bottom of the layout viewport. */
  keyboard: number;
}

function read(): ViewportState {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const layoutH = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (!vv) return { height: layoutH, offsetTop: 0, keyboard: 0 };
  const keyboard = Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop));
  return { height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop), keyboard };
}

/**
 * Tracks the visual viewport so floating UI (bottom sheets) can sit above the
 * iOS keyboard. Updates are rAF-throttled.
 */
export function useVisualViewport(enabled = true): ViewportState {
  const [state, setState] = useState<ViewportState>(read);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        setState((prev) =>
          prev.height === next.height && prev.keyboard === next.keyboard && prev.offsetTop === next.offsetTop ? prev : next,
        );
      });
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  return state;
}

/**
 * Keeps the focused field visible above the keyboard: after the keyboard
 * animation, scroll the field to the centre of its scroll container.
 */
export function scrollFocusedIntoView(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches('input, textarea, select, [contenteditable="true"]')) return;
  window.setTimeout(() => {
    if (document.activeElement === target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, 320);
}
