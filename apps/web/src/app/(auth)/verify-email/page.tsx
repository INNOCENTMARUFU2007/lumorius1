'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Mail,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type VerificationState = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmailPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<VerificationState>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);

  // Read the verification token from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verificationToken = params.get('token');

    if (verificationToken) {
      setToken(verificationToken);
    } else {
      setState('no-token');
    }
  }, []);

  // Verify the email only when a token is present.
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const verify = async () => {
      try {
        await api.post('/auth/verify-email', { token });

        if (cancelled) return;

        setState('success');
        setError('');

        // Determine where the account should go after verification.
        let destination = '/login?verified=1';

        if (getAccessToken()) {
          try {
            const response = await api.get('/auth/me');
            const profile = response.data?.data ?? response.data;

            if (profile?.emailVerified) {
              destination = profile.onboardingCompleted
                ? '/dashboard'
                : '/onboarding';
            }
          } catch {
            // If the session is no longer valid, return to sign in.
            destination = '/login?verified=1';
          }
        }

        if (cancelled) return;

        redirectTimer = setTimeout(() => {
          router.replace(destination);
        }, 1800);
      } catch (err: any) {
        if (cancelled) return;

        const message = err?.response?.data?.message;

        setError(
          Array.isArray(message)
            ? message.join(', ')
            : message ?? 'Email verification failed. The link may have expired.',
        );

        setState('error');
      }
    };

    void verify();

    return () => {
      cancelled = true;

      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [token, router]);

  // Request a new verification email only after an explicit click.
  const resendVerification = async () => {
    if (!getAccessToken()) {
      router.push('/login');
      return;
    }

    setResending(true);
    setError('');
    setNotice('');

    try {
      await api.post('/auth/resend-verification');

      setNotice(
        'Verification email requested. Check your inbox and spam folder.',
      );
    } catch (err: any) {
      const message = err?.response?.data?.message;

      setError(
        Array.isArray(message)
          ? message.join(', ')
          : message ?? 'Could not request a verification email.',
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center">
            <Image
              src="/logo.svg"
              alt="Lumorius"
              width={56}
              height={56}
              priority
              className="w-14 h-14 object-contain"
            />
          </div>

          <div className="mt-3 flex justify-center">
            <Image
              src="/logo-wordmark.svg"
              alt="Lumorius AI"
              width={170}
              height={40}
              priority
              className="w-auto h-9"
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          {state === 'loading' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-violet-500/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              </div>

              <h1 className="text-xl font-bold text-white mb-2">
                Verifying your email...
              </h1>

              <p className="text-gray-400 text-sm">
                Please wait while we verify your email address.
              </p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>

              <h1 className="text-xl font-bold text-white mb-2">
                Email verified!
              </h1>

              <p className="text-gray-400 text-sm mb-6">
                Your email has been confirmed. Taking you to the next step...
              </p>

              <Loader2 className="w-5 h-5 text-violet-400 animate-spin mx-auto" />
            </>
          )}

          {state === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>

              <h1 className="text-xl font-bold text-white mb-2">
                Verification unsuccessful
              </h1>

              <p role="alert" className="text-gray-400 text-sm mb-4">
                {error}
              </p>

              {notice && (
                <p
                  role="status"
                  className="text-emerald-400 text-sm mb-4"
                >
                  {notice}
                </p>
              )}

              <div className="space-y-3">
                {getAccessToken() && (
                  <button
                    type="button"
                    onClick={resendVerification}
                    disabled={resending}
                    className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition"
                  >
                    {resending
                      ? 'Requesting email...'
                      : 'Resend verification email'}
                  </button>
                )}

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 w-full px-6 py-3 border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-xl text-sm transition"
                >
                  Return to sign in
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </>
          )}

          {state === 'no-token' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-violet-500/10 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-violet-400" />
              </div>

              <h1 className="text-xl font-bold text-white mb-2">
                Email verification required
              </h1>

              <p className="text-gray-400 text-sm mb-6">
                No verification token was found in this URL. Open the
                verification link from your email to confirm your account.
                No email has been sent by opening this page.
              </p>

              {notice && (
                <p
                  role="status"
                  className="text-emerald-400 text-sm mb-4"
                >
                  {notice}
                </p>
              )}

              {error && (
                <p role="alert" className="text-red-400 text-sm mb-4">
                  {error}
                </p>
              )}

              <div className="space-y-3">
                {getAccessToken() && (
                  <button
                    type="button"
                    onClick={resendVerification}
                    disabled={resending}
                    className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition"
                  >
                    {resending
                      ? 'Requesting email...'
                      : 'Send verification email'}
                  </button>
                )}

                <Link
                  href="/login"
                  className="block w-full px-6 py-3 border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-xl text-sm transition"
                >
                  Return to sign in
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          INMARTECH PVT LTD · Lumorius AI
        </p>
      </motion.div>
    </div>
  );
}