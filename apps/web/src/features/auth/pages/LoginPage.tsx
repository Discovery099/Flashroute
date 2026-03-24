import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@flashroute/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { authApi, AuthApiError, sanitizeRedirectTo } from '../api';
import { TwoFactorChallenge } from '../components/TwoFactorChallenge';
import { AuthAlert, AuthCard, AuthFooterLinks, Field, InlineButtonLink, PasswordField } from '../components/auth-ui';
import { useAuthStore } from '@/state/auth.store';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  rememberDevice: z.boolean().optional(),
  totpCode: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .refine((value) => value.length === 0 || /^[0-9]{6}$/.test(value), 'Enter a valid 6-digit code.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const bannerMessages = {
  registered: { tone: 'success' as const, message: 'Account created. Verify your email before signing in.' },
  reset: { tone: 'success' as const, message: 'Password updated. Sign in with your new password.' },
  loggedOut: { tone: 'info' as const, message: 'You have been signed out.' },
};

const getFriendlyError = (error: AuthApiError) => {
  if (error.code === 'RATE_LIMITED') {
    return 'FlashRoute is temporarily unavailable. Try again in a moment.';
  }

  if (error.code === 'ACCOUNT_LOCKED' && error.lockedUntil) {
    return `Account locked until ${error.lockedUntil}`;
  }

  if (error.code === 'INVALID_CREDENTIALS' || error.code === 'UNAUTHORIZED') {
    return 'Email or password is incorrect.';
  }

  if (error.code === 'TWO_FACTOR_INVALID') {
    return 'The code is incorrect or expired. Try the latest code from your authenticator app.';
  }

  if (error.code === 'TWO_FACTOR_REQUIRED') {
    return 'Two-factor authentication required.';
  }

  return 'Unable to reach FlashRoute. Check your connection and try again.';
};

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isTwoFactorStep, setIsTwoFactorStep] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const totpInputRef = useRef<HTMLInputElement | null>(null);
  const completeLogin = useAuthStore((state) => state.completeLogin);
  const clearPostLoginRedirect = useAuthStore((state) => state.clearPostLoginRedirect);
  const postLoginRedirect = useAuthStore((state) => state.postLoginRedirect);

  const {
    formState: { errors, isValid },
    handleSubmit,
    register,
    resetField,
    setError,
    watch,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: {
      email: searchParams.get('email') ?? '',
      password: '',
      rememberDevice: false,
      totpCode: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
  });

  useEffect(() => {
    if (isTwoFactorStep) {
      totpInputRef.current?.focus();
    }
  }, [isTwoFactorStep]);

  const banner = useMemo(() => {
    if (searchParams.get('registered') === 'true') {
      return bannerMessages.registered;
    }

    if (searchParams.get('reset') === 'true') {
      return bannerMessages.reset;
    }

    if (searchParams.get('loggedOut') === 'true') {
      return bannerMessages.loggedOut;
    }

    return null;
  }, [searchParams]);

  const handleChangeEmail = () => {
    setIsTwoFactorStep(false);
    setChallengeToken(null);
    setFormError(null);
    resetField('totpCode');
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const result = await loginMutation.mutateAsync({
        email: values.email.trim().toLowerCase(),
        ...(isTwoFactorStep
          ? {
              challengeToken: challengeToken ?? undefined,
              totpCode: values.totpCode.replace(/\s+/g, ''),
            }
          : {
              password: values.password,
              rememberDevice: values.rememberDevice,
            }),
      });

      completeLogin({ accessToken: result.accessToken });
      await authApi.getCurrentUser(result.accessToken);

      const target = sanitizeRedirectTo(searchParams.get('redirectTo')) ?? sanitizeRedirectTo(postLoginRedirect) ?? '/dashboard';
      clearPostLoginRedirect();
      navigate(target, { replace: true });
    } catch (error) {
      if (!(error instanceof AuthApiError)) {
        setFormError('Unable to reach FlashRoute. Check your connection and try again.');
        return;
      }

      if (error.requiresTwoFactor) {
        setIsTwoFactorStep(true);
        setChallengeToken(error.challengeToken);
        setFormError('Two-factor authentication required.');
        return;
      }

      if (error.fieldErrors.email) {
        setError('email', { message: error.fieldErrors.email });
      }

      if (error.fieldErrors.password) {
        setError('password', { message: error.fieldErrors.password });
      }

      if (isTwoFactorStep || error.code === 'TWO_FACTOR_INVALID') {
        setError('totpCode', { message: 'The code is incorrect or expired. Try the latest code from your authenticator app.' });
      }

      setFormError(getFriendlyError(error));
    }
  });

  const emailRegister = register('email');
  const passwordRegister = register('password');
  const totpRegister = register('totpCode', {
    setValueAs: (value: string) => value.replace(/\s+/g, ''),
  });

  const currentEmail = watch('email');

  return (
    <AuthCard
      title="Sign in"
      subtitle="Access your dashboard, strategies, and live opportunities."
      banner={banner ? <AuthAlert tone={banner.tone}>{banner.message}</AuthAlert> : undefined}
      footer={
        <AuthFooterLinks>
          {!isTwoFactorStep ? <InlineButtonLink to="/forgot-password">Forgot password?</InlineButtonLink> : null}
          <p>
            Don&apos;t have an account?{' '}
            <Link className="text-cyan-200 underline-offset-4 hover:text-cyan-100 hover:underline" to="/register">
              Sign up
            </Link>
          </p>
        </AuthFooterLinks>
      }
    >
      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        {formError ? <AuthAlert tone={isTwoFactorStep ? 'info' : 'error'}>{formError}</AuthAlert> : null}

        <Field
          {...emailRegister}
          autoComplete="email"
          label="Email"
          placeholder="you@flashroute.io"
          error={errors.email?.message}
          disabled={loginMutation.isPending || isTwoFactorStep}
        />

        {!isTwoFactorStep ? (
          <PasswordField
            {...passwordRegister}
            autoComplete="current-password"
            label="Password"
            error={errors.password?.message}
            disabled={loginMutation.isPending}
          />
        ) : (
          <TwoFactorChallenge
            email={currentEmail}
            error={errors.totpCode?.message}
            isSubmitting={loginMutation.isPending}
            onChangeEmail={handleChangeEmail}
            register={{
              ...totpRegister,
              ref: (instance) => {
                totpRegister.ref(instance);
                totpInputRef.current = instance;
              },
            }}
          />
        )}

        {!isTwoFactorStep ? (
          <label className="flex items-center gap-3 text-sm text-fx-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-fx-border bg-fx-bg"
              {...register('rememberDevice')}
              disabled={loginMutation.isPending}
            />
            Remember this device
          </label>
        ) : null}

        {loginMutation.isPending ? <p className="text-xs text-fx-text-muted">Still working... this can happen during high traffic.</p> : null}

        <Button type="submit" className="w-full" loading={loginMutation.isPending} disabled={!isValid || loginMutation.isPending}>
          {isTwoFactorStep ? 'Verify and Sign In' : 'Sign In'}
        </Button>
      </form>
    </AuthCard>
  );
}
