"use client";

import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { AdminDashboardData } from '@/types';
import {
  Users, Receipt, LayoutGrid, SplitSquareVertical, Target, Crown,
  CreditCard, TrendingUp, Activity, Clock, Sun, Calendar,
  BarChart3, PieChart, ArrowUpRight
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart as RechartsPie, Pie, Cell
} from 'recharts';

const COLORS = ['#636B2F', '#E8D5B7', '#4A7C59', '#C4956A', '#8B5E3C', '#A8C5A0', '#D4A574', '#2E4A3A', '#B8864E', '#6B8E5A', '#DDB892', '#1A1A2E'];
const PIE = ['#636B2F', '#E8D5B7', '#4A7C59', '#C4956A', '#8B5E3C'];

const nf = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (v >= 1_000_000) return `৳${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `৳${(v / 1_000).toFixed(1)}K`;
  return `৳${v.toFixed(0)}`;
};

const nn = (n: string | number) => {
  const v = typeof n === 'string' ? parseFloat(n) : n;
  return v.toLocaleString();
};

const tabs = [
  { key: 'overview', label: 'Platform Pulse', icon: Activity },
  { key: 'spending', label: 'Spending Deep Dive', icon: BarChart3 },
  { key: 'users', label: 'Users & Contexts', icon: Users },
] as const;

type Tab = typeof tabs[number]['key'];

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => {
        const raw = r.data;
        const toNum = (arr: any[], fields: string[]) =>
          arr?.forEach((d: any) => fields.forEach(f => { if (d[f] != null) d[f] = Number(d[f]); }));

        toNum(raw.category_distribution, ['count', 'percentage']);
        toNum(raw.daily_spending_30d, ['total']);
        toNum(raw.day_of_week, ['expenses', 'total_spent']);
        toNum(raw.hourly_activity, ['count']);
        toNum(raw.avg_ticket_by_category, ['avg_amount', 'sample_size']);
        toNum(raw.budget_vs_actual, ['budgeted', 'spent']);
        toNum(raw.forecast_accuracy, ['avg_projected', 'avg_actual', 'samples']);
        toNum(raw.expenses_trend, ['count', 'total']);
        toNum(raw.user_growth, ['signups']);
        toNum(raw.top_contexts, ['member_count', 'expense_count', 'total_spent']);
        toNum(raw.top_users, ['expense_count', 'total_spent']);
        toNum(raw.top_users_by_activity, ['expenses_logged']);
        toNum(raw.prolific_joiners, ['context_count']);
        toNum(raw.context_type_distribution, ['count']);
        toNum(raw.group_sizes, ['count']);
        toNum(raw.context_trend, ['contexts_created']);
        toNum(raw.split_type_distribution, ['count']);
        toNum(raw.settled_distribution, ['count']);
        toNum(raw.top_expenses, ['amount']);
        setData(raw);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
    </div>
  );

  if (!data) return null;

  const { overview, expenses_trend, user_growth, category_distribution, daily_spending_30d,
          day_of_week, split_type_distribution, settled_distribution, hourly_activity,
          avg_ticket_by_category, top_expenses, budget_vs_actual, forecast_accuracy,
          top_contexts, top_users, top_users_by_activity, prolific_joiners,
          context_type_distribution, group_sizes, context_trend, recent_activity } = data;

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>{children}</div>
  );

  const ChartCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );

  const Stat = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) => (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Admin</h1>
          <p className="text-sm text-slate-500">System analytics across all users</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 mb-8 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════ */}
      {/* PLATFORM PULSE */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Scalars */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Total Users" value={nn(overview.total_users)} icon={Users} color="bg-emerald-50 text-emerald-600" />
            <Stat label="Total Expenses" value={nn(overview.total_expenses)} icon={Receipt} color="bg-blue-50 text-blue-600" />
            <Stat label="Total Spent" value={nf(overview.total_spent)} icon={CreditCard} color="bg-violet-50 text-violet-600" />
            <Stat label="Avg Expense" value={nf(overview.avg_expense)} icon={TrendingUp} color="bg-amber-50 text-amber-600" />
            <Stat label="Est. MRR" value={`\$${nn(overview.estimated_mrr)}`} icon={Crown} color="bg-rose-50 text-rose-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Free vs Premium */}
            <ChartCard title="Free vs Premium" subtitle="Plan distribution">
              <div className="h-52 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={[
                      { name: 'Free', value: overview.free_users },
                      { name: 'Premium ($9.99)', value: overview.premium_users },
                    ]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}
                      label={({ name, value }) => `${name}: ${value}`}>
                      <Cell fill="#E8D5B7" />
                      <Cell fill="#636B2F" />
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* User Growth */}
            <ChartCard title="User Growth" subtitle="Monthly signups + cumulative">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={user_growth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="signups" stroke="#636B2F" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Expense Trend */}
          <ChartCard title="Monthly Expense Volume" subtitle="24-month trend of expense count">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenses_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={v => {
                    const [y, m] = v.split('-');
                    return `${m}/${y.slice(2)}`;
                  }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => nn(v)} />
                  <Tooltip formatter={(v: number) => nn(v)} />
                  <Bar dataKey="count" fill="#636B2F" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* SPENDING DEEP DIVE */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'spending' && (
        <div className="space-y-4">
          {/* Row 1: Category bars */}
          <ChartCard title="Spending by Category" subtitle="Total spent per category">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={category_distribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={95} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                    {category_distribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Row 2: Daily 30d + Day of Week */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Daily Spending (30d)" subtitle="Aggregated daily totals">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily_spending_30d}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(8)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => nf(v)} />
                    <Tooltip formatter={(v: number) => nf(v)} />
                    <Bar dataKey="total" fill="#636B2F" radius={[3, 3, 0, 0]} opacity={0.8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Spending by Day of Week" subtitle="Friday peak (BD weekend)">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={day_of_week}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day_name" tick={{ fontSize: 9 }} tickFormatter={v => v.trim().slice(0, 3)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => nf(v)} />
                    <Tooltip formatter={(v: number) => nf(v)} />
                    <Bar dataKey="total_spent" fill="#4A7C59" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Row 3: Pies + Hourly */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard title="Split Type Usage" subtitle="How expenses are shared">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={split_type_distribution} dataKey="count" nameKey="split_type" cx="50%" cy="50%" outerRadius={60}
                      label={({ split_type, count }) => `${split_type}: ${count}`}>
                      {split_type_distribution.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Settlement Status" subtitle="Settled vs unsettled">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={settled_distribution} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60}
                      label={({ status, count }) => `${status}: ${count}`}>
                      <Cell fill="#636B2F" />
                      <Cell fill="#E8D5B7" />
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Hourly Activity" subtitle="When users log expenses">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourly_activity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickFormatter={v => `${v}h`} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#8B5E3C" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Row 4: Avg Ticket + Top Expenses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Average Expense by Category" subtitle="Rent & Housing has highest avg, Food lowest">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avg_ticket_by_category} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => nf(v)} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: number) => nf(v)} />
                    <Bar dataKey="avg_amount" radius={[0, 4, 4, 0]}>
                      {avg_ticket_by_category.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Top 10 Biggest Expenses" subtitle="Highest individual amounts">
              <div className="divide-y divide-slate-50">
                {top_expenses.map((e, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{e.note}</p>
                      <p className="text-xs text-slate-500">{e.user_name} · {e.category_name}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 ml-3">{nf(e.amount)}</p>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Budget vs Actual */}
          {budget_vs_actual.length > 0 && (
            <ChartCard title="Budget vs Actual" subtitle="This month's budgeted vs spent by category">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budget_vs_actual}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => nf(v)} />
                    <Tooltip />
                    <Bar dataKey="budgeted" fill="#94A3B8" radius={[3, 3, 0, 0]} name="Budgeted" />
                    <Bar dataKey="spent" fill="#636B2F" radius={[3, 3, 0, 0]} name="Spent" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          {/* Forecast Accuracy */}
          {forecast_accuracy.length > 0 && (
            <ChartCard title="Forecast Accuracy" subtitle="Last month's projected vs actual by category">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecast_accuracy}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => nf(v)} />
                    <Tooltip />
                    <Bar dataKey="avg_projected" fill="#94A3B8" radius={[3, 3, 0, 0]} name="Projected" />
                    <Bar dataKey="avg_actual" fill="#636B2F" radius={[3, 3, 0, 0]} name="Actual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* USERS & CONTEXTS */}
      {/* ════════════════════════════════════════════ */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Context Type + Group Sizes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Context Types" subtitle="Personal vs Group workspaces">
              <div className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={context_type_distribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={70}
                      label={({ type, count }) => `${type}: ${count}`}>
                      <Cell fill="#636B2F" />
                      <Cell fill="#E8D5B7" />
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Group Size Distribution" subtitle="How many members per group">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={group_sizes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4A7C59" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Top Contexts Table */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Top Contexts by Spending</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Members</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Expenses</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {top_contexts.map((c, i) => (
                    <tr key={c.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-800">{c.name}</span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          c.type === 'group' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>{c.type}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-medium text-slate-600">{c.member_count}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-600">{nn(c.expense_count)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900">{nf(c.total_spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 3 Top User Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartCard title="Top Spenders" subtitle="By total spent">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top_users} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => nf(v)} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} />
                    <Tooltip formatter={(v: number) => nf(v)} />
                    <Bar dataKey="total_spent" fill="#636B2F" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Most Active" subtitle="By expense count">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top_users_by_activity} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} />
                    <Tooltip />
                    <Bar dataKey="expenses_logged" fill="#4A7C59" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Most Prolific Joiners" subtitle="Contexts per user">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prolific_joiners} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} />
                    <Tooltip />
                    <Bar dataKey="context_count" fill="#C4956A" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Context Creation Trend + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Context Creation Trend" subtitle="Personal vs Group over time">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={context_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="contexts_created" fill="#636B2F" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <Card>
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {recent_activity.slice(0, 12).map(a => (
                  <div key={a.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                        {a.category_name?.[0] || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{a.note || 'No note'}</p>
                        <p className="text-xs text-slate-500">{a.user_name} · {a.context_name}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 ml-3">{nf(a.amount)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
