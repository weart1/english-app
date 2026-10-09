import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}

export function EmptyState({ icon, title, body, children }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-primary-100 text-primary-600 mb-5 flex size-20 items-center justify-center rounded-[28px]">
        {icon}
      </div>
      <h2 className="text-title font-semibold">{title}</h2>
      {body && <p className="text-muted mt-2 max-w-xs">{body}</p>}
      {children && <div className="mt-6 flex w-full max-w-xs flex-col gap-3">{children}</div>}
    </div>
  );
}
