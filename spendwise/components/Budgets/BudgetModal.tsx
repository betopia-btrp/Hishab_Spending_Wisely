"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, X, Check, AlertCircle } from 'lucide-react';
import api from '@/lib/axios';

interface BudgetModalProps {
  contextId: string;
  onClose: () => void;
}

export default function BudgetModal({ contextId, onClose }: BudgetModalProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [existingBudget, setExistingBudget] = useState<any>(null);
  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false);
  const [initialCheckLoading, setInitialCheckLoading] = useState(true);

  useEffect(() => {
    const checkExistingBudget = async () => {
      try {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        const res = await api.get(`/auth/budgets`, {
          params: {
            context_id: contextId,
            month: month,
            year: year,
          },
        });
        if (res.data && res.data.budgets && res.data.budgets.length > 0) {
          const budget = res.data.budgets[0];
          if (!budget.category_id) {
            setExistingBudget(budget);
            setAmount(budget.amount.toString());
            setShowConfirmUpdate(true);
          }
        }
      } catch (error: any) {
        console.error('Failed to check budget', error.response?.data || error.message);
      } finally {
        setInitialCheckLoading(false);
      }
    };
    checkExistingBudget();
  }, [contextId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (existingBudget) {
        await api.put(`/auth/budgets/${existingBudget.id}`, {
          amount: Number(amount),
        });
      } else {
        await api.post(`/auth/budgets`, {
          amount: Number(amount),
          context_id: contextId,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        });
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Failed to save budget', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialCheckLoading) {
    return (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="w-12 h-12 border-4 border-[#636B2F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
            {existingBudget ? 'Update Budget' : 'Set Monthly Budget'}
          </h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">
            {existingBudget 
              ? 'Update your monthly spending limit.' 
              : `Set your budget for ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}.`
            }
          </p>

          {showConfirmUpdate && (
            <div className="mb-4 p-3 bg-amber-50 text-amber-700 text-sm rounded-xl border border-amber-100">
              A budget is already set. Click save to update it.
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
              disabled={loading}
              className="w-full py-5 rounded-2xl font-black text-white bg-[#636B2F] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {existingBudget ? 'Update Budget' : 'Save Budget'}
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}