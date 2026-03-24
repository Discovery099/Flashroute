import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@flashroute/ui';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { authApi, AuthApiError } from '../api';
import { PasswordStrengthIndicator, getPasswordStrength } from '../components/PasswordStrengthIndicator';
import { AuthAlert, AuthBackToLogin, AuthCard, AuthFooterLinks, Field, PasswordField } from '../components/auth-ui';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(100, 'Name is too long.'),
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
    acceptTerms: z.boolean().refine((value) => value, 'You must accept the terms to continue.'),
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

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    setError,
    watch,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const registerMutation = useMutation({ mutationFn: authApi.register });
  const password = watch('password');
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await registerMutation.mutateAsync({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      navigate(`/verify-email?registered=true&email=${encodeURIComponent(values.email.trim().toLowerCase())}`, {
        replace: true,
      });
    } catch (error) {
      if (!(error instanceof AuthApiError)) {
        setFormError('Unable to reach FlashRoute. Check your connection and try again.');
        return;
      }

      if (error.fieldErrors.email) {
        setError('email', { message: error.fieldErrors.email });
      }

      if (error.fieldErrors.password) {
        setError('password', { message: error.fieldErrors.password });
      }

      if (error.code === 'CONFLICT') {
        setError('email', { message: 'An account already exists for this email.' });
        return;
      }

      if (error.code === 'RATE_LIMITED') {
        setFormError('Too many sign-up attempts. Please wait a minute and try again.');
        return;
      }

      setFormError(error.message);
    }
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up operator access and confirm your email before entering the console."
      footer={
        <AuthFooterLinks>
          <AuthBackToLogin />
          <p>
            Already have an account?{' '}
            <Link className="text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline" to="/login">
              Sign in
            </Link>
          </p>
        </AuthFooterLinks>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {formError ? <AuthAlert>{formError}</AuthAlert> : null}
        <Field {...register('name')} label="Name" autoComplete="name" error={errors.name?.message} disabled={registerMutation.isPending} />
        <Field
          {...register('email')}
          label="Email"
          autoComplete="email"
          placeholder="operator@flashroute.io"
          error={errors.email?.message}
          disabled={registerMutation.isPending}
        />
        <PasswordField
          {...register('password')}
          label="Password"
          autoComplete="new-password"
          error={errors.password?.message}
          disabled={registerMutation.isPending}
        />
        <PasswordStrengthIndicator password={password} />
        <PasswordField
          {...register('confirmPassword')}
          label="Confirm Password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          disabled={registerMutation.isPending}
        />
        <label className="block space-y-2 text-sm text-fx-text-secondary">
          <span className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-fx-border bg-fx-bg" {...register('acceptTerms')} disabled={registerMutation.isPending} />
            <span>
              I agree to the{' '}
              <Link className="text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline" to="/pricing">
                Terms
              </Link>{' '}
              and{' '}
              <Link className="text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline" to="/contact">
                Privacy Policy
              </Link>
              .
            </span>
          </span>
          {errors.acceptTerms?.message ? <p className="text-sm text-red-300">{errors.acceptTerms.message}</p> : null}
        </label>
        {registerMutation.isPending ? <p className="text-xs text-fx-text-muted">Still working... this can happen during high traffic.</p> : null}
        <Button type="submit" className="w-full" loading={registerMutation.isPending} disabled={!isValid || registerMutation.isPending || !strength.isValid}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
