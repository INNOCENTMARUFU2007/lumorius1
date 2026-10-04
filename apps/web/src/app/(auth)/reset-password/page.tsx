'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';

function PasswordStrength({
  password,
}: {
  password: string;
}) {
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

  const score = checks.filter(
    (c) => c.pass,
  ).length;

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
              i < score
                ? colors[score - 1]
                : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {checks.map(({ label, pass }) => (
          <div
            key={label}
            className={`flex items-center gap-1.5 text-xs ${
              pass
                ? 'text-emerald-400'
                : 'text-gray-500'
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
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [password, setPassword] =
    useState('');
  const [confirm, setConfirm] =
    useState('');
  const [showPwd, setShowPwd] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');
  const [success, setSuccess] =
    useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.svg"
              alt="Lumorius"
              width={64}
              height={64}
              className="w-16 h-16 object-contain"
              priority
            />
          </div>

          <p className="text-gray-400">
            Invalid reset link.
          </p>

          <Link
            href="/forgot-password"
            className="text-violet-400 text-sm mt-2 inline-block"
          >
            Request a new one →
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (password !== confirm) {
      setError(
        'Passwords do not match',
      );
      return;
    }

    if (password.length < 8) {
      setError(
        'Password must be at least 8 characters',
      );
      return;
    }

    setError('');
    setLoading(true);

    try {
      await api.post(
        '/auth/reset-password',
        {
          token,
          newPassword: password,
        },
      );

      setSuccess(true);

      setTimeout(
        () => router.push('/login'),
        3000,
      );
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          'Reset failed. The link may have expired.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <motion.div
        initial={{
          opacity: 0,
          y: 20,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            {/* Lumorius Symbol */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-gray-900">
              <Image
                src="/logo.svg"
                alt="Lumorius"
                width={40}
                height={40}
                className="w-full h-full object-contain"
                priority
              />
            </div>

            {/* Lumorius Wordmark */}
            <Image
              src="/logo-wordmark.svg"
              alt="Lumorius"
              width={180}
              height={50}
              className="h-auto max-w-[180px] object-contain"
              priority
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
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
                Your password has been updated.
                Redirecting to sign in…
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
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* New Password */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    New Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                    <input
                      type={
                        showPwd
                          ? 'text'
                          : 'password'
                      }
                      required
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value,
                        )
                      }
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPwd(
                          !showPwd,
                        )
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
                    <PasswordStrength
                      password={password}
                    />
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Confirm Password
                  </label>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                    <input
                      type="password"
                      required
                      value={confirm}
                      onChange={(e) =>
                        setConfirm(
                          e.target.value,
                        )
                      }
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                    />
                  </div>

                  {confirm &&
                    password !==
                      confirm && (
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
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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