import type { ElementType, ComponentPropsWithoutRef, ReactNode } from 'react';

type GlassPanelProps<T extends ElementType> = {
  as?: T;
  children?: ReactNode;
  className?: string;
  /** Override the default 24px radius (e.g. tab bar uses its own shape). */
  rounded?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

/**
 * Frosted-glass surface for floating UI only (tab bar, header, flashcard, sheets,
 * modals, action bars). Never use it for list rows and never nest it in another glass.
 */
export function GlassPanel<T extends ElementType = 'div'>({
  as,
  children,
  className = '',
  rounded = 'rounded-[24px]',
  ...rest
}: GlassPanelProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag className={`glass ${rounded} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
