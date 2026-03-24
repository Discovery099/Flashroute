import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@flashroute/ui';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { authApi, AuthApiError } from '../api';
import { PasswordStrengthIndicator, getPasswordStrength } from '../components/PasswordStrengthIndicator';
import { AuthAlert, AuthBackToLogin, AuthCard, Field } from '../components/auth-ui';

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
  })
  .superRefine((values, context) => {
    const strength = getPasswordStrength(values.password);

    if (!strength.isValid) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password must meet all strength requirements.' });
    }

    if (values.password !== values.confirmPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords must match.' });
    }
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [invalidTokenMessage, setInvalidTokenMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const token = searchParams.get('token');
  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const resetPasswordMutation = useMutation({ mutationFn: authApi.resetPassword });
  const password = watch('password');
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  if (!token) {
    return (
      <AuthCard title="Reset link invalid" subtitle="This reset link is no longer valid. Request a new one to continue." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert>This reset link is no longer valid. Request a new one to continue.</AuthAlert>
          <Button as={Link} to="/forgot-password" className="w-full">
            Request a new reset email
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (successMessage) {
    return (
      <AuthCard title="Password updated" subtitle="Your password has been updated. Sign in with your new password." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert tone="success">{successMessage}</AuthAlert>
          <Button type="button" className="w-full" onClick={() => navigate('/login?reset=true', { replace: true })}>
            Go to login
          </Button>
        </div>
      </AuthCard>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setInvalidTokenMessage(null);

    try {
      const result = await resetPasswordMutation.mutateAsync({ token, password: values.password });
      setSuccessMessage(result.message);
    } catch (error) {
      if (!(error instanceof AuthApiError)) {
        setInvalidTokenMessage('Unable to reach FlashRoute. Check your connection and try again.');
        return;
      }

      if (error.fieldErrors.password) {
        setError('password', { message: error.fieldErrors.password });
      }

      if (error.code === 'VALIDATION_ERROR' && error.message.includes('reset token')) {
        setInvalidTokenMessage('This reset link is no longer valid. Request a new one to continue.');
        return;
      }

      setInvalidTokenMessage(error.message);
    }
  });

  if (invalidTokenMessage && invalidTokenMessage.includes('no longer valid')) {
    return (
      <AuthCard title="Reset link invalid" subtitle="This reset link is no longer valid. Request a new one to continue." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert>{invalidTokenMessage}</AuthAlert>
          <Button as={Link} to="/forgot-password" className="w-full">
            Request a new reset email
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle="Create a fresh password to restore access to your operator workspace." footer={<AuthBackToLogin />}>
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {invalidTokenMessage ? <AuthAlert>{invalidTokenMessage}</AuthAlert> : null}
        <Field
          {...register('password')}
          label="New Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          disabled={resetPasswordMutation.isPending}
        />
        <PasswordStrengthIndicator password={password} />
        <Field
          {...register('confirmPassword')}
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          disabled={resetPasswordMutation.isPending}
        />
        {resetPasswordMutation.isPending ? <p className="text-xs text-fx-text-muted">Still working... this can happen during high traffic.</p> : null}
        <Button type="submit" className="w-full" loading={resetPasswordMutation.isPending} disabled={!isValid || resetPasswordMutation.isPending || !strength.isValid}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
