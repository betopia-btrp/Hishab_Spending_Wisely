/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { Wallet, ArrowRight, Shield, Zap, CheckCircle, Receipt, WalletCards, PiggyBank } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';

interface FeatureCardProps {
  title: string;
  desc: string;
  icon: React.ElementType;
  tab: string;
  requiresAuth?: boolean;
}

function FeatureCard({ title, desc, icon: Icon, tab, requiresAuth = true }: FeatureCardProps) {
  const router = useRouter();

  const handleClick = () => {
    if (requiresAuth) {
      router.push(`/?tab=${tab}&auth_required=true`);
    } else {
      router.push(`/?tab=${tab}`);
    }
  };

  return (
    <button 
      onClick={handleClick}
      className="p-10 rounded-[2.5rem] bg-slate-50 hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-xl transition-all group text-left w-full"
    >
      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-[#636B2F] mb-6 shadow-sm group-hover:scale-110 transition-transform">
        <Icon size={32} />
      </div>
      <h3 className="text-xl font-extrabold text-slate-900 mb-4">{title}</h3>
      <p className="text-slate-500 leading-relaxed font-medium">{desc}</p>
    </button>
  );
}

export default function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 overflow-hidden">
      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#636B2F] rounded-xl flex items-center justify-center text-white shadow-lg">
            <Wallet size={24} />
          </div>
          <span className="font-extrabold text-2xl text-slate-900 tracking-tight">SpendWise</span>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onGetStarted} className="text-slate-600 font-bold hover:text-[#636B2F] transition">Sign In</button>
          <button 
            onClick={onGetStarted}
            className="bg-[#636B2F] text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-900/10 hover:opacity-90 transition"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-32 grid lg:grid-cols-2 gap-12 items-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-[#636B2F] px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest mb-6">
            <Zap size={14} />
            Smart Expense Tracking
          </div>
          <h1 className="text-6xl lg:text-7xl font-black text-slate-900 leading-[0.95] tracking-tighter mb-8">
            Manage money <br />
            <span className="text-[#636B2F]">without the mess.</span>
          </h1>
          <p className="text-slate-500 text-xl font-medium leading-relaxed max-w-lg mb-10">
            A beautiful, context-aware platform for personal and shared expenses. Track, split, and settle in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={onGetStarted}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-2xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              Start Free Today
              <ArrowRight size={20} />
            </button>
            <div className="flex -space-x-3 items-center ml-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-4 border-white bg-slate-200" />
              ))}
              <span className="ml-6 text-sm font-bold text-slate-400 uppercase tracking-widest">+2.4k happy users</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <div className="bg-white rounded-[3rem] shadow-2xl p-8 border border-slate-100 rotate-2 relative z-10">
             <div className="flex items-center justify-between mb-8">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Dashboard Preview</span>
             </div>
             <div className="space-y-6">
                <div className="h-4 w-2/3 bg-slate-50 rounded-full" />
                <div className="h-32 w-full bg-[#636B2F]/5 rounded-[2rem] border-2 border-dashed border-[#636B2F]/20 flex items-center justify-center">
                   <div className="text-[#636B2F] font-black text-4xl tracking-tighter">$1,240.50</div>
                </div>
                <div className="flex gap-4">
                   <div className="h-20 flex-1 bg-slate-50 rounded-2xl" />
                   <div className="h-20 flex-1 bg-slate-50 rounded-2xl" />
                </div>
             </div>
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#636B2F]/5 blur-3xl -z-10 rounded-full" />
        </motion.div>
      </section>

      {/* Features */}
      <section className="bg-white py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Built for modern finances</h2>
            <p className="text-slate-500 mt-4 font-medium">Everything you need to stay on top of your wallet.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <FeatureCard 
              title="Personal Ledger" 
              desc="Securely track every penny you spend privately." 
              icon={Receipt} 
              tab="expenses"
            />
            <FeatureCard 
              title="Group Contexts" 
              desc="Separate work, home, and travel splits with ease." 
              icon={WalletCards} 
              tab="balances"
            />
            <FeatureCard 
              title="Auto-Settle" 
              desc="Smart calculation for complex roommate balances." 
              icon={PiggyBank} 
              tab="budgets"
            />
          </div>
        </div>
      </section>

      {/* Tutorial Hint */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
         <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 text-sm font-bold">
            <span className="text-emerald-400">💡 Tip:</span>
            <span>Switch between Personal and Group contexts in the sidebar</span>
            <div className="w-4 h-4 bg-white/20 rounded-full animate-ping" />
         </div>
      </div>
    </div>
  );
}
