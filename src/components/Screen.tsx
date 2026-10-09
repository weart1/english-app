import { forwardRef, useCallback, useState, type ReactNode, type UIEvent } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from './Button';
import { ru } from '@/i18n/ru';

interface ScreenProps {
  title?: ReactNode;
  /** Large iOS-style title (top-level tabs) vs compact centered title (sub-screens). */
  large?: boolean;
  back?: boolean | string;
  actions?: ReactNode;
  /** Extra header content (search field, chips) that stays sticky. */
  headerExtra?: ReactNode;
  children: ReactNode;
  /** Content rendered outside the scroll area but inside the screen (FABs, action bars). */
  overlay?: ReactNode;
  className?: string;
  onScroll?: (e: UIEvent<HTMLDivElement>) => void;
  /** Always render the header as glass (e.g. when it hosts a search field). */
  alwaysGlass?: boolean;
}

/**
 * A screen = its own scroll container with a sticky header. The header turns into
 * glass once content scrolls under it.
 */
export const Screen = forwardRef<HTMLDivElement, ScreenProps>(function Screen(
  { title, large = true, back, actions, headerExtra, children, overlay, className = '', onScroll, alwaysGlass },
  ref,
) {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const s = e.currentTarget.scrollTop > 4;
      setScrolled((prev) => (prev === s ? prev : s));
      onScroll?.(e);
    },
    [onScroll],
  );

  const glass = alwaysGlass || scrolled;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className={`scroll-area relative min-h-0 flex-1 ${className}`} onScroll={handleScroll}>
        <header
          className={`sticky top-0 z-20 transition-[background-color,box-shadow,border-color] duration-200 ${
            glass ? 'glass rounded-none rounded-b-[22px] border-t-0' : 'border border-transparent'
          }`}
          style={{ paddingTop: 'var(--safe-top)' }}
        >
          <div className="px-safe mx-auto max-w-2xl">
            <div className={`flex items-center gap-2 ${large ? 'min-h-14 pt-2' : 'min-h-13'}`}>
              {back && (
                <IconButton
                  label={ru.a11y.back}
                  className="-ml-2"
                  onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
                >
                  <ChevronLeft aria-hidden="true" className="size-7" />
                </IconButton>
              )}
              {title !== undefined && (
                <h1
                  className={`min-w-0 flex-1 truncate ${
                    large ? 'text-large-title font-bold tracking-tight' : 'text-title font-semibold'
                  }`}
                >
                  {title}
                </h1>
              )}
              {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
            </div>
            {headerExtra && <div className="pb-3">{headerExtra}</div>}
          </div>
        </header>
        <div className="px-safe mx-auto max-w-2xl pb-28">{children}</div>
      </div>
      {overlay}
    </div>
  );
});
