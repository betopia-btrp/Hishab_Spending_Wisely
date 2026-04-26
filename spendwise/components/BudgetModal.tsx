/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState } from 'react';
import { motion } from 'motion/react';
import { Target, Check } from 'lucide-react';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';

interface BudgetModalProps {
  contextId: string;
  onClose: () => void;
}

export default function BudgetModal({ contextId, onClose }: BudgetModalProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        context_id: contextId,
        category_id: null,
        month: currentMonth,
        year: currentYear,
        amount: Number(amount),
      };
      console.log('[Budget] Submitting:', payload);
      const res = await api.post('/auth/budgets', payload);
      console.log('[Budget] Response:', res.data);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[Budget] Failed:', err.response?.data);
      setError(err.response?.data?.message || err.response?.data?.errors || 'Failed to set budget');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
      >
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#636B2F]">
              <Target size={28} />
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-400 font-bold"
            >
              ✕
            </button>
          </div>

          <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Set Your Monthly Limit</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">
            Start your budget to track spending and stay on target.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xl">৳</span>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-12 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl text-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                success 
                  ? 'bg-emerald-500' 
                  : 'bg-[#636B2F] hover:opacity-90 active:scale-95 shadow-emerald-900/10'
              }`}
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              ) : success ? (
                <>
                  Budget Saved <Check size={20} />
                </>
              ) : (
                'Save Budget Goal'
              )}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-4">
            You can set multiple budgets later (overall + per category)
          </p>
        </div>
      </motion.div>
    </div>
  );
}
