/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from 'react';
import { Target, Plus, Edit2, Trash2, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';
import { Budget } from '@/types';

interface BudgetApiResponse {
  month: number;
  year: number;
  budgets: Budget[];
}

interface BudgetFormData {
  amount: string;
  category_id?: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];

export default function Budgets() {
  const { currentContext } = useAppContext();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [formData, setFormData] = useState<BudgetFormData>({ amount: '' });
  const [saving, setSaving] = useState(false);
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());

  const fetchBudgets = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      console.log('[Budgets] Fetching with context:', currentContext.id, 'month:', currentMonth, 'year:', currentYear);
      const res = await api.get(`/budgets`, {
        params: {
          context_id: currentContext.id,
          month: currentMonth,
          year: currentYear,
        },
      });
      console.log('[Budgets] Response:', res.data);
      const data: BudgetApiResponse = res.data;
      setBudgets(data.budgets || []);
    } catch (err: any) {
      console.error('[Budgets] Error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[Budgets] currentContext:', currentContext);
    fetchBudgets();
  }, [currentContext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentContext || !formData.amount) return;

    setSaving(true);
    try {
      const payload = {
        context_id: currentContext.id,
        month: currentMonth,
        year: currentYear,
        amount: Number(formData.amount),
        category_id: formData.category_id || null,
      };

      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, { amount: Number(formData.amount) });
      } else {
        await api.post('/budgets', payload);
      }

      await fetchBudgets();
      closeForm();
    } catch (err) {
      console.error('Failed to save budget', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (budget: Budget) => {
    if (!confirm('Delete this budget?')) return;
    try {
      await api.delete(`/budgets/${budget.id}`);
      await fetchBudgets();
    } catch (err) {
      console.error('Failed to delete budget', err);
    }
  };

  const openForm = (budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget);
      setFormData({ amount: budget.amount.toString() });
    } else {
      if (budgets.length > 0) {
        if (!confirm('A budget is already set for this month. Do you want to update it?')) {
          return;
        }
      }
      setEditingBudget(null);
      setFormData({ amount: '' });
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBudget(null);
    setFormData({ amount: '' });
  };

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Budget Management</h2>
          <p className="text-sm text-slate-500 font-medium">
            {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className="bg-[#636B2F] text-white px-6 py-3 rounded-2xl font-extrabold shadow-lg shadow-emerald-200 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Set Budget
        </button>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-[2rem] border border-slate-100 text-center">
          <p className="text-slate-400 font-bold animate-pulse">Loading budgets...</p>
        </div>
      ) : budgets.length === 0 ? (
        <div className="bg-white p-12 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center text-center shadow-xl shadow-slate-100">
          <div className="w-20 h-20 bg-emerald-50 text-[#636B2F] rounded-2xl flex items-center justify-center mb-6">
            <Target size={40} />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-3">No Budgets Set</h3>
          <p className="text-slate-500 mb-6 max-w-sm">Set a monthly budget to track your spending and stay on target.</p>
          <button
            onClick={() => openForm()}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-extrabold shadow-lg hover:bg-slate-800 transition-all"
          >
            Create Your First Budget
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Overall Budget</span>
              <span className={cn(
                "text-xs font-black px-3 py-1 rounded-full",
                overallPercentage > 90 ? "bg-rose-100 text-rose-600" :
                overallPercentage > 70 ? "bg-amber-100 text-amber-600" :
                "bg-emerald-100 text-emerald-600"
              )}>
                {overallPercentage.toFixed(0)}% used
              </span>
            </div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">{formatCurrency(totalSpent)}</p>
                <p className="text-sm text-slate-400 font-medium">Budget: {formatCurrency(totalBudget)}</p>
              </div>
              <p className={cn(
                "text-xl font-black",
                totalBudget - totalSpent >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                {formatCurrency(totalBudget - totalSpent)} remaining
              </p>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  overallPercentage > 90 ? "bg-rose-500" :
                  overallPercentage > 70 ? "bg-amber-500" :
                  "bg-[#636B2F]"
                )}
                style={{ width: `${Math.min(overallPercentage, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {budgets.map((budget) => {
              const percentage = budget.amount > 0 
                ? ((budget.spent_amount || 0) / budget.amount) * 100 
                : 0;
              
              return (
                <div
                  key={budget.id}
                  className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Target size={24} className="text-[#636B2F]" />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openForm(budget)}
                        className="p-2 hover:bg-slate-50 rounded-lg transition"
                      >
                        <Edit2 size={16} className="text-slate-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(budget)}
                        className="p-2 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 size={16} className="text-rose-400" />
                      </button>
                    </div>
                  </div>

                  {budget.category && (
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {budget.category.name}
                    </p>
                  )}

                  <p className="text-2xl font-black text-slate-900 tracking-tight mb-1">
                    {formatCurrency(budget.amount)}
                  </p>
                  <p className="text-xs text-slate-400 font-medium mb-4">Monthly Limit</p>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 font-medium">Spent</span>
                      <span className="font-bold text-slate-700">{formatCurrency(budget.spent_amount || 0)}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          percentage > 90 ? "bg-rose-500" :
                          percentage > 70 ? "bg-amber-500" :
                          "bg-[#636B2F]"
                        )}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <p className={cn(
                      "text-xs font-black text-right",
                      (budget.amount - (budget.spent_amount || 0)) >= 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {formatCurrency(budget.remaining || 0)} remaining
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#636B2F]">
                    <Target size={28} />
                  </div>
                  <button onClick={closeForm} className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-400">
                    ✕
                  </button>
                </div>

                <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
                  {editingBudget ? 'Update Budget' : 'Set New Budget'}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">
                  {editingBudget 
                    ? 'Update your monthly spending limit.' 
                    : `Define your budget for ${MONTH_NAMES[currentMonth - 1]} ${currentYear}.`
                  }
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xl">৳</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-12 pr-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl text-2xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-5 rounded-2xl font-black text-white bg-[#636B2F] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        {editingBudget ? 'Update Budget' : 'Save Budget'}
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}