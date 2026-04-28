"use client";

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Receipt, X, Check, Loader2, Users } from 'lucide-react';
import api from '@/lib/axios';
import { formatCurrency } from '@/lib/utils';
import { Category, ContextMember, ContextType } from '@/types';
import { useAppContext } from '@/contexts/AppContext';

interface NewExpenseModalProps {
  contextId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type SplitType = 'none' | 'equal' | 'custom' | 'percentage';

interface MemberSplit {
  user_id: string;
  name: string;
  share_amount: string;
  percentage: string;
}

export default function NewExpenseModal({ contextId, onClose, onSuccess }: NewExpenseModalProps) {
  const { currentContext } = useAppContext();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<ContextMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const isGroup = currentContext?.type === ContextType.GROUP;
  const [splitType, setSplitType] = useState<SplitType>(isGroup ? 'equal' : 'none');
  const [memberSplits, setMemberSplits] = useState<MemberSplit[]>([]);

  useEffect(() => {
    if (!isGroup) return;
    const fetchMembers = async () => {
      setMembersLoading(true);
      try {
        const res = await api.get(`/contexts/${contextId}`);
        const ctx = res.data;
        if (ctx.members && Array.isArray(ctx.members)) {
          setMembers(ctx.members);
        }
      } catch (err: any) {
        console.error('[Members] Failed to fetch:', err);
      } finally {
        setMembersLoading(false);
      }
    };
    fetchMembers();
  }, [contextId, isGroup]);

  useEffect(() => {
    if (!isGroup) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0 || members.length === 0) {
      setMemberSplits([]);
      return;
    }
    const equalShare = parsed / members.length;
    setMemberSplits(
      members.map((m) => ({
        user_id: m.user_id,
        name: m.user?.name || 'Unknown',
        share_amount: equalShare.toFixed(2),
        percentage: (100 / members.length).toFixed(1),
      }))
    );
  }, [amount, members, isGroup]);

  const activeMemberSplits = useMemo(() => {
    if (!isGroup || memberSplits.length === 0) return [];
    if (splitType === 'equal') return memberSplits;
    return memberSplits;
  }, [memberSplits, splitType, isGroup]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get(`/categories?context_id=${contextId}`);
        const data = res.data.data || res.data;
        setCategories(Array.isArray(data) ? data : (data.system || []).concat(data.custom || []));
      } catch (err: any) {
        console.error('[Categories] Error:', err);
        setCategories([]);
      }
    };
    fetchCategories();
  }, [contextId]);

  const updateCustomAmount = (userId: string, value: string) => {
    setMemberSplits((prev) =>
      prev.map((s) => (s.user_id === userId ? { ...s, share_amount: value } : s))
    );
  };

  const updatePercentage = (userId: string, value: string) => {
    setMemberSplits((prev) =>
      prev.map((s) => (s.user_id === userId ? { ...s, percentage: value } : s))
    );
  };

  const validateSplits = (): string | null => {
    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) return 'Amount is required.';

    if (splitType === 'custom') {
      const totalSplit = memberSplits.reduce(
        (sum, s) => sum + (parseFloat(s.share_amount) || 0), 0
      );
      if (Math.abs(totalSplit - totalAmount) > 0.01) {
        return `Split amounts must sum to ${formatCurrency(totalAmount)}. Currently: ${formatCurrency(totalSplit)}.`;
      }
    }

    if (splitType === 'percentage') {
      const totalPct = memberSplits.reduce(
        (sum, s) => sum + (parseFloat(s.percentage) || 0), 0
      );
      if (Math.abs(totalPct - 100) > 0.1) {
        return `Percentages must sum to 100%. Currently: ${totalPct.toFixed(1)}%.`;
      }
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateSplits();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        context_id: contextId,
        amount: Number(amount),
        category_id: categoryId || null,
        note: note || null,
        expense_date: date,
        split_type: splitType,
      };

      if (splitType === 'custom') {
        payload.splits = memberSplits.map((s) => ({
          user_id: s.user_id,
          share_amount: parseFloat(s.share_amount),
        }));
      } else if (splitType === 'percentage') {
        payload.splits = memberSplits.map((s) => ({
          user_id: s.user_id,
          percentage: parseFloat(s.percentage),
        }));
      }

      await api.post('/expenses', payload);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
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

            {isGroup && (
              <div className="border-t border-slate-100 pt-5">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                  <Users size={14} className="inline mr-1.5 -mt-0.5" />
                  Split Type
                </label>

                <div className="flex gap-2 mb-4">
                  {(['equal', 'custom', 'percentage', 'none'] as SplitType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSplitType(type)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        splitType === type
                          ? 'bg-[#636B2F] text-white shadow-md'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {type === 'none' ? 'No Split' : type}
                    </button>
                  ))}
                </div>

                {membersLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={18} className="animate-spin text-slate-400" />
                    <span className="ml-2 text-xs text-slate-400 font-bold">Loading members...</span>
                  </div>
                )}

                {!membersLoading && splitType !== 'none' && activeMemberSplits.length > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {splitType === 'equal' && 'Splitting equally among members'}
                      {splitType === 'custom' && 'Enter each member\'s share'}
                      {splitType === 'percentage' && 'Enter each member\'s percentage'}
                    </p>
                    {activeMemberSplits.map((s, i) => (
                      <div key={s.user_id} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#636B2F]/10 flex items-center justify-center text-[#636B2F] text-xs font-black shrink-0">
                          {s.name[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-slate-700 flex-1 truncate">{s.name}</span>
                        {splitType === 'custom' && (
                          <div className="relative w-28">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">৳</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={s.share_amount}
                              onChange={(e) => updateCustomAmount(s.user_id, e.target.value)}
                              className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all"
                            />
                          </div>
                        )}
                        {splitType === 'percentage' && (
                          <div className="flex items-center gap-2">
                            <div className="relative w-20">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={s.percentage}
                                onChange={(e) => updatePercentage(s.user_id, e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#636B2F]/10 focus:border-[#636B2F] transition-all text-right"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                            </div>
                            <span className="text-xs text-slate-400 font-bold w-16 text-right">
                              {formatCurrency((parseFloat(s.percentage) || 0) / 100 * (parseFloat(amount) || 0))}
                            </span>
                          </div>
                        )}
                        {splitType === 'equal' && (
                          <span className="text-sm font-bold text-slate-600">{formatCurrency(parseFloat(s.share_amount))}</span>
                        )}
                      </div>
                    ))}
                    {splitType === 'custom' && (
                      <div className="flex justify-end pt-2 border-t border-slate-200">
                        <span className="text-xs font-bold text-slate-500">
                          Total: {formatCurrency(memberSplits.reduce((sum, s) => sum + (parseFloat(s.share_amount) || 0), 0))} / {formatCurrency(parseFloat(amount) || 0)}
                        </span>
                      </div>
                    )}
                    {splitType === 'percentage' && (
                      <div className="flex justify-end pt-2 border-t border-slate-200">
                        <span className="text-xs font-bold text-slate-500">
                          Total: {memberSplits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
