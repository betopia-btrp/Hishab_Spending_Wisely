/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axios';
import { ArrowLeft, Check, Loader2, Settings, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: number;
  price_monthly: number;
  features: PlanFeature[];
  cta: string;
  highlighted: boolean;
  priceId?: string;
}

const freePlan: Plan = {
  name: 'Free',
  price: 0,
  price_monthly: 0,
  features: [
    { text: '1 group', included: true },
    { text: 'Up to 4 members per group', included: true },
  ],
  cta: 'Current Plan',
  highlighted: false,
};

function PricingContent() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const cancelled = searchParams.get('cancelled');

    if (cancelled) {
      setMessage({ type: 'error', text: 'Payment was cancelled. You can try again anytime.' });
      return;
    }

    if (sessionId && isAuthenticated) {
      setLoading(true);
      axios.post('/subscriptions/verify-session', { session_id: sessionId })
        .then(() => {
          setMessage({ type: 'success', text: 'Welcome to Pro! Your account has been upgraded.' });
          setTimeout(() => router.push('/?tab=dashboard'), 2000);
        })
        .catch(() => {
          setMessage({ type: 'error', text: 'Failed to verify payment. Please contact support.' });
        })
        .finally(() => setLoading(false));
    }
  }, [searchParams, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) {
      const proPlan: Plan = {
        name: 'Pro',
        price: 9.99,
        price_monthly: 9.99,
        features: [
          { text: 'Unlimited groups', included: true },
          { text: 'Unlimited members', included: true },
        ],
        cta: 'Log in to subscribe',
        highlighted: true,
      };
      setPlans([freePlan, proPlan]);
      return;
    }

    axios.get('/subscriptions/plans')
      .then((res) => {
        const backendPlan = res.data[0];
        const proPlan: Plan = {
          name: 'Pro',
          price: backendPlan ? Number(backendPlan.price_monthly) : 9.99,
          price_monthly: backendPlan ? Number(backendPlan.price_monthly) : 9.99,
          features: [
            { text: 'Unlimited groups', included: true },
            { text: 'Unlimited members', included: true },
          ],
          cta: backendPlan?.stripe_price_monthly_id ? 'Subscribe' : 'Coming soon',
          highlighted: true,
          priceId: backendPlan?.stripe_price_monthly_id,
        };
        setPlans([freePlan, proPlan]);
      })
      .catch(() => {
        const proPlan: Plan = {
          name: 'Pro',
          price: 9.99,
          price_monthly: 9.99,
          features: [
            { text: 'Unlimited groups', included: true },
            { text: 'Unlimited members', included: true },
          ],
          cta: 'Coming soon',
          highlighted: true,
        };
        setPlans([freePlan, proPlan]);
      });
  }, [isAuthenticated]);

  const handleSubscribe = async (priceId: string | undefined) => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/subscriptions/checkout', {
        price_id: priceId,
        success_url: `${window.location.origin}/pricing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/pricing?cancelled=true`,
      });
      window.location.href = res.data.url;
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to start checkout. Please try again.';
      setMessage({ type: 'error', text: msg });
      setLoading(false);
    }
  };

  if (!plans) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={24} className="animate-spin text-[#636B2F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={isAuthenticated ? '/?tab=dashboard' : '/'} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition">
            <ArrowLeft size={18} />
            <span className="text-sm font-bold">Back to {isAuthenticated ? 'App' : 'Home'}</span>
          </Link>
          <span className="text-lg font-black text-[#636B2F] tracking-tight">SpendWise</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full text-emerald-700 text-xs font-bold uppercase tracking-widest mb-6">
            <Sparkles size={14} />
            Pricing
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Choose the plan that fits your needs. Upgrade anytime to unlock more features.
          </p>
        </div>

        {message && (
          <div className={`max-w-lg mx-auto mb-10 p-4 rounded-2xl border flex items-center gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {message.type === 'success' ? <Check size={18} /> : <X size={18} />}
            {message.text}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center mb-10">
            <Loader2 size={24} className="animate-spin text-[#636B2F]" />
            <span className="ml-3 text-sm font-medium text-slate-600">
              {message?.type === 'success' ? 'Redirecting...' : 'Processing...'}
            </span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl border-2 p-8 transition-all ${
                plan.highlighted
                  ? 'bg-white border-[#636B2F] shadow-2xl shadow-emerald-500/10 scale-105'
                  : 'bg-white border-slate-100 shadow-xl shadow-slate-100'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#636B2F] text-white px-6 py-1 rounded-full text-xs font-black uppercase tracking-widest shadow-lg">
                  Recommended
                </div>
              )}

              <div className="mb-8">
                <h2 className="text-2xl font-black text-slate-900 mb-2">{plan.name}</h2>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black text-slate-900">${plan.price}</span>
                  {plan.price > 0 && <span className="text-slate-400 font-medium">/month</span>}
                </div>
              </div>

              <ul className="space-y-4 mb-10">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex items-center gap-3">
                    {feature.included ? (
                      <Check size={18} className="text-emerald-500 shrink-0" />
                    ) : (
                      <X size={18} className="text-slate-300 shrink-0" />
                    )}
                    <span className={`text-sm ${feature.included ? 'text-slate-700' : 'text-slate-400'}`}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.price === 0 && user?.is_premium ? null : (
                <button
                  onClick={() => {
                    if (plan.price === 0) return;
                    handleSubscribe(plan.priceId);
                  }}
                  disabled={loading || (plan.price === 0 && !!user) || (plan.price > 0 && user?.is_premium) || (plan.price > 0 && !plan.priceId)}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
                    plan.price === 0
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : user?.is_premium
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : plan.priceId
                          ? 'bg-[#636B2F] text-white hover:bg-[#4A5323] shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98]'
                          : 'bg-slate-100 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {user?.is_premium && plan.price > 0 ? 'Current Plan' : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-[#636B2F]/20 border-t-[#636B2F] rounded-full animate-spin" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
