import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export type CardProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  footer?: ReactNode;
  variant?: 'default' | 'interactive' | 'loading' | 'error' | 'success' | 'warning';
  padding?: 'compact' | 'default' | 'spacious';
  className?: string;
};

const variantClasses = {
  default: 'border-fx-border bg-fx-surface/90',
  interactive: 'border-fx-border bg-fx-surface/90 hover:border-fx-border-subtle hover:bg-fx-surface-strong/80',
  loading: 'border-fx-border bg-fx-surface/70 opacity-80',
  error: 'border-red-500/30 bg-red-500/10',
  success: 'border-emerald-500/30 bg-emerald-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
} as const;

const paddingClasses = {
  compact: 'p-4',
  default: 'p-6',
  spacious: 'p-8',
} as const;

export function Card({
  action,
  children,
  className,
  footer,
  padding = 'default',
  subtitle,
  title,
  variant = 'default',
}: CardProps) {
  return (
    <section
      aria-busy={variant === 'loading'}
      className={clsx('overflow-hidden rounded-3xl border shadow-panel/30', variantClasses[variant], className)}
    >
      <div className={paddingClasses[padding]}>
        {title || subtitle || action ? (
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {title ? <h2 className="text-lg font-semibold text-fx-text-primary">{title}</h2> : null}
              {subtitle ? <p className="mt-1 text-sm text-fx-text-secondary">{subtitle}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
        ) : null}
        {children}
      </div>
      {footer ? <footer className="border-t border-fx-border px-6 py-4">{footer}</footer> : null}
    </section>
  );
}
