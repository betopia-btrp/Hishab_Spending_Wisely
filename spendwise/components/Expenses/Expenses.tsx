/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { useEffect, useState } from 'react';
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, CheckCircle, Calendar, Tag } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';
import { Expense, Category } from '@/types';
import NewExpenseModal from './NewExpenseModal';

export default function Expenses() {
  const { currentContext } = useAppContext();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const fetchData = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      const [expRes, catRes] = await Promise.all([
        api.get(`/auth/expenses?context_id=${currentContext.id}`),
        api.get(`/auth/categories?context_id=${currentContext.id}`)
      ]);
      const expData = expRes.data.data || expRes.data;
      const catData = catRes.data.data || catRes.data;
      setExpenses(Array.isArray(expData) ? expData : []);
      setCategories(Array.isArray(catData) ? catData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentContext]);

  const filteredExpenses = expenses.filter(e => 
    e.note?.toLowerCase().includes(search.toLowerCase()) ||
    e.category?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Transaction Ledger</h2>
          <p className="text-sm text-slate-500 font-medium">Manage and audit all expenses in this context</p>
        </div>
        <button 
          onClick={() => { console.log('Opening modal'); setShowModal(true); }}
          className="bg-[#636B2F] text-white px-6 py-3 rounded-2xl font-extrabold shadow-lg shadow-emerald-200 hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Log New Expense
        </button>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-4">
        <div className="flex-1 w-full flex items-center bg-white border border-slate-200 px-5 py-3 rounded-2xl focus-within:ring-4 focus-within:ring-[#636B2F]/10 focus-within:border-[#636B2F] transition-all shadow-sm">
          <Search size={18} className="text-slate-400 font-bold" />
          <input 
            type="text" 
            placeholder="Search by vendor, category, or note..." 
            className="bg-transparent border-none focus:ring-0 text-sm ml-3 w-full outline-none font-medium placeholder:text-slate-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold flex items-center justify-center hover:bg-slate-50 shadow-sm transition-all text-slate-600">
            <Calendar size={18} className="mr-2" />
            Date Range
          </button>
          <button className="flex-1 lg:flex-none px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold flex items-center justify-center hover:bg-slate-50 shadow-sm transition-all text-slate-600">
            <Filter size={18} className="mr-2" />
            Filters
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Transaction Date</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Note</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Category</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Payer</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Amount</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-20 text-slate-400 font-bold uppercase tracking-widest text-xs">Syncing with ledger...</td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-20 text-slate-400 italic">No transactions found matching your criteria.</td></tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/50 transition group">
                    <td className="px-8 py-5 whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-600">{new Date(expense.expense_date || expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-extrabold text-slate-900">{expense.note || expense.description || '-'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="inline-flex items-center px-3 py-1 bg-slate-100 rounded-full">
                        <span className="mr-2 text-xs">{expense.category?.icon || '💰'}</span>
                        <span className="text-[11px] text-slate-600 font-black uppercase tracking-tight">{expense.category?.name || 'Uncategorized'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                       <div className="flex items-center">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-[10px] flex items-center justify-center font-black text-blue-700 mr-3 uppercase shadow-sm">
                            {expense.user?.name?.charAt(0) || '?'}
                          </div>
                          <span className="text-sm text-slate-600 font-bold">{expense.user?.name || 'Unknown'}</span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-right whitespace-nowrap">
                      <span className="text-base font-black text-slate-900">{formatCurrency(expense.amount)}</span>
                    </td>
                    <td className="px-8 py-5 whitespace-nowrap">
                      {expense.is_settled ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 shadow-sm shadow-emerald-50">
                          <CheckCircle size={12} className="mr-1.5" />
                          Settled
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 shadow-sm shadow-amber-50">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-700 transition" title="Edit"><Edit2 size={14} /></button>
                        <button className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-slate-50/50 px-8 py-4 border-t border-slate-100 flex items-center justify-between">
           <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Showing {filteredExpenses.length} entries</p>
           <div className="flex gap-2">
             <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-400 cursor-not-allowed">Previous</button>
             <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50">Next Page</button>
           </div>
        </div>
      </div>
      
      {showModal && currentContext && (
        <NewExpenseModal 
          contextId={currentContext.id} 
          onClose={() => setShowModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}