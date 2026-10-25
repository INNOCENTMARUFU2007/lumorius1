'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { setTokens, getAuthDestination } from '@/lib/auth';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agree) {
      setError('Please accept the terms of service');
      return;
    }

    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();

    if (name.length < 2) {
      setError('Please enter your name.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/register', {
        name,
        email: form.email.trim(),
        password: form.password,
        organizationName: form.organizationName.trim() || undefined,
      });

      const data = res.data?.data;

      if (!data?.accessToken || !data?.refreshToken) {
        throw new Error(
          'Registration succeeded or returned an unexpected response, but authentication tokens were missing. Please check the API response.'
        );
      }

      setTokens(data.accessToken, data.refreshToken);

      router.replace(getAuthDestination(data.user));
    } catch (err: any) {
      const msg = err?.response?.data?.message;

      if (Array.isArray(msg)) {
        setError(msg.join(', '));
      } else {
        setError(
          msg ??
            err?.message ??
            'Registration failed. Please check your connection and try again.'
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-md"
      >
        {/* BRANDING */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4 translate-x-14">
            <img
              src="/logo-horizontal.svg"
              alt="Lumorius AI"
              className="w-[340px] sm:w-[370px] h-auto max-w-[92%] object-contain"
            />
          </div>

          <p className="text-gray-500 text-sm">
            AI Operating System · INMARTECH PVT LTD
          </p>
        </div>

        {/* REGISTRATION CARD */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 sm:p-8 shadow-2xl shadow-black/20">
          <h1 className="text-2xl font-bold text-white mb-1">
            Create your account
          </h1>

          <p className="text-gray-400 text-sm mb-6">
            Get started free — no credit card required.
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NAME */}
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
                      update('firstName', e.target.value)
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
                    update('lastName', e.target.value)
                  }
                  placeholder="Doe"
                  autoComplete="family-name"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* EMAIL */}
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
                    update('email', e.target.value)
                  }
                  placeholder="jane@company.com"
                  autoComplete="email"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Password *
              </label>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(e) =>
                    update('password', e.target.value)
                  }
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />

                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
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

            {/* ORGANISATION */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Organisation name *
              </label>

              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                <input
                  type="text"
                  required
                  value={form.organizationName}
                  onChange={(e) =>
                    update('organizationName', e.target.value)
                  }
                  placeholder="Acme Inc."
                  autoComplete="organization"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                />
              </div>
            </div>

            {/* TERMS */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
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

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={loading || !agree}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition flex items-center justify-center shadow-lg shadow-violet-500/25"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* LOGIN LINK */}
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