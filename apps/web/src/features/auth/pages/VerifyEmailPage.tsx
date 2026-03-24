import { useMutation } from '@tanstack/react-query';
import { Button } from '@flashroute/ui';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { authApi, AuthApiError } from '../api';
import { AuthAlert, AuthBackToLogin, AuthCard } from '../components/auth-ui';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const registeredEmail = searchParams.get('email');
  const isRegisteredPrompt = searchParams.get('registered') === 'true' && !token;
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'prompt'>(token ? 'loading' : isRegisteredPrompt ? 'prompt' : 'error');
  const [message, setMessage] = useState(
    token
      ? 'Verifying your email...'
      : isRegisteredPrompt
        ? 'Account created. Check your inbox to verify your address before signing in.'
        : 'This verification link has expired or has already been used.',
  );
  const verifyMutation = useMutation({ mutationFn: authApi.verifyEmail });

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;

    void verifyMutation
      .mutateAsync({ token })
      .then((result) => {
        if (!active) {
          return;
        }

        setStatus('success');
        setMessage(result.message);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        if (error instanceof AuthApiError) {
          setMessage('This verification link has expired or has already been used.');
        } else {
          setMessage('Unable to reach FlashRoute. Check your connection and try again.');
        }

        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [token, verifyMutation]);

  if (status === 'loading') {
    return (
      <AuthCard title="Verifying your email..." subtitle="This usually takes a few seconds." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert tone="info">{message}</AuthAlert>
        </div>
      </AuthCard>
    );
  }

  if (status === 'prompt') {
    return (
      <AuthCard title="Check your email" subtitle="We sent a verification link to finish setting up your FlashRoute account." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert tone="success">{message}</AuthAlert>
          {registeredEmail ? <p className="text-sm text-fx-text-secondary">Verification pending for {registeredEmail}</p> : null}
          <Button as={Link} to={registeredEmail ? `/login?email=${encodeURIComponent(registeredEmail)}` : '/login'} className="w-full">
            Go to login
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (status === 'success') {
    return (
      <AuthCard title="Email verified" subtitle="Your account is ready. Sign in to start monitoring arbitrage opportunities." footer={<AuthBackToLogin />}>
        <div className="space-y-4">
          <AuthAlert tone="success">{message}</AuthAlert>
          <Button as={Link} to="/login" className="w-full">
            Go to login
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verification link invalid or expired" subtitle="The link may have already been used, expired, or been copied incorrectly." footer={<AuthBackToLogin />}>
      <div className="space-y-4">
        <AuthAlert>{message}</AuthAlert>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button as={Link} to="/login" className="flex-1">
            Back to login
          </Button>
          <Button as={Link} to="/register" variant="secondary" className="flex-1">
            Request new verification email
          </Button>
        </div>
      </div>
    </AuthCard>
  );
}
