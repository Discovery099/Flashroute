import { Button } from '@flashroute/ui';

import { AuthAlert, Field } from './auth-ui';

type TwoFactorChallengeProps = {
  email: string;
  error?: string;
  isSubmitting: boolean;
  onChangeEmail: () => void;
  register: Record<string, unknown> & {
    ref: (instance: HTMLInputElement | null) => void;
  };
};

export function TwoFactorChallenge({ email, error, isSubmitting, onChangeEmail, register }: TwoFactorChallengeProps) {
  return (
    <div className="space-y-4">
      <AuthAlert tone="info">Two-factor authentication required</AuthAlert>
      <div className="rounded-2xl border border-fx-border bg-fx-bg/40 px-4 py-3 text-sm text-fx-text-secondary">
        <div className="flex items-center justify-between gap-3">
          <span>Signing in as {email}</span>
          <Button type="button" variant="ghost" onClick={onChangeEmail} className="h-auto px-0 py-0 text-cyan-200 hover:bg-transparent">
            Change email
          </Button>
        </div>
      </div>
      <Field
        {...register}
        autoComplete="one-time-code"
        inputMode="numeric"
        label="TOTP Code"
        maxLength={6}
        placeholder="123456"
        error={error}
        hint="Enter the 6-digit code from your authenticator app."
      />
      {isSubmitting ? <p className="text-xs text-fx-text-muted">Still working... this can happen during high traffic.</p> : null}
    </div>
  );
}
