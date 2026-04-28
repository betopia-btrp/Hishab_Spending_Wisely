"use client";

import { useState } from "react";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import {
  Wallet,
  LogIn,
  Lock,
  Mail,
  User as UserIcon,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";

export default function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegistering && password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isRegistering ? "/auth/register" : "/auth/login";

      const payload = isRegistering
        ? { name, email, password, password_confirmation: passwordConfirmation }
        : { email, password };

      const res = await api.post(endpoint, payload);
      login(res.data.token, res.data.user);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          `${isRegistering ? "Registration" : "Login"} failed.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/forgot-password", { email });
      setForgotPasswordSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100">
          <div className="bg-slate-900 p-10 text-center">
            <div className="inline-flex w-16 h-16 bg-[#636B2F] rounded-2xl items-center justify-center text-white mb-6 shadow-xl shadow-emerald-500/20">
              <Wallet size={32} />
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              SpendWise
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Context-Aware Expense Management
            </p>
          </div>

          <div className="p-10">
            <div className="mb-8">
              <h2 className="text-xl font-bold text-slate-900">
                {isRegistering ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                Please enter your details to continue.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-100 animate-pulse">
                {error}
              </div>
            )}

            {showForgotPassword ? (
              forgotPasswordSent ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Check your email
                  </h3>
                  <p className="text-slate-500 text-sm">
                    We sent a password reset link to your email address.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-slate-500 text-sm mb-4">
                    Enter your email address and we'll send you a link to reset
                    your password.
                  </p>

                  <div className="relative">
                    <Mail
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-[#636B2F] focus:border-transparent outline-none transition font-medium"
                      placeholder="Email Address"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-[#636B2F] text-white rounded-2xl font-extrabold hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-70 shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      "Send Reset Link"
                    )}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegistering && (
                  <div className="relative">
                    <UserIcon
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-[#636B2F] focus:border-transparent outline-none transition font-medium"
                      placeholder="Full Name"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-[#636B2F] focus:border-transparent outline-none transition font-medium"
                    placeholder="Email Address"
                  />
                </div>

                <div className="relative">
                  <Lock
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-[#636B2F] focus:border-transparent outline-none transition font-medium"
                    placeholder="Password"
                  />
                </div>

                {/* ✅ Confirm Password Field */}
                {isRegistering && (
                  <div className="relative">
                    <Lock
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                    />
                    <input
                      type="password"
                      required
                      value={passwordConfirmation}
                      onChange={(e) => setPasswordConfirmation(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:ring-2 focus:ring-[#636B2F] focus:border-transparent outline-none transition font-medium"
                      placeholder="Confirm Password"
                    />
                  </div>
                )}

                {showForgotPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotPasswordSent(false);
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-[#636B2F] flex items-center gap-1 mb-4"
                  >
                    <ArrowLeft size={14} /> Back to login
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-extrabold hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-70 shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <LogIn size={18} />
                      {isRegistering ? "Create Account" : "Sign In"}
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-8 text-center">
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-sm font-bold text-slate-600 hover:text-[#636B2F] transition"
              >
                {isRegistering
                  ? "Already have an account? Sign In"
                  : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-400 text-[10px] uppercase tracking-widest font-bold mt-8">
          Powered by SpendWise Personal & Group Ledger
        </p>
      </div>
    </div>
  );
}
