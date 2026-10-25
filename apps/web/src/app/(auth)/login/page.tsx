'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import api from '@/lib/api';
import { setTokens, getAuthDestination } from '@/lib/auth';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', {
        email,
        password,
        mfaCode: mfaCode || undefined,
      });

      const data = res.data.data;

      if (data?.mfaRequired) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      setTokens(data.accessToken, data.refreshToken);

      router.replace(getAuthDestination(data.user));
    } catch (err: any) {
      const msg = err?.response?.data?.message;

      if (Array.isArray(msg)) {
        setError(msg[0]);
      } else {
        setError(
          msg ?? 'Sign in failed. Please check your credentials.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex">

     {/* Left — brand panel */}
<div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-900/50 to-indigo-900/30 border-r border-gray-800 items-center justify-center px-12 py-12">
  <div className="w-full flex flex-col items-center">

    {/* LOGO + INFORMATION MASTER COLUMN */}
    <div className="w-[430px] max-w-full flex flex-col items-center">

    {/* Official Lumorius Logo */}
<div className="w-full flex justify-center items-center mb-14 translate-x-8">
  <img
    src="/logo-horizontal.svg"
    alt="Lumorius AI"
    className="w-[420px] max-w-full h-auto object-contain block"
  />
</div>
      {/* Brand description */}
      <div className="w-full text-center mb-10">
        <p className="text-gray-400 text-sm leading-7">
          The AI Operating System for modern businesses.
          <br />
          10 modules. One unified platform.
        </p>
      </div>

      {/* Feature information */}
      <div className="w-[390px] max-w-full mx-auto space-y-4 text-left">
        {[
          'Company Brain — instant AI answers from your docs',
          'Meeting Intelligence — transcription & insights',
          'Founder OS — KPIs, OKRs, health scoring',
          'AI Strategy Advisor — GPT-4o / Claude / Gemini',
        ].map((f) => (
          <div
            key={f}
            className="flex items-start gap-3 text-sm text-gray-400 leading-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-[9px] shrink-0" />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Copyright */}
      <p className="text-xs text-gray-600 mt-14 text-center">
        INMARTECH PVT LTD · All rights reserved
      </p>

    </div>
  </div>
</div>

      {/* RIGHT — LOGIN FORM */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >

          {/* MOBILE BRAND */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center">
              <img
                src="/logo-horizontal.svg"
                alt="Lumorius AI"
                className="w-[210px] sm:w-[230px] h-auto max-w-full object-contain"
              />
            </div>
          </div>

          {/* LOGIN CARD */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">

            <h1 className="text-2xl font-bold text-white mb-1">
              {mfaRequired
                ? 'Two-factor verification'
                : 'Welcome back'}
            </h1>

            <p className="text-gray-400 text-sm mb-6">
              {mfaRequired
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Sign in to your Lumorius workspace.'}
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">

              {!mfaRequired ? (
                <>
                  {/* EMAIL */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Email
                    </label>

                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                      />
                    </div>
                  </div>

                  {/* PASSWORD */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400">
                        Password
                      </label>

                      <Link
                        href="/forgot-password"
                        className="text-xs text-violet-400 hover:text-violet-300 transition"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                      <input
                        type={showPwd ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        autoComplete="current-password"
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
                      >
                        {showPwd ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* MFA */
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Authenticator Code
                  </label>

                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />

                    <input
                      type="text"
                      autoFocus
                      value={mfaCode}
                      onChange={(e) =>
                        setMfaCode(
                          e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 6)
                        )
                      }
                      placeholder="000000"
                      className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition placeholder-gray-600 tracking-widest text-center text-xl"
                    />
                  </div>
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition flex items-center justify-center shadow-lg shadow-violet-500/25"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mfaRequired ? (
                  'Verify Code'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {!mfaRequired && (
              <>
                {/* DIVIDER */}
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800" />
                  </div>

                  <div className="relative flex justify-center">
                    <span className="bg-gray-900 px-3 text-xs text-gray-500">
                      or
                    </span>
                  </div>
                </div>

                {/* MAGIC LINK */}
                <button
                  type="button"
                  onClick={() => {
                    if (!email) {
                      toast.error('Enter your email first');
                      return;
                    }

                    api
                      .post('/auth/magic-link', { email })
                      .then(() =>
                        toast.success(
                          `Magic link sent to ${email}`
                        )
                      )
                      .catch(() =>
                        toast.error(
                          'Failed to send magic link'
                        )
                      );
                  }}
                  className="w-full py-3 border border-gray-700 hover:bg-gray-800 text-gray-300 rounded-xl font-medium text-sm transition"
                >
                  Send magic link instead
                </button>

                {/* REGISTER */}
                <p className="text-center text-sm text-gray-500 mt-5">
                  Don't have an account?{' '}

                  <Link
                    href="/register"
                    className="text-violet-400 hover:text-violet-300 font-medium transition"
                  >
                    Create one free
                  </Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}