/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";
 
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { TrendingUp, CreditCard, Users, ArrowUpRight, Plus, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/axios';
import { useAppContext } from '@/contexts/AppContext';
import { DashboardSummary } from '@/types';
import NewExpenseModal from '@/components/(Expenses)/NewExpenseModal';

export default function Dashboard() {
  const { currentContext } = useAppContext();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchDashboard = async () => {
    if (!currentContext) return;
    setLoading(true);
    try {
      const [dashRes, expensesRes, budgetRes] = await Promise.all([
        api.get(`/auth/dashboard`, { params: { context_id: currentContext.id } }),
        api.get(`/auth/expenses`, { params: { context_id: currentContext.id } }),
        api.get(`/auth/budgets`, {
          params: {
            context_id: currentContext.id,
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
        }),
      ]);
        
      const expenses = (expensesRes.data.data || expensesRes.data) as any[];
      const totalSpent = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
      
      const budgets = Array.isArray(budgetRes.data)
        ? budgetRes.data
        : budgetRes.data?.budgets ?? budgetRes.data?.data ?? [];
      const totalBudget = budgets.reduce((sum: number, b: any) => {
        const amt = b.budget ?? b.amount ?? 0;
        return sum + Number(amt);
      }, 0);
      
      const categoryMap = new Map();
      expenses.forEach((e: any) => {
        const catName = e.category?.name || 'Other';
        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, { name: catName, amount: 0, color: '#636B2F' });
        }
        const entry = categoryMap.get(catName);
        entry.amount += Number(e.amount);
      });
      
      const byCategory = Array.from(categoryMap.values());
      
      setData({
        total_spent_month: totalSpent,
        your_balance: dashRes.data.total_spent - totalBudget,
        member_count: dashRes.data.member_count || 0,
        total_budget: totalBudget,
        expenses_by_category: byCategory,
        monthly_comparison: { current: totalSpent, previous: 0 },
        recent_expenses: expenses.slice(0, 5) || [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [currentContext]);
  // Add after: useEffect(() => { fetchDashboard(); }, [currentContext]);
  useEffect(() => {
  const handler = () => fetchDashboard();
  window.addEventListener('budget-updated', handler);
  return () => window.removeEventListener('budget-updated', handler);
}, [currentContext]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = [
    { label: 'Total Spent', value: data?.total_spent_month || 0, icon: CreditCard, color: 'text-[#636B2F]', bg: 'bg-emerald-50', onClick: () => {} },
    { label: 'Budget', value: data?.total_budget || 0, icon: TrendingUp, color: 'text-[#636B2F]', bg: 'bg-[#636B2F]/5', onClick: () => {} },
    { label: 'Active Members', value: data?.member_count || 1, icon: Users, color: 'text-[#636B2F]', bg: 'bg-emerald-50', onClick: () => {} },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Financial Overview</h2>
          <p className="text-slate-500">Summary for <span className="font-semibold text-slate-700">{currentContext?.name}</span> context</p>
        </div>
        <div className="flex gap-2">
           <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 transition shadow-sm">
             <Download size={16} />
             Export
           </button>
           <button 
             onClick={() => setShowModal(true)}
             className="flex items-center gap-2 bg-[#636B2F] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 shadow-md transition"
           >
             <Plus size={16} />
             Add Expense
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <button 
            key={stat.label} 
            onClick={stat.onClick}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4 hover:shadow-md transition text-left"
          >
            <div className={`${stat.bg} ${stat.color} p-3 rounded-xl`}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-extrabold text-slate-900">
                {typeof stat.value === 'number' ? formatCurrency(stat.value) : stat.value}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Spending Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.expenses_by_category || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                 />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {(data?.expenses_by_category || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || '#636B2F'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Quick Activity</h3>
          <div className="space-y-4">
            {data?.recent_expenses.length === 0 ? (
              <p className="text-slate-400 text-center py-8 italic text-sm">No recent transactions</p>
            ) : (
              data?.recent_expenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg shadow-sm">
                      {expense.category?.icon || '💰'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 truncate max-w-[120px]">{expense.note || '-'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{expense.category?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">-{formatCurrency(expense.amount)}</p>
                  </div>
                </div>
              ))
            )}
            <button className="w-full text-center py-2 text-xs font-bold text-blue-600 hover:text-blue-700 transition">View History</button>
          </div>
        </div>
      </div>

      {showModal && currentContext && (
        <NewExpenseModal
          contextId={currentContext.id}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchDashboard(); }}
        />
      )}
    </div>
  );
}