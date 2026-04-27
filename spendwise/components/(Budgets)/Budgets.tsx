/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from 'react';
import { Target, Plus, Edit2, Trash2, TrendingDown, Wallet, Tag, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';
import { Budget, Category } from '@/types';

interface BudgetApiResponse {
  month: number;
  year: number;
  budgets: Budget[];
}

interface BudgetFormData {
  amount: string;
  description: string;
  category_id?: string;
  month?: number;
  year?: number;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

interface BudgetCard {
  id: string;
  context_id: string;
  category_id: string | null;
  month: number;
  year: number;
  amount: number;
  budget: number;
  spent_amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: string;
  description?: string;
  category?: { id: string; name: string; icon: string };
}

export default function Budgets() {
  const { currentContext } = useAppContext();
  const [budgets, setBudgets] = useState<BudgetCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetCard | null>(null);
  const [formData, setFormData] = useState<BudgetFormData>({ amount: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());

  const hasBaseBudget = budgets.some(b => !b.category_id && !b.description);
  const additionalBudgets = budgets.filter(b => b.category_id || b.description);

  const fetchBudgets = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      const res = await api.get(`/auth/budgets`, {
        params: {
          context_id: currentContext.id,
          month: currentMonth,
          year: currentYear,
        },
      });

      const rawBudgetList = Array.isArray(res.data)
        ? res.data
        : res.data?.budgets ?? res.data?.data ?? [];

      const budgetList: BudgetCard[] = rawBudgetList.map((b: any) => ({
        id: b.id,
        context_id: b.context_id || currentContext.id,
        category_id: b.category_id || null,
        month: Number(b.month) || currentMonth,
        year: Number(b.year) || currentYear,
        amount: Number(b.budget) || 0,
        budget: Number(b.budget) || 0,
        spent_amount: Number(b.spent) || 0,
        spent: Number(b.spent) || 0,
        remaining: Number(b.remaining) || 0,
        percentage: Number(b.percentage) || 0,
        status: b.status || 'on_track',
        description: b.description || '',
        category: b.category || null,
      }));

      setBudgets(budgetList);
    } catch (err: any) {
      console.error('[Budgets] Error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!currentContext) return;
    try {
      const res = await api.get(`/auth/categories?context_id=${currentContext.id}`);
      const data = res.data.data || res.data;
      setCategories(Array.isArray(data) ? data : (data.system || []).concat(data.custom || []));
    } catch (err: any) {
      console.error('[Categories] Error:', err.response?.data || err.message);
      setCategories([]);
    }
  };

  useEffect(() => {
    fetchBudgets();
    fetchCategories();
  }, [currentContext]);

  useEffect(() => {
    const handler = () => fetchBudgets();
    window.addEventListener('budget-updated', handler);
    return () => window.removeEventListener('budget-updated', handler);
  }, [currentContext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentContext || !formData.amount) return;

    setSaving(true);
    try {
      const payload = {
        context_id: currentContext.id,
        month: formData.month || currentMonth,
        year: formData.year || currentYear,
        amount: Number(formData.amount),
        category_id: formData.category_id || null,
        description: formData.description || null,
      };

      if (editingBudget) {
        await api.put(`/auth/budgets/${editingBudget.id}`, { amount: Number(formData.amount) });
      } else {
        await api.post('/auth/budgets', payload);
      }

      await fetchBudgets();
      closeForm();
    } catch (err) {
      console.error('Failed to save budget', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (budget: BudgetCard) => {
    if (!confirm(`Delete${budget.description ? ` "${budget.description}"` : ' this budget'}?`)) return;
    try {
      await api.delete(`/auth/budgets/${budget.id}`);
      await fetchBudgets();
    } catch (err) {
      console.error('Failed to delete budget', err);
    }
  };

  const openForm = (budget?: BudgetCard) => {
    if (budget) {
      setEditingBudget(budget);
      setFormData({
        amount: budget.amount.toString(),
        description: budget.description || '',
        category_id: budget.category_id || '',
        month: budget.month,
        year: budget.year,
      });
    } else {
      setEditingBudget(null);
      setFormData({
        amount: '',
        description: '',
        category_id: '',
        month: currentMonth,
        year: currentYear,
      });
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBudget(null);
    setFormData({ amount: '', description: '' });
  };

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || b.spent || 0), 0);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Budget Management</h2>
          <p className="text-sm text-slate-500 font-medium flex items-center gap-2">
            <Calendar size={14} />
            {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </p>
        </div>
        <button
          onClick={() => openForm()}
          className="bg-[#636B2F] text-white px-6 py-3 rounded-2xl font-extrabold shadow-lg shadow-emerald-200 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          {hasBaseBudget ? 'Add Additional Budget' : 'Set Monthly Budget'}
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
              <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Total Monthly Budget</span>
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
                <p className="text-sm text-slate-400 font-medium">Spent of {formatCurrency(totalBudget)}</p>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <Target size={24} className="text-[#636B2F]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Base Monthly Budget</h3>
                  <p className="text-xs text-slate-500">
                    {budgets.filter(b => !b.category_id && !b.description).reduce((sum, b) => sum + b.amount, 0) > 0
                      ? formatCurrency(budgets.filter(b => !b.category_id && !b.description).reduce((sum, b) => sum + b.amount, 0))
                      : 'Not set'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button
                  onClick={() => openForm(budgets.find(b => !b.category_id && !b.description))}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-200 transition"
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Wallet size={20} className="text-slate-400" />
                <h3 className="text-lg font-black text-slate-900">Additional Budgets</h3>
                <span className="text-xs text-slate-400 font-medium">({additionalBudgets.length})</span>
              </div>
              {additionalBudgets.length > 0 ? (
                <div className="space-y-3">
                  {additionalBudgets.map((budget) => (
                    <div
                      key={budget.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                          {budget.category ? (
                            <span className="text-sm">{budget.category.icon}</span>
                          ) : (
                            <TrendingDown size={16} className="text-amber-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">
                            {budget.description || budget.category?.name || 'Budget'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatCurrency(budget.amount)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openForm(budget)}
                          className="p-1.5 hover:bg-white rounded-lg transition"
                        >
                          <Edit2 size={14} className="text-slate-400" />
                        </button>
                        <button
                          onClick={() => handleDelete(budget)}
                          className="p-1.5 hover:bg-rose-50 rounded-lg transition"
                        >
                          <Trash2 size={14} className="text-rose-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No additional budgets added</p>
              )}
            </div>
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
                  {editingBudget ? 'Update Budget' : (hasBaseBudget ? 'Add Additional Budget' : 'Set Monthly Budget')}
                </h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">
                  {editingBudget
                    ? 'Update your budget amount.'
                    : hasBaseBudget
                      ? 'Add extra funds to your monthly budget.'
                      : `Define your budget for ${MONTH_NAMES[currentMonth - 1]} ${currentYear}.`
                  }
                </p>

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
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-xl font-black text-slate-900 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">
                      Description <span className="text-slate-300">(optional)</span>
                    </label>
                    <div className="relative">
                      <Tag size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                      value={formData.category_id || ''}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                    >
                      <option value="">No category (general budget)</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-4 rounded-2xl font-black text-white bg-[#636B2F] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/10"
                  >
                    {saving ? (
                      <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      editingBudget ? 'Update Budget' : 'Save Budget'
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