/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Target, X, Check, Loader2, Tag } from 'lucide-react';
import api from '@/lib/axios';
import { Category } from '@/types';

interface BudgetModalProps {
  contextId: string;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'base' | 'additional';
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

export default function BudgetModal({ contextId, onClose, onSuccess, initialMode = 'base' }: BudgetModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [existingBudget, setExistingBudget] = useState<any>(null);
  const [mode, setMode] = useState<'base' | 'additional'>(initialMode);
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get(`/auth/categories?context_id=${contextId}`);
        const data = res.data.data || res.data;
        setCategories(Array.isArray(data) ? data : (data.system || []).concat(data.custom || []));
      } catch (err: any) {
        console.error('[Categories] Error:', err.response?.data || err.message);
        setCategories([]);
      }
    };
    fetchCategories();
  }, [contextId]);

  useEffect(() => {
    if (mode === 'base') {
      const checkExistingBudget = async () => {
        try {
          const res = await api.get(`/auth/budgets`, {
            params: {
              context_id: contextId,
              month: currentMonth,
              year: currentYear,
            },
          });
          if (res.data && res.data.budgets && res.data.budgets.length > 0) {
            const budget = res.data.budgets[0];
            if (!budget.category_id && !budget.description) {
              setExistingBudget(budget);
              setAmount(budget.budget?.toString() || budget.amount?.toString() || '');
            }
          }
        } catch (error: any) {
          console.error('Failed to check budget', error.response?.data || error.message);
        }
      };
      checkExistingBudget();
    }
  }, [contextId, mode, currentMonth, currentYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        amount: Number(amount),
        context_id: contextId,
        month: currentMonth,
        year: currentYear,
      };

      if (mode === 'additional') {
        if (description) payload.description = description;
        if (categoryId) payload.category_id = categoryId;
      }

      if (existingBudget) {
        await api.put(`/auth/budgets/${existingBudget.id}`, { amount: Number(amount) });
      } else {
        await api.post(`/auth/budgets`, payload);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to save budget', err.response?.data || err.message);
      setError(err.response?.data?.message || 'Failed to save budget');
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

          <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
            {existingBudget ? 'Update Budget' : mode === 'additional' ? 'Add Additional Budget' : 'Set Monthly Budget'}
          </h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">
            {existingBudget
              ? 'Update your monthly spending limit.'
              : mode === 'additional'
                ? 'Add extra funds to your monthly budget.'
                : `Set your budget for ${MONTH_NAMES[currentMonth - 1]} ${currentYear}.`
            }
          </p>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                Amount
              </label>
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
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                />
              </div>
            </div>

            {mode === 'additional' && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                    Description <span className="text-slate-300">(optional)</span>
                  </label>
                  <div className="relative">
                    <Tag size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Shopping buffer, Travel fund"
                      className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                    Category <span className="text-slate-300">(optional)</span>
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                  >
                    <option value="">No category (general)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || success}
              className={`w-full py-4 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                success
                  ? 'bg-emerald-500'
                  : 'bg-[#636B2F] hover:opacity-90 shadow-emerald-900/10'
              }`}
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : success ? (
                <>
                  Budget Saved <Check size={20} />
                </>
              ) : (
                existingBudget ? 'Update Budget' : mode === 'additional' ? 'Add Budget' : 'Save Budget'
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}