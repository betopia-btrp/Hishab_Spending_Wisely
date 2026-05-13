/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Target, Plus, Edit2, Trash2, TrendingDown, Wallet, Tag, Calendar, AlertTriangle, TrendingUp, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
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
  // Forecast data (from ml_forecasts)
  projected_amount?: number;
  alert_tier?: string | null;
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
  const [forecasting, setForecasting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const lastSuggestedNote = useRef('');
  const [currentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear] = useState(new Date().getFullYear());

  const hasBaseBudget = budgets.some(b => !b.category?.id && !b.description);
  const additionalBudgets = budgets.filter(b => b.category?.id || b.description);

  const fetchBudgets = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      const res = await api.get(`/budgets`, {
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
        category_id: b.category?.id || b.category_id || null,
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

      // Fetch forecasts for this context/month/year
      try {
        const forecastRes = await api.get('/forecasts', {
          params: {
            context_id: currentContext.id,
            month: currentMonth,
            year: currentYear,
          },
        });
        const forecastData = forecastRes.data?.forecasts || [];
        if (forecastData.length > 0) {
          setBudgets(prev => prev.map(b => {
            const catId = b.category?.id || null;
            const match = forecastData.find((f: any) => {
              const fCatId = f.category_id || null;
              if (catId === null && fCatId === null) return true;
              if (catId && fCatId && catId === fCatId) return true;
              return false;
            });
            if (match) {
              return {
                ...b,
                projected_amount: Number(match.projected_amount),
                alert_tier: match.alert_tier || null,
              };
            }
            return b;
          }));
          console.log('[Budgets] Forecast match:', forecastData.length, 'forecasts');
        }
      } catch (err) {
        // Forecast data is optional — don't block the UI
      }
    } catch (err: any) {
      console.error('[Budgets] Error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    if (!currentContext) return;
    try {
      const res = await api.get(`/categories?context_id=${currentContext.id}`);
      const data = res.data.data || res.data;
      setCategories(Array.isArray(data) ? data : (data.system || []).concat(data.custom || []));
    } catch (err: any) {
      console.error('[Categories] Error:', err.response?.data || err.message);
      setCategories([]);
    }
  };

  const runForecast = async () => {
    if (!currentContext) return;
    setForecasting(true);
    try {
      await api.post('/forecasts/run');
      await fetchBudgets();
    } catch (err) {
      console.error('[Forecast] Error:', err);
    } finally {
      setForecasting(false);
    }
  };

  const suggestCategory = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3 || trimmed === lastSuggestedNote.current) return;
    lastSuggestedNote.current = trimmed;
    setSuggesting(true);
    try {
      const res = await api.post('/expenses/suggest-category', { note: trimmed });
      const predictions = res.data.predictions;
      if (predictions && predictions.length > 0) {
        setSuggestedCategory(predictions[0].category_id);
        setFormData(prev => ({ ...prev, category_id: predictions[0].category_id }));
      }
    } catch {
      // silent fail
    } finally {
      setSuggesting(false);
    }
  }, []);

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

  const handleDelete = async (budget: BudgetCard) => {
    if (!confirm(`Delete${budget.description ? ` "${budget.description}"` : ' this budget'}?`)) return;
    try {
      await api.delete(`/budgets/${budget.id}`);
      await fetchBudgets();
    } catch (err) {
      console.error('Failed to delete budget', err);
    }
  };

  const openForm = (budget?: BudgetCard) => {
    if (budget) {
      setEditingBudget(budget);
      const amt = budget.budget ?? budget.amount;
      setFormData({
        amount: amt?.toString() ?? '',
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

  const totalBudget = budgets.reduce((sum, b) => {
    const amt = b.budget ?? b.amount ?? 0;
    return sum + Number(amt);
  }, 0);
  const totalSpent = budgets.reduce((sum, b) => {
    const spent = b.spent_amount ?? b.spent ?? 0;
    return sum + Number(spent);
  }, 0);
  const overallPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  // Sort budgets by urgency: overspend → on_track_exceed → warning → ok
  const sortedBudgets = [...budgets].sort((a, b) => {
    const order: Record<string, number> = { overspend: 0, on_track_exceed: 1, early_warning: 2, on_track: 3 };
    const aRank = order[a.alert_tier || a.status || 'on_track'] ?? 4;
    const bRank = order[b.alert_tier || b.status || 'on_track'] ?? 4;
    return aRank - bRank;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Budgets</h2>
          <p className="text-sm text-slate-500">
            {MONTH_NAMES[currentMonth - 1]} {currentYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runForecast}
            disabled={forecasting}
            className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-100 transition flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={forecasting ? 'animate-spin' : ''} />
            {forecasting ? 'Forecasting...' : 'Refresh'}
          </button>
          <button
            onClick={() => openForm()}
            className="text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 px-4 py-2 rounded-lg transition"
          >
            + Set Budget
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading budgets...</div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16">
          <Target size={36} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No budgets set</h3>
          <p className="text-sm text-slate-500 mb-6">Set a monthly budget to track your spending.</p>
          <button
            onClick={() => openForm()}
            className="text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 px-5 py-2.5 rounded-lg transition"
          >
            Create Your First Budget
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBudgets.map((budget) => {
            const pct = budget.percentage || (budget.budget > 0 ? (budget.spent / budget.budget) * 100 : 0);
            const isOver = (budget.alert_tier === 'overspend' || pct >= 100);
            const isWarning = (budget.alert_tier === 'on_track_exceed' || (pct >= 80 && pct < 100));

            return (
              <div
                key={budget.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow"
              >
                <div className="flex">
                  {/* Color strip */}
                  <div className={cn(
                    "w-1 shrink-0",
                    isOver ? 'bg-rose-500' :
                    isWarning ? 'bg-amber-400' :
                    'bg-emerald-400'
                  )} />

                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: name + description */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 text-sm">
                            {budget.description || budget.category?.name || 'Overall Budget'}
                          </h3>
                          <span className={cn(
                            "text-[11px] font-medium px-2 py-0.5 rounded-full",
                            isOver ? 'bg-rose-50 text-rose-600' :
                            isWarning ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                          )}>
                            {isOver ? 'Exceeded' : isWarning ? 'At risk' : 'On track'}
                          </span>
                        </div>
                        {budget.category?.name && budget.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{budget.category.name}</p>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openForm(budget)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                          <Edit2 size={13} className="text-slate-400" />
                        </button>
                        <button onClick={() => handleDelete(budget)} className="p-1.5 hover:bg-rose-50 rounded-lg transition">
                          <Trash2 size={13} className="text-rose-400" />
                        </button>
                      </div>
                    </div>

                    {/* Amounts row */}
                    <div className="flex items-baseline gap-3 mt-3">
                      <span className="text-lg font-semibold text-slate-900">{formatCurrency(budget.spent)}</span>
                      <span className="text-sm text-slate-400">of {formatCurrency(budget.budget)}</span>
                      {budget.projected_amount != null && budget.projected_amount > 0 && (
                        <>
                          <span className="text-slate-300 mx-1">→</span>
                          <span className={cn(
                            "text-sm font-medium",
                            isOver ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-slate-500'
                          )}>
                            projected {formatCurrency(budget.projected_amount)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isOver ? 'bg-rose-500' :
                          isWarning ? 'bg-amber-400' :
                          'bg-emerald-400'
                        )}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
                        Description <span className="text-slate-300">(optional)</span>
                      </label>
                      {suggesting && (
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> AI suggesting...
                        </span>
                      )}
                      {!suggesting && suggestedCategory && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <Sparkles size={10} /> AI suggested
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Tag size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        onBlur={() => suggestCategory(formData.description)}
                        placeholder="e.g., Shopping buffer, Travel fund"
                        className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">
                        Category <span className="text-slate-300">(optional)</span>
                      </label>
                    </div>
                    <select
                      value={formData.category_id || ''}
                      onChange={(e) => { setFormData({ ...formData, category_id: e.target.value }); setSuggestedCategory(''); lastSuggestedNote.current = ''; }}
                      className={`w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all ${
                        suggestedCategory && formData.category_id === suggestedCategory
                          ? 'bg-emerald-50 border-2 border-emerald-300'
                          : ''
                      }`}
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