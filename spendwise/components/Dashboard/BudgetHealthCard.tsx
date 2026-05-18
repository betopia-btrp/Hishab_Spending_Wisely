"use client";

import { useState, useEffect } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { ForecastData } from "@/types";
import api from "@/lib/axios";
import {
  Loader2, ChevronDown, ChevronRight, type LucideIcon,
  UtensilsCrossed, Plane, ShoppingBag, ShoppingCart, Car, Fuel,
  Lightbulb, Film, Heart, GraduationCap, Home, FileText,
  Briefcase, DollarSign, Smartphone, Package, Landmark,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface BudgetRow {
  id: string;
  category: { id: string; name: string; icon: string } | null;
  description: string | null;
  month: number;
  year: number;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: string;
}

interface BudgetHealthCardProps {
  budgets: BudgetRow[];
  contextId: string;
  forecasts: ForecastData[];
  forecastLoading: boolean;
  dateFrom?: string;
  dateTo?: string;
}

const CATEGORY_MAP: Record<string, LucideIcon> = {
  "food & dining": UtensilsCrossed, "food": UtensilsCrossed, "dining": UtensilsCrossed,
  "travel": Plane, "shopping": ShoppingBag, "groceries": ShoppingCart,
  "transport": Car, "transportation": Car, "fuel": Fuel, "gas": Fuel,
  "utilities": Lightbulb, "entertainment": Film, "health": Heart, "medical": Heart,
  "education": GraduationCap, "rent": Home, "housing": Home, "bills": FileText,
  "salary": Briefcase, "income": DollarSign, "subscription": Smartphone,
  "overall": Landmark, "base": Landmark,
};

function getCategoryIcon(catName: string | undefined): LucideIcon {
  if (!catName) return Landmark;
  return CATEGORY_MAP[catName.toLowerCase()] || Package;
}

const COLORS = {
  actual: "#636B2F",
  projected: "#F59E0B",
  budgetLine: "#EF4444",
};

function yTickFormat(v: number) {
  if (v >= 100000) return `৳${(v / 1000).toFixed(0)}k`;
  if (v >= 1000) return `৳${(v / 1000).toFixed(1)}k`;
  return `৳${v}`;
}

function BudgetRowChart({ budget, contextId, dateFrom, dateTo }: { budget: BudgetRow; contextId: string; dateFrom?: string; dateTo?: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const catId = budget.category?.id || null;
    const now = new Date();
    setLoading(true);
    setError(false);
    const params: Record<string, any> = {
      context_id: contextId,
      category_id: catId,
      month: budget.month,
      year: budget.year,
    };
    if (dateFrom && dateTo) {
      params.date_from = dateFrom;
      params.date_to = dateTo;
    }
    api.get("/dashboard/budget-history", { params })
      .then((res) => setData(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [budget.id, dateFrom, dateTo]);

  if (loading) return <div className="flex items-center justify-center py-6 text-slate-400"><Loader2 size={14} className="animate-spin mr-2" />Loading...</div>;
  if (error || !data?.daily?.length) return <div className="flex items-center justify-center py-6 text-slate-400 text-xs">Could not load history</div>;

  const budgetLine = budget.budget || data.budget_amount;
  const totalDays = data.daily.length;
  const labelEvery = totalDays > 60 ? Math.ceil(totalDays / 8) : totalDays > 20 ? 5 : 1;

  // Detect today in the data
  const now = new Date();
  const todayLabel = `${String(now.getDate()).padStart(2, '0')} ${now.toLocaleString('en-US', { month: 'short' })}`;
  const todayIdx = data.daily.findIndex((d: any) => d.label === todayLabel);
  const hasForecast = data.forecast?.projected_amount && todayIdx >= 0;

  // Collect which indices get labels
  const labelIndices = new Set<number>();
  for (let i = 0; i < totalDays; i += labelEvery) labelIndices.add(i);
  labelIndices.add(totalDays - 1);
  if (todayIdx >= 0) labelIndices.add(todayIdx);

  // Build chart data: actual up to today, projected from today
  const chartData = data.daily.map((d: any, i: number) => ({
    day: d.day,
    label: labelIndices.has(i) ? d.label : "",
    actual: hasForecast && i > todayIdx ? null : d.actual,
    projected: null,
    isToday: i === todayIdx,
    isEnd: i === totalDays - 1,
  }));

  // Fill projected values from today onward
  if (hasForecast) {
    const actualSoFar = data.daily[todayIdx].actual;
    const remainingDays = totalDays - todayIdx - 1;
    const projectedTotal = data.forecast.projected_amount;

    // Start projection from tomorrow (today shows actual only)
    for (let i = todayIdx + 1; i < totalDays; i++) {
      const t = (i - todayIdx) / remainingDays;
      chartData[i].projected = Math.round(actualSoFar + (projectedTotal - actualSoFar) * t);
    }
    // Last point = exact projected total
    if (totalDays > 0) chartData[totalDays - 1].projected = Math.round(projectedTotal);
  }

  const categoryLabel = budget.category?.name ? `${budget.category.name} spending` : "All spending (Base budget)";
  const dateLabel = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(dateTo).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
    : "this period";

  return (
    <div className="overflow-visible">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-slate-500">
          {categoryLabel} · {dateLabel}
        </p>
        {budgetLine > 0 && (
          <p className="text-[10px] font-semibold" style={{ color: COLORS.budgetLine }}>
            Budget: {yTickFormat(budgetLine)}
          </p>
        )}
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: 500 }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickFormatter={yTickFormat}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                const proj = d.projected;
                const act = d.actual;
                return (
                  <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                    <p className="font-semibold text-slate-900">{d.label}</p>
                    {act !== null && <p className="text-emerald-600">Spent: <span className="font-semibold">{formatCurrency(act)}</span></p>}
                    {proj !== null && <p className="text-amber-600">Projected: <span className="font-semibold">{formatCurrency(proj)}</span></p>}
                    {d.isToday && hasForecast && (
                      <p className="text-amber-600 pt-1 border-t border-slate-100 mt-1">
                        On track for: <span className="font-semibold">{formatCurrency(data.forecast.projected_amount)}</span> by month end
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {budgetLine > 0 && (
              <ReferenceLine
                y={budgetLine}
                stroke={COLORS.budgetLine}
                strokeDasharray="4 3"
                strokeWidth={1.5}
              />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#059669"
              strokeWidth={2.5}
              dot={(props: any) => {
                if (props.payload.isToday) {
                  return (
                    <g>
                      <circle cx={props.cx} cy={props.cy} r={5} fill="#059669" stroke="white" strokeWidth={2.5} />
                    </g>
                  );
                }
                return <circle cx={props.cx} cy={props.cy} r={1.5} fill="#059669" strokeWidth={0} />;
              }}
              connectNulls={false}
              activeDot={{ r: 5, fill: "#059669", stroke: "white", strokeWidth: 2 }}
            />
            {hasForecast && (
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#D97706"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={(props: any) => {
                  if (props.payload.isToday) {
                    return <circle cx={props.cx} cy={props.cy} r={3} fill="#D97706" stroke="white" strokeWidth={2} />;
                  }
                  if (props.payload.isEnd) {
                    const labelY = props.cy > 60 ? props.cy - 12 : props.cy + 20;
                    return (
                      <g>
                        <circle cx={props.cx} cy={props.cy} r={5} fill="#D97706" stroke="white" strokeWidth={2.5} />
                        <rect x={props.cx - 30} y={labelY - 8} width={60} height={16} rx={4} fill="#FEF3C7" />
                        <text x={props.cx} y={labelY + 4} textAnchor="middle" fill="#D97706" fontSize={10} fontWeight={700}>
                          {yTickFormat(props.value)}
                        </text>
                      </g>
                    );
                  }
                  return <circle cx={props.cx} cy={props.cy} r={1.5} fill="#D97706" strokeWidth={0} />;
                }}
                connectNulls={true}
                activeDot={{ r: 5, fill: "#D97706", stroke: "white", strokeWidth: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-400">
        <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-[#059669]" />Actual</div>
        {hasForecast && <div className="flex items-center gap-1"><div className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: "#D97706" }} />Forecast</div>}
        <div className="flex items-center gap-1"><div className="w-3 h-0 border-t border-dashed" style={{ borderColor: COLORS.budgetLine }} />Budget cap</div>
      </div>
    </div>
  );
}

export default function BudgetHealthCard({ budgets, contextId, forecasts, forecastLoading, dateFrom, dateTo }: BudgetHealthCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (budgets.length === 0) return null;

  const forecastAlertMap = new Map<string, string>();
  forecasts.forEach(f => {
    if (f.alert_tier) forecastAlertMap.set(f.category_id || '__overall__', f.alert_tier);
  });

  const anyExceeded = budgets.some(b => b.percentage >= 100);
  const anyAtRisk = Array.from(forecastAlertMap.values()).some(t => t === 'on_track_exceed');
  const anyOverspent = Array.from(forecastAlertMap.values()).some(t => t === 'overspend');

  const statusColor = anyOverspent || anyExceeded ? "bg-rose-50 text-rose-600"
    : anyAtRisk ? "bg-amber-50 text-amber-600"
    : "bg-emerald-50 text-emerald-600";

  const statusLabel = anyOverspent || anyExceeded ? "Some exceeded"
    : anyAtRisk ? "At risk"
    : "On track";

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-900">Budget Health</h3>
          {forecastLoading && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Loader2 size={12} className="animate-spin" />Analyzing...
            </span>
          )}
        </div>
        <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", statusColor)}>{statusLabel}</span>
      </div>

      <div className="space-y-4">
        {budgets.map((budget) => {
          const Icon = getCategoryIcon(budget.category?.name);
          const pct = budget.percentage;
          const isOver = pct >= 100;
          const isExpanded = expandedId === budget.id;
          const barColor = pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

          return (
            <div key={budget.id}>
              <button
                onClick={() => setExpandedId(isExpanded ? null : budget.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Icon size={16} />
                    </div>
                    <span className="text-sm font-bold text-slate-900">{budget.category?.name || "Base"}</span>
                    {isExpanded ? <ChevronDown size={14} className="text-slate-300" /> : <ChevronRight size={14} className="text-slate-300" />}
                  </div>
                  {isOver && <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded text-rose-600 bg-rose-50">Exceeded</span>}
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Budgeted <span className="font-semibold text-slate-700">{formatCurrency(budget.budget)}</span></span>
                  <span className="text-slate-500">Spent <span className={cn("font-semibold", isOver && "text-rose-600")}>{formatCurrency(budget.spent)}</span></span>
                </div>
              </button>

              {isExpanded && (
                <div className="pl-10 pr-2 pt-2">
                  <BudgetRowChart budget={budget} contextId={contextId} dateFrom={dateFrom} dateTo={dateTo} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
