"use client";

import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { AdminDashboardData } from '@/types';
import { Users, Receipt, LayoutGrid, SplitSquareVertical, Target, Crown, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const CAT_COLORS = ['#636B2F', '#E8D5B7', '#1A1A2E', '#4A7C59', '#C4956A', '#8B5E3C', '#A8C5A0', '#D4A574', '#2E4A3A', '#B8864E', '#6B8E5A', '#DDB892'];

const timeAgo = (iso: string) => {
  const now = Date.now();
  const then = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
  const diff = (now - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
};

const formatCurrency = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (v >= 1_000_000) return `৳${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `৳${(v / 1_000).toFixed(1)}K`;
  return `৳${v.toFixed(0)}`;
};

const formatNumber = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return v.toLocaleString();
};

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load admin data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-12 h-12 border-[5px] border-[#636B2F]/10 border-t-[#636B2F] rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-rose-700 font-bold text-sm">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { overview, expenses_trend, category_distribution, top_contexts, top_users, recent_activity, user_growth } = data;

  const overviewCards = [
    { label: 'Total Users', value: formatNumber(overview.total_users), icon: Users, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total Expenses', value: formatNumber(overview.total_expenses), icon: Receipt, color: 'bg-blue-50 text-blue-600' },
    { label: 'Contexts', value: formatNumber(overview.total_contexts), icon: LayoutGrid, color: 'bg-violet-50 text-violet-600' },
    { label: 'Splits', value: formatNumber(overview.total_splits), icon: SplitSquareVertical, color: 'bg-orange-50 text-orange-600' },
    { label: 'Budgets', value: formatNumber(overview.total_budgets), icon: Target, color: 'bg-cyan-50 text-cyan-600' },
    { label: 'Premium', value: formatNumber(overview.premium_users), icon: Crown, color: 'bg-amber-50 text-amber-600' },
    { label: 'Free Users', value: formatNumber(overview.free_users), icon: Users, color: 'bg-slate-50 text-slate-600' },
    { label: 'Est. MRR', value: `$${overview.estimated_mrr.toLocaleString()}`, icon: DollarSign, color: 'bg-green-50 text-green-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">System-wide overview across all users, contexts, and expenses</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {overviewCards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2.5 rounded-xl ${card.color}`}>
                <card.icon size={18} />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{card.value}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Trend Chart */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider mb-1">Expense Trend</h3>
          <p className="text-xs text-slate-400 font-medium mb-6">Monthly expense volume (last 24 months)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenses_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip formatter={(value: number) => formatNumber(value)} />
                <Bar dataKey="count" fill="#636B2F" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider mb-1">Category Distribution</h3>
          <p className="text-xs text-slate-400 font-medium mb-6">Expenses by category (all-time %)</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={category_distribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(value: number) => `${value}%`} />
                <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                  {category_distribution.map((_, idx) => (
                    <Cell key={idx} fill={CAT_COLORS[idx % CAT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Contexts */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 pb-4">
            <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Top Contexts</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">By total spent</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-100 bg-slate-50/50">
                  <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-right px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Members</th>
                  <th className="text-right px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Expenses</th>
                  <th className="text-right px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {top_contexts.map((ctx, idx) => (
                  <tr key={ctx.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{idx + 1}</span>
                        <span className="font-bold text-slate-800">{ctx.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${ctx.type === 'group' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {ctx.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-600">{ctx.member_count}</td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-600">{formatNumber(ctx.expense_count)}</td>
                    <td className="px-6 py-3.5 text-right font-extrabold text-slate-900">{formatCurrency(ctx.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top 10 Users */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 pb-4">
            <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Top Users</h3>
            <p className="text-xs text-slate-400 font-medium mt-1">By total spent</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-100 bg-slate-50/50">
                  <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="text-right px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Expenses</th>
                  <th className="text-right px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {top_users.map((u, idx) => (
                  <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{idx + 1}</span>
                        <span className="font-bold text-slate-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-600">{formatNumber(u.expense_count)}</td>
                    <td className="px-6 py-3.5 text-right font-extrabold text-slate-900">{formatCurrency(u.total_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="p-6 pb-4">
          <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider">Recent Activity</h3>
          <p className="text-xs text-slate-400 font-medium mt-1">Latest expenses across all contexts</p>
        </div>
        <div className="divide-y divide-slate-50">
          {recent_activity.map((act) => (
            <div key={act.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 flex-shrink-0">
                  {act.category_name?.[0] || '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{act.note || 'No note'}</p>
                  <p className="text-xs text-slate-400 font-medium">
                    {act.user_name} in <span className="text-slate-500">{act.context_name}</span>
                    {act.category_name && <span> · {act.category_name}</span>}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0 ml-4">
                <p className="font-extrabold text-slate-900">{formatCurrency(act.amount)}</p>
                <p className="text-[10px] text-slate-400 font-medium">{timeAgo(act.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
