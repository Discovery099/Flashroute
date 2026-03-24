import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ElementType, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { clsx } from 'clsx';

type SharedButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  className?: string;
  as?: ElementType;
};

export type ButtonProps = SharedButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedButtonProps> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedButtonProps> & {
    to?: string;
  };

const variantClasses = {
  primary: 'border-cyan-400/30 bg-cyan-400/90 text-slate-950 hover:bg-cyan-300',
  secondary: 'border-fx-border bg-fx-surface text-fx-text-primary hover:border-fx-border-subtle hover:bg-fx-surface-strong',
  danger: 'border-red-500/30 bg-red-500/15 text-red-100 hover:bg-red-500/25',
  ghost: 'border-transparent bg-transparent text-fx-text-secondary hover:bg-fx-surface-strong hover:text-fx-text-primary',
  success: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25',
} as const;

const sizeClasses = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
} as const;

export function Button({
  as,
  children,
  className,
  loading = false,
  size = 'md',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const Component = as ?? 'button';
  const componentProps = Component === 'button' ? { type: 'button', ...props } : props;

  return (
    <Component
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition duration-150 disabled:cursor-not-allowed disabled:border-fx-border disabled:bg-fx-surface disabled:text-fx-text-muted',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...componentProps}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </Component>
  );
}
