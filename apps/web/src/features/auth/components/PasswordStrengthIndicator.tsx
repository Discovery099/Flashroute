import { clsx } from 'clsx';

const checks = [
  { label: '8+ characters', test: (value: string) => value.length >= 8 },
  { label: 'Uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Number', test: (value: string) => /\d/.test(value) },
  { label: 'Special character', test: (value: string) => /[^A-Za-z\d]/.test(value) },
];

export const getPasswordStrength = (password: string) => {
  const completedChecks = checks.filter((check) => check.test(password)).length;

  return {
    completedChecks,
    checks: checks.map((check) => ({ label: check.label, passed: check.test(password) })),
    label: completedChecks === 5 ? 'Strong' : completedChecks >= 3 ? 'Moderate' : 'Weak',
    isValid: completedChecks === 5,
  };
};

export function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = getPasswordStrength(password);

  return (
    <div className="rounded-2xl border border-fx-border bg-fx-bg/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.24em] text-fx-text-muted">Password strength</span>
        <span className="text-sm text-fx-text-primary">{strength.label}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {strength.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={clsx('h-2.5 w-2.5 rounded-full', check.passed ? 'bg-emerald-400' : 'bg-fx-border')}
            />
            <span className={check.passed ? 'text-emerald-100' : 'text-fx-text-secondary'}>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
