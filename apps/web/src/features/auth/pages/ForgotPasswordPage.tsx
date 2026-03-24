import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@flashroute/ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { authApi, AuthApiError, maskEmail } from '../api';
import { AuthAlert, AuthBackToLogin, AuthCard, Field } from '../components/auth-ui';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    reset,
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  });

  const forgotPasswordMutation = useMutation({ mutationFn: authApi.forgotPassword });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const email = values.email.trim().toLowerCase();
      await forgotPasswordMutation.mutateAsync({ email });
      setSubmittedEmail(email);
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFormError('FlashRoute is temporarily unavailable. Try again in a moment.');
        return;
      }

      setFormError('Unable to reach FlashRoute. Check your connection and try again.');
    }
  });

  if (submittedEmail) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle="If an account exists for that email, a reset link has been sent."
        footer={<AuthBackToLogin />}
      >
        <div className="space-y-4">
          <AuthAlert tone="success">If an account exists for that email, a reset link has been sent.</AuthAlert>
          <p className="text-sm text-fx-text-secondary">Sent to {maskEmail(submittedEmail)}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button as={Link} to="/login" className="flex-1">
              Back to login
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setSubmittedEmail(null);
                reset({ email: '' });
              }}
            >
              Try another email
            </Button>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send a reset link if an account exists."
      footer={<AuthBackToLogin />}
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {formError ? <AuthAlert>{formError}</AuthAlert> : null}
        <Field
          {...register('email')}
          label="Email"
          autoComplete="email"
          error={errors.email?.message}
          disabled={forgotPasswordMutation.isPending}
        />
        {forgotPasswordMutation.isPending ? <p className="text-xs text-fx-text-muted">Still working... this can happen during high traffic.</p> : null}
        <Button type="submit" className="w-full" loading={forgotPasswordMutation.isPending} disabled={!isValid || forgotPasswordMutation.isPending}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
