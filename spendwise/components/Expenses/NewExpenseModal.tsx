/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Receipt, X, Check, Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';
import { Category } from '@/types';

interface NewExpenseModalProps {
  contextId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewExpenseModal({ contextId, onClose, onSuccess }: NewExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        console.log('[Categories] Fetching with contextId:', contextId);
        const res = await api.get(`/auth/categories?context_id=${contextId}`);
        console.log('[Categories] Response:', res.data);
        const data = res.data.data || res.data;
        setCategories(Array.isArray(data) ? data : (data.system || []).concat(data.custom || []));
      } catch (err: any) {
        console.error('[Categories] Error:', err.response?.status, err.response?.data || err.message);
        setCategories([]);
      }
    };
    fetchCategories();
  }, [contextId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/expenses', {
        context_id: contextId,
        amount: Number(amount),
        category_id: categoryId || null,
        note: note || null,
        expense_date: date,
        split_type: 'equal',
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('[Expense] Full error:', err.response?.data, err.message);
      setError(err.response?.data?.message || JSON.stringify(err.response?.data?.errors) || 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100"
      >
        <div className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-[#636B2F]">
              <Receipt size={28} />
          </div>
          <button 
            onClick={onClose} 
              className="p-2 hover:bg-slate-50 rounded-xl transition text-slate-400 font-bold"
          >
              ✕
          </button>
        </div>

          <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Log New Expense</h3>
          <p className="text-slate-500 font-medium leading-relaxed mb-6">
            Record a new transaction in your ledger.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Amount</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-lg">৳</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-10 pr-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-lg font-black text-slate-900 outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                >
                  <option value="">Select category (optional)</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
            </div>
            
<div className="col-span-2">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add any additional details..."
                  rows={2}
                  className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-slate-900 font-bold outline-none focus:ring-4 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all resize-none"
                />
              </div>
            </div>

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
                  Expense Added <Check size={20} />
              </>
            ) : (
                'Add Expense'
            )}
          </button>
        </form>
        </div>
      </motion.div>
    </div>
  );
}
