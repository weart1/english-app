import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  dotColor?: string;
  icon?: ReactNode;
}

/** Pill-shaped toggle chip (filters, sources, counts). */
export function Chip({ active, dotColor, icon, className = '', children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.94rem] font-medium whitespace-nowrap transition-colors disabled:opacity-40 ${
        active
          ? 'bg-primary-500 text-on-primary shadow-[0_4px_12px_rgba(47,107,255,0.25)]'
          : 'text-strong bg-white shadow-card active:bg-primary-50'
      } ${className}`}
      {...rest}
    >
      {dotColor && (
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full ring-2 ring-white/70"
          style={{ background: dotColor }}
        />
      )}
      {icon}
      {children}
    </button>
  );
}
