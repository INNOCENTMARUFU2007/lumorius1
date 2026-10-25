
'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    {
      label: '8+ characters',
      pass: password.length >= 8,
    },
    {
      label: 'Uppercase letter',
      pass: /[A-Z]/.test(password),
    },
    {
      label: 'Lowercase letter',
      pass: /[a-z]/.test(password),
    },
    {
      label: 'Number',
      pass: /\d/.test(password),
    },
    {
      label: 'Special character',
      pass: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const score = checks.filter((c) => c.pass).length;

  const colors = [
    'bg-red-500',
    'bg-red-400',
    'bg-amber-400',
    'bg-yellow-400',
    'bg-emerald-500',
  ];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i < score ? colors[score - 1] : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {checks.map(({ label, pass }) => (
          <div
            key={label}
            className={`flex items-center gap-1.5 text-xs ${
              pass ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            {pass ? (
              <CheckCircle className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [tokenLoaded, setTokenLoaded] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Read the reset token in the browser, avoiding useSearchParams()
  // during Next.js static prerendering.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token'));
    setTokenLoaded(true);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!token) {
      setError('Invalid reset link. Please request a new one.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: password,
      });

      setSuccess(true);

      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          'Reset failed. The link may have expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Avoid briefly displaying the invalid-link state before the
  // browser has read the URL.
  if (!tokenLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div
          className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading reset link"
        />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center"
        >
          <div className="flex justify-center mb-8">
            <img
              src="/logo-horizontal.svg"
              alt="Lumorius AI"
              className="w-[280px] sm:w-[320px] h-auto max-w-[90%] object-contain"
            />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
            <p className="text-gray-400 mb-4">
              Invalid reset link.
            </p>

            <Link
              href="/forgot-password"
              className="text-violet-400 text-sm hover:text-violet-300 transition"
            >
              Request a new one →
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-md"
      >
        {/* Official Lumorius Branding */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <img
              src="/logo-horizontal.svg"
              alt="Lumorius AI"
              className="w-[300px] sm:w-[340px] h-auto max-w-[92%] object-contain"
            />
          </div>

          <p className="text-gray-500 text-sm">
            AI Operating System · INMARTECH PVT LTD
          </p>
        </div>

        {/* Reset Password Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 sm:p-8 shadow-2xl shadow-black/20">
          {success ? (
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 200,
                }}
                className="w-16 h-16 mx-auto mb-4 bg-emerald-500/10 rounded-full flex items-center justify-center"
              >
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </motion.div>

              <h1 className="text-xl font-bold text-white mb-2">
                Password reset!
              </h1>

              <p className="text-gray-400 text-sm mb-4">
                Your password has been updated. Redirecting to sign in…
              </p>

              <Link
                href="/login"
                className="inline-block px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition"
              >
                Sign In →
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white mb-1">
                  Set new password
                </h1>

                <p className="text-gray-400 text-sm">
                  Choose a strong password for your account.
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-xs font-medium text-gray-400 mb-1.5"
                  >
                    New Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                    <input
                      id="new-password"
                      type={showPwd ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      aria-label={
                        showPwd ? 'Hide password' : 'Show password'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
                    >
                      {showPwd ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {password && (
                    <PasswordStrength password={password} />
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-xs font-medium text-gray-400 mb-1.5"
                  >
                    Confirm Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                    <input
                      id="confirm-password"
                      type="password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                    />
                  </div>

                  {confirm && password !== confirm && (
                    <p className="text-xs text-red-400 mt-1">
                      Passwords do not match
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !password ||
                    password !== confirm
                  }
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition flex items-center justify-center"
                >
                  {loading ? (
                    <span
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                      role="status"
                      aria-label="Resetting password"
                    />
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
