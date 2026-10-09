import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'soft';
export type ButtonSize = 'md' | 'lg' | 'sm';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-500 text-on-primary active:bg-primary-600 hover:bg-primary-600 shadow-[0_6px_18px_rgba(47,107,255,0.28)]',
  secondary: 'bg-white text-strong shadow-card active:bg-primary-50 hover:bg-primary-50',
  soft: 'bg-primary-100 text-primary-600 active:bg-primary-100/70',
  ghost: 'bg-transparent text-primary-600 active:bg-primary-100/60 hover:bg-primary-100/60',
  danger: 'bg-danger-600 text-white active:brightness-95',
  accent: 'bg-accent-400 text-strong active:brightness-95',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-[0.94rem] gap-1.5',
  md: 'min-h-11 px-4 gap-2',
  lg: 'min-h-14 px-5 text-[1.06rem] gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, block, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-[15px] font-semibold whitespace-nowrap transition-[transform,background-color,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

/** Square 44×44 icon button; `label` becomes the aria-label (Russian). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'plain' | 'soft' | 'white' }
>(function IconButton({ label, tone = 'plain', className = '', children, type = 'button', ...rest }, ref) {
  const toneClass =
    tone === 'soft'
      ? 'bg-primary-100 text-primary-600'
      : tone === 'white'
        ? 'bg-white text-primary-600 shadow-card'
        : 'text-primary-600 active:bg-primary-100/60 hover:bg-primary-100/60';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] transition-colors disabled:opacity-40 ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
