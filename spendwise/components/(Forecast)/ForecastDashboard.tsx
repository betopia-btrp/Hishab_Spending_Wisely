"use client";

import { useState, useCallback } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { BacktestResult } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import api from "@/lib/axios";
import { Loader2, BarChart3 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid, ReferenceArea,
} from "recharts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function filterResults(result: BacktestResult, contextId?: string) {
  if (!contextId) return { filtered: [], totalProj: 0, totalAct: 0, weightedMape: null as number | null };
  const filtered = result.results.filter(r => r.context_id === contextId);
  const totalProj = filtered.reduce((s, r) => s + r.projected, 0);
  const totalAct = filtered.reduce((s, r) => s + r.actual, 0);
  const withMape = filtered.filter(r => r.mape !== null);
  const weightedMape = withMape.length > 0
    ? withMape.reduce((s, r) => s + r.mape! * r.actual, 0) / withMape.reduce((s, r) => s + r.actual, 0)
    : null;
  return { filtered, totalProj, totalAct, weightedMape };
}

export default function ForecastDashboard() {
  const { currentContext } = useAppContext();
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [cutoffDay, setCutoffDay] = useState(13);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cannotBacktest =
    year > new Date().getFullYear() ||
    (year === new Date().getFullYear() && month >= new Date().getMonth());

  const runBacktest = useCallback(async () => {
    if (!currentContext) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.post("/forecasts/backtest", {
        context_id: currentContext.id,
        month: month + 1,
        year,
        cutoff_day: cutoffDay,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Backtest failed");
    } finally {
      setLoading(false);
    }
  }, [currentContext, month, year, cutoffDay]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Forecast Backtest</h2>
        <p className="text-slate-500 text-sm mt-1">
          Pick a past month and see how the model predicted vs what actually happened
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#636B2F]/20"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i} disabled={i > new Date().getMonth() && year >= new Date().getFullYear()}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#636B2F]/20"
            >
              {Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y} disabled={y > new Date().getFullYear()}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cutoff Day</label>
            <select value={cutoffDay} onChange={(e) => setCutoffDay(Number(e.target.value))}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#636B2F]/20"
            >
              {[7, 10, 13, 15, 18, 20].map((d) => (<option key={d} value={d}>Day {d}</option>))}
            </select>
          </div>
          <button onClick={runBacktest}
            disabled={loading || cannotBacktest || !currentContext}
            className="px-6 py-2.5 bg-[#636B2F] text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
            {loading ? "Running..." : "Run Backtest"}
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700 font-medium">{error}</div>}
      {loading && (
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">Running forecast model...</span>
          </div>
        </div>
      )}

      {result && !loading && (() => {
        const { filtered, totalProj, totalAct, weightedMape } = filterResults(result, currentContext?.id);
        if (filtered.length === 0) {
          return (
            <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-100 text-center text-sm text-slate-400">
              No budget data for this context in {MONTHS[result.target_month - 1]} {result.target_year}
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Accuracy</p>
                <p className={cn("text-2xl font-extrabold mt-1", weightedMape !== null && weightedMape < 10 ? "text-emerald-600" : weightedMape !== null && weightedMape < 20 ? "text-amber-600" : "text-rose-600")}>
                  {weightedMape !== null ? `${weightedMape.toFixed(1)}%` : "N/A"}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">MAPE</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Projected</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totalProj)}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Total at cutoff</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Actual</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totalAct)}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Total actual</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Month</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">{MONTHS[result.target_month - 1].slice(0, 3)} {result.target_year}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Cutoff day {result.cutoff_day}</p>
              </div>
            </div>

            {filtered.map((cat) => {
              let cumActual = 0;
              let cumProj = 0;
              const chartData = cat.daily_breakdown.map((d) => {
                cumActual += d.actual;
                if (d.projected !== null) cumProj += d.projected;
                return { day: d.day, actual: cumActual, projected: d.projected !== null ? cumProj : null };
              });

              return (
                <div key={cat.category_name} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{cat.category_name}</span>
                      <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                        cat.alert_tier === 'overspend' ? "text-rose-600 bg-rose-50" :
                        cat.alert_tier === 'on_track_exceed' ? "text-amber-600 bg-amber-50" :
                        cat.alert_tier === 'early_warning' ? "text-amber-600 bg-amber-50" :
                        "text-emerald-600 bg-emerald-50"
                      )}>{cat.alert_tier || "On track"}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Budget: <strong className="text-slate-700">{formatCurrency(cat.budget)}</strong></span>
                      <span>Projected: <strong className="text-amber-600">{formatCurrency(cat.projected)}</strong></span>
                      <span>Actual: <strong className="text-slate-700">{formatCurrency(cat.actual)}</strong></span>
                      {cat.mape !== null && (
                        <span className={cn("font-bold", cat.mape < 10 ? "text-emerald-600" : cat.mape < 20 ? "text-amber-600" : "text-rose-600")}>
                          {cat.mape.toFixed(1)}% MAPE
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -20 }}>
                        <CartesianGrid stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94A3B8" }}
                          ticks={[1, result.cutoff_day, chartData.length]} />
                        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }}
                          tickFormatter={(v: number) => formatCurrency(v).replace(/BDT\s?/, "৳")}
                          axisLine={false} tickLine={false} width={55} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                              <p className="font-bold text-slate-900">Day {d.day}</p>
                              <p className="text-emerald-600">Actual: <span className="font-semibold">{formatCurrency(d.actual)}</span></p>
                              {d.projected !== null && <p className="text-amber-600">Projected: <span className="font-semibold">{formatCurrency(d.projected)}</span></p>}
                            </div>
                          );
                        }} />
                        <ReferenceArea x1={result.cutoff_day} x2={chartData.length} fill="#FEF3C7" fillOpacity={0.3}
                          label={{ value: "Projected", fontSize: 9, fill: "#D97706", position: "insideTopRight" }} />
                        <ReferenceLine x={result.cutoff_day} stroke="#D97706" strokeDasharray="4 3" strokeWidth={1}
                          label={{ value: `Cutoff`, fontSize: 9, fill: "#D97706", position: "top" }} />
                        {cat.budget > 0 && (
                          <ReferenceLine y={cat.budget} stroke="#EF4444" strokeDasharray="4 3" strokeWidth={1.5}
                            label={{ value: `Budget ${formatCurrency(cat.budget)}`, fontSize: 9, fill: "#EF4444", position: "right" }} />
                        )}
                        <Line type="monotone" dataKey="actual" stroke="#059669" strokeWidth={2} dot={false} name="Actual" />
                        <Line type="monotone" dataKey="projected" stroke="#D97706" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={true} name="Projected" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-400">
                    <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-[#059669]" />Actual</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-0 border-t-2 border-dashed border-[#D97706]" />Projected</div>
                    <div className="flex items-center gap-1"><div className="w-3 h-0 border-t border-dashed border-[#EF4444]" />Budget</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
