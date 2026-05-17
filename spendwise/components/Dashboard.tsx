"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  CreditCard,
  Users,
  ArrowUpRight,
  Plus,
  Download,
  TrendingDown,
  Wallet,
  Receipt,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import api from "@/lib/axios";
import { useAppContext } from "@/contexts/AppContext";
import { ContextType, DashboardSummary, ContextMember, PeriodPreset, ForecastData } from "@/types";
import NewExpenseModal from "@/components/(Expenses)/NewExpenseModal";
import PeriodSelector from "@/components/Dashboard/PeriodSelector";
import BudgetHealthCard from "@/components/Dashboard/BudgetHealthCard";
import { getPeriodConfig } from "@/lib/period";

const CATEGORY_COLORS = [
  "#636B2F", "#8B5CF6", "#3B82F6", "#10B981",
  "#F59E0B", "#EF4444", "#EC4899", "#14B8A6",
  "#F97316", "#06B6D4", "#84CC16", "#A855F7",
];

function getMonthsInRange(dateFrom: string | undefined, dateTo: string | undefined): { month: number; year: number }[] {
  if (!dateFrom || !dateTo) return [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const months: { month: number; year: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export default function Dashboard() {
  const { currentContext } = useAppContext();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodPreset>("this_month");

  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [budgetList, setBudgetList] = useState<any[]>([]);

  const isGroup = currentContext?.type === ContextType.GROUP;
  const inviteCode = currentContext?.invite_code;

  const handleCopyCode = useCallback(async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [inviteCode]);

  const fetchForecast = useCallback(async (contextId: string) => {
    setForecastLoading(true);
    setForecastData([]);
    try {
      const period = getPeriodConfig("this_month");
      await api.post("/forecasts/run");
      const freshRes = await api.get("/forecasts", {
        params: { context_id: contextId, month: period.month, year: period.year },
      });
      const fresh = freshRes.data?.forecasts || [];
      setForecastData(fresh.filter((f: any) => f.context_id === contextId));
    } catch (err) {
      console.error(err);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    if (!currentContext) return;
    setLoading(true);
    setFetchError(false);
    const period = getPeriodConfig(selectedPeriod);
    try {

      const params: Record<string, string | number> = {
        context_id: currentContext.id,
        period: selectedPeriod,
      };
      if (period.month) params.month = period.month;
      if (period.year) params.year = period.year;

      const expenseParams: Record<string, string | number> = {
        context_id: currentContext.id,
        per_page: 100,
      };
      if (period.dateFrom) expenseParams.date_from = period.dateFrom;
      if (period.dateTo) expenseParams.date_to = period.dateTo;

      const [dashRes, expensesRes] = await Promise.all([
        api.get(`/dashboard`, { params }),
        api.get(`/expenses`, { params: expenseParams }),
      ]);

      const expenses = (expensesRes.data.data || expensesRes.data) as any[];

      const monthsInPeriod = getMonthsInRange(period.dateFrom, period.dateTo);
      let allBudgets: any[] = [];
      if (monthsInPeriod.length > 0) {
        const budgetResponses = await Promise.all(
          monthsInPeriod.map((m) =>
            api.get(`/budgets`, {
              params: { context_id: currentContext.id, month: m.month, year: m.year },
            }).catch(() => ({ data: { budgets: [] } }))
          )
        );
        allBudgets = budgetResponses.flatMap((r: any) =>
          Array.isArray(r.data) ? r.data : (r.data?.budgets ?? r.data?.data ?? [])
        );
      } else if (selectedPeriod === "all_time") {
        const aggRes = await api.get(`/budgets/aggregated`, {
          params: { context_id: currentContext.id },
        }).catch(() => ({ data: { budgets: [] } }));
        allBudgets = aggRes.data?.budgets ?? [];
      }

      const categorySpent = new Map<string, number>();
      expenses.forEach((e: any) => {
        const catId = e.category?.id || '__uncategorized__';
        categorySpent.set(catId, (categorySpent.get(catId) || 0) + Number(e.amount));
      });
      const overallSpent = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

      const deduped = Array.from(
        allBudgets.reduce((map: Map<string, any>, b: any) => {
          const key = b.category?.id || '__overall__';
          const amt = Number(b.budget ?? 0);
          if (map.has(key)) {
            map.get(key).budget += amt;
          } else {
            map.set(key, { ...b, budget: amt });
          }
          return map;
        }, new Map())
        .values()
      ).map((b: any) => {
        const spent = b.category?.id
          ? (categorySpent.get(b.category.id) || 0)
          : overallSpent;
        const budget = Number(b.budget);
        return {
          ...b,
          spent,
          percentage: budget > 0 ? Math.round(spent / budget * 100 * 100) / 100 : 0,
        };
      });
      const totalBudget = deduped.reduce((sum: number, b: any) => sum + Number(b.budget ?? 0), 0);
      setBudgetList(deduped);

      const categoryMap = new Map();
      let colorIdx = 0;
      expenses.forEach((e: any) => {
        const catName = e.category?.name || "Other";
        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, {
            name: catName,
            amount: 0,
            color: CATEGORY_COLORS[colorIdx % CATEGORY_COLORS.length],
          });
          colorIdx++;
        }
        const entry = categoryMap.get(catName);
        entry.amount += Number(e.amount);
      });

      const byCategory = Array.from(categoryMap.values());

      const totalSpent = dashRes.data.total_spent ?? 0;
      const previousSpent = dashRes.data.previous_spent ?? 0;

      setData({
        total_spent: Number(totalSpent),
        previous_spent: Number(previousSpent),
        period_label: dashRes.data.period_label || period.label,
        previous_period_label: dashRes.data.previous_period_label || null,
        your_balance: Number(dashRes.data.your_balance ?? 0),
        member_count: dashRes.data.member_count || 0,
        total_budget: totalBudget,
        budget_utilization: totalBudget > 0 ? totalSpent / totalBudget : 0,
        remaining_budget: totalBudget > 0 ? totalBudget - totalSpent : 0,
        expenses_by_category: byCategory,
        recent_expenses: expenses.slice(0, 5) || [],
        active_members: dashRes.data.active_members || [],
      });

      if (selectedPeriod === "this_month") {
        fetchForecast(currentContext.id);
      }
    } catch (err) {
      console.error(err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [currentContext, selectedPeriod, fetchForecast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const handler = () => fetchDashboard();
    window.addEventListener("budget-updated", handler);
    return () => window.removeEventListener("budget-updated", handler);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-[#636B2F]/20 border-t-[#636B2F] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <p className="text-slate-400 text-sm font-medium">Failed to load dashboard</p>
          <button
            onClick={fetchDashboard}
            className="text-xs font-bold text-[#636B2F] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const period = getPeriodConfig(selectedPeriod);
  const pctChange = data && data.previous_spent > 0
    ? ((data.total_spent - data.previous_spent) / data.previous_spent * 100)
    : null;

  const statCards: {
    label: string;
    value: number;
    icon: any;
    color: string;
    bg: string;
    change?: number | null;
    changeLabel?: string | null;
  }[] = [
    {
      label: "Spent",
      value: data?.total_spent || 0,
      icon: CreditCard,
      color: "text-[#636B2F]",
      bg: "bg-emerald-50",
      change: pctChange,
      changeLabel: data?.previous_period_label
        ? `vs ${data.previous_period_label}`
        : null,
    },
  ];

  if (data && data.total_budget > 0) {
    const isOver = data.remaining_budget < 0;
    statCards.push({
      label: "Budget",
      value: data.total_budget,
      icon: TrendingUp,
      color: "text-[#636B2F]",
      bg: "bg-[#636B2F]/5",
    });
    statCards.push({
      label: isOver ? "Over Budget" : "Remaining",
      value: isOver ? Math.abs(data.remaining_budget) : data.remaining_budget,
      icon: isOver ? TrendingDown : Wallet,
      color: isOver ? "text-rose-600" : "text-emerald-600",
      bg: isOver ? "bg-rose-50" : "bg-emerald-50",
    });
  }

  const gridCols = statCards.length === 1 ? "md:grid-cols-3" : "md:grid-cols-3";

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Financial Overview
          </h2>
          <p className="text-slate-500">
            <span className="font-semibold text-slate-700">
              {currentContext?.name}
            </span>
            <span> &middot; {data?.period_label || period.label}</span>
          </p>
          {isGroup && inviteCode && (
            <button
              onClick={handleCopyCode}
              className="mt-2 inline-flex items-center gap-2 bg-white border border-dashed border-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:border-[#636B2F] hover:text-[#636B2F] transition-all"
            >
              <span className="tracking-[0.15em]">{inviteCode}</span>
              <span className="text-[10px] uppercase tracking-wider">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.open('/?tab=expenses', '_self')}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 transition shadow-sm"
          >
            <Receipt size={16} />
            All Transactions
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

      <div className="flex flex-wrap gap-3">
        <PeriodSelector
          value={selectedPeriod}
          onChange={(preset) => setSelectedPeriod(preset)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`${stat.bg} ${stat.color} p-2.5 rounded-xl`}>
                <stat.icon size={18} />
              </div>
              {stat.change !== null && stat.change !== undefined && (
                <div className={cn(
                  "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                  stat.change >= 0
                    ? "bg-rose-50 text-rose-600"
                    : "bg-emerald-50 text-emerald-600"
                )}>
                  {stat.change >= 0
                    ? <ArrowUpRight size={12} />
                    : <TrendingDown size={12} />
                  }
                  {Math.abs(stat.change).toFixed(1)}%
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {stat.label}
            </p>
            <p className="text-xl font-extrabold text-slate-900 mt-0.5">
              {formatCurrency(stat.value)}
            </p>
            <p className="text-xs text-slate-400 font-medium mt-1">
              {data?.period_label}
            </p>
            {stat.changeLabel && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {stat.changeLabel}
              </p>
            )}
          </div>
        ))}
      </div>

      {budgetList.length > 0 && currentContext && (
        <BudgetHealthCard
          budgets={budgetList}
          contextId={currentContext.id}
          forecasts={forecastData}
          forecastLoading={forecastLoading}
          dateFrom={period.dateFrom}
          dateTo={period.dateTo}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-6">
            Spending by Category
            {data?.period_label && (
              <span className="text-sm font-medium text-slate-400 ml-2">
                &middot; {data.period_label}
              </span>
            )}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.expenses_by_category || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {(data?.expenses_by_category || []).map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color || "#636B2F"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {isGroup && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Users size={18} className="text-[#636B2F]" />
                Active Members ({data?.member_count || 0})
              </h3>
              <div className="space-y-3">
                {data?.active_members.map((member: ContextMember) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition"
                  >
                    <div className="w-9 h-9 rounded-full bg-[#636B2F]/10 flex items-center justify-center text-[#636B2F] text-sm font-black">
                      {(member.user?.name || "U")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {member.user?.name || "Unknown"}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {member.role === "admin" ? "Admin" : "Member"}
                      </p>
                    </div>
                  </div>
                ))}
                {(!data?.active_members || data.active_members.length === 0) && (
                  <p className="text-slate-400 text-center py-8 italic text-sm">
                    No active members
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-5">
              Recent Activity
              {data?.period_label && (
                <span className="text-sm font-medium text-slate-400 ml-2">
                  &middot; {data.period_label}
                </span>
              )}
            </h3>
          <div className="space-y-3">
            {data?.recent_expenses.length === 0 ? (
              <p className="text-slate-400 text-center py-10 text-sm">
                No transactions in this period
              </p>
            ) : (
              data?.recent_expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition group"
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                    expense.category?.name === "Food & Dining" ? "bg-orange-50 text-orange-600" :
                    expense.category?.name === "Travel" ? "bg-sky-50 text-sky-600" :
                    expense.category?.name === "Shopping" ? "bg-purple-50 text-purple-600" :
                    expense.category?.name === "Transportation" ? "bg-blue-50 text-blue-600" :
                    "bg-slate-100 text-slate-500"
                  )}>
                    <Receipt size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {expense.note || "-"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {expense.category?.name || "Uncategorized"}
                      </span>
                      <span className="text-[10px] text-slate-300">&middot;</span>
                      <span className="text-[10px] text-slate-400">
                        {(expense.expense_date || expense.created_at) ? new Date(expense.expense_date || expense.created_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mt-0.5">
                    <p className="text-sm font-extrabold text-rose-500">
                      -{formatCurrency(Number(expense.amount))}
                    </p>
                  </div>
                </div>
              ))
            )}
            <button
              onClick={() => window.open('/?tab=expenses', '_self')}
              className="w-full text-center py-2.5 text-xs font-bold text-[#636B2F] hover:bg-slate-50 rounded-xl transition"
            >
              View all transactions →
            </button>
          </div>
        </div>
        </div>
      </div>

      {showModal && currentContext && (
        <NewExpenseModal
          contextId={currentContext.id}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            fetchDashboard();
          }}
        />
      )}
    </div>
  );
}
