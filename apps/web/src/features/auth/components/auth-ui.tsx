import { Card, Button } from '@flashroute/ui';
import { clsx } from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes, type PropsWithChildren, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

type AuthCardProps = {
  title: string;
  subtitle: string;
  banner?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

type AlertTone = 'error' | 'success' | 'info' | 'warning';

type AlertProps = {
  tone?: AlertTone;
  children: ReactNode;
};

type FieldProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

type TextAreaFieldProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

const alertToneClasses: Record<AlertTone, string> = {
  error: 'border-red-500/30 bg-red-500/10 text-red-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
};

export function AuthCard({ banner, children, footer, subtitle, title }: AuthCardProps) {
  return (
    <Card padding="spacious" className="bg-fx-surface/95">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-fx-text-primary">{title}</h1>
          <p className="text-sm leading-6 text-fx-text-secondary">{subtitle}</p>
        </div>
        {banner}
        {children}
        {footer}
      </div>
    </Card>
  );
}

export function AuthAlert({ children, tone = 'error' }: AlertProps) {
  return (
    <div
      role="alert"
      className={clsx('rounded-2xl border px-4 py-3 text-sm', alertToneClasses[tone])}
    >
      {children}
    </div>
  );
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { className, error, hint, id, label, ...props },
  ref,
) {
  const inputId = id ?? props.name;

  return (
    <label className="block space-y-2" htmlFor={inputId}>
      <span className="text-sm font-medium text-fx-text-primary">{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'w-full rounded-2xl border bg-fx-bg/70 px-4 py-3 text-sm text-fx-text-primary outline-none transition placeholder:text-fx-text-muted',
          error ? 'border-red-500/40 focus:border-red-400' : 'border-fx-border focus:border-cyan-400/60',
          className,
        )}
        {...props}
      />
      {hint ? <div className="text-xs text-fx-text-muted">{hint}</div> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </label>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { className, error, hint, id, label, ...props },
  ref,
) {
  const inputId = id ?? props.name;

  return (
    <label className="block space-y-2" htmlFor={inputId}>
      <span className="text-sm font-medium text-fx-text-primary">{label}</span>
      <textarea
        ref={ref}
        id={inputId}
        className={clsx(
          'min-h-28 w-full rounded-2xl border bg-fx-bg/70 px-4 py-3 text-sm text-fx-text-primary outline-none transition placeholder:text-fx-text-muted',
          error ? 'border-red-500/40 focus:border-red-400' : 'border-fx-border focus:border-cyan-400/60',
          className,
        )}
        {...props}
      />
      {hint ? <div className="text-xs text-fx-text-muted">{hint}</div> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </label>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(props, ref) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <Field
      {...props}
      ref={ref}
      type={isVisible ? 'text' : 'password'}
      className="pr-14"
      hint={
        <span className="flex items-center justify-between gap-3">
          <span>{props.hint}</span>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-cyan-200 hover:text-cyan-100"
            aria-label={isVisible ? 'Hide password' : 'Show password'}
            onClick={() => setIsVisible((current) => !current)}
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span>{isVisible ? 'Hide' : 'Show'}</span>
          </button>
        </span>
      }
    />
  );
});

export function AuthBackToLogin() {
  return (
    <div className="text-sm text-fx-text-secondary">
      <Link className="text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline" to="/login">
        Back to login
      </Link>
    </div>
  );
}

export function AuthFooterLinks({ children }: PropsWithChildren) {
  return <div className="space-y-3 text-sm text-fx-text-secondary">{children}</div>;
}

export function InlineButtonLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Button as={Link} to={to} variant="ghost" className="h-auto px-0 py-0 text-sm text-cyan-200 hover:bg-transparent hover:text-cyan-100">
      {children}
    </Button>
  );
}
