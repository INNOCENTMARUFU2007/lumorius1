'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  Building2,
  Eye,
  EyeOff,
  CheckCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { setTokens } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    organizationName: '',
  });

  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);

  const update = (k: string, v: string) =>
    setForm((f) => ({
      ...f,
      [k]: v,
    }));

  const handleSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!agree) {
      setError(
        'Please accept the terms of service',
      );
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await api.post(
        '/auth/register',
        form,
      );

      const data = res.data.data;

      setTokens(
        data.accessToken,
        data.refreshToken,
      );

      router.push('/dashboard');
    } catch (err: any) {
      const msg =
        err?.response?.data?.message;

      if (Array.isArray(msg)) {
        setError(msg[0]);
      } else {
        setError(
          msg ??
            'Registration failed. Please try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const passwordStrong =
    form.password.length >= 8 &&
    /[A-Z]/.test(form.password) &&
    /\d/.test(form.password);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-12">
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
          <div className="inline-flex items-center gap-3 mb-3">
            {/* Lumorius Symbol */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-gray-900 shadow-lg shadow-violet-500/20">
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
              alt="Lumorius AI"
              width={180}
              height={50}
              className="h-auto max-w-[180px] object-contain"
              priority
            />
          </div>

          <p className="text-gray-500 text-sm">
            AI Operating System · INMARTECH PVT LTD
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-1">
            Create your account
          </h1>

          <p className="text-gray-400 text-sm mb-6">
            Get started free — no credit card required.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  First name *
                </label>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) =>
                      update(
                        'firstName',
                        e.target.value,
                      )
                    }
                    placeholder="Jane"
                    autoComplete="given-name"
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Last name
                </label>

                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) =>
                    update(
                      'lastName',
                      e.target.value,
                    )
                  }
                  placeholder="Doe"
                  autoComplete="family-name"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Work email *
              </label>

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    update(
                      'email',
                      e.target.value,
                    )
                  }
                  placeholder="jane@company.com"
                  autoComplete="email"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Password *
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
                  value={form.password}
                  onChange={(e) =>
                    update(
                      'password',
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
                    setShowPwd(!showPwd)
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

              {form.password && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <CheckCircle
                    className={`w-3 h-3 ${
                      passwordStrong
                        ? 'text-emerald-400'
                        : 'text-gray-600'
                    }`}
                  />

                  <span
                    className={`text-xs ${
                      passwordStrong
                        ? 'text-emerald-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {passwordStrong
                      ? 'Strong password'
                      : '8+ chars, uppercase, and a number'}
                  </span>
                </div>
              )}
            </div>

            {/* Organisation */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Organisation name *
              </label>

              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                <input
                  type="text"
                  required
                  value={
                    form.organizationName
                  }
                  onChange={(e) =>
                    update(
                      'organizationName',
                      e.target.value,
                    )
                  }
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) =>
                  setAgree(e.target.checked)
                }
                className="mt-0.5 w-4 h-4 accent-violet-600 cursor-pointer"
              />

              <span className="text-xs text-gray-400 leading-relaxed">
                I agree to the{' '}
                <a
                  href="#"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Terms of Service
                </a>{' '}
                and{' '}
                <a
                  href="#"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Privacy Policy
                </a>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={
                loading || !agree
              }
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition flex items-center justify-center shadow-lg shadow-violet-500/25"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}

            <Link
              href="/login"
              className="text-violet-400 hover:text-violet-300 font-medium transition"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}