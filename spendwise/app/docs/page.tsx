"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Legend, ReferenceLine,
} from "recharts";
import {
  Brain, TrendingUp, AlertTriangle, BarChart3, Target,
  ChevronDown, ChevronRight, HelpCircle, ArrowRight, Clock,
  CalendarDays, Database, Cpu, Activity, Gauge, Layers,
  GitBranch, Sigma, ArrowUpDown, LucideIcon, TreePine,
  ListChecks, Swords, ShieldBan,
} from "lucide-react";

// ─── Section navigation ───
const SECTIONS = [
  { id: "first-principles", label: "First Principles", icon: Brain },
  { id: "user-data", label: "User Data & Behavior", icon: Database },
  { id: "model-selection", label: "Model Selection", icon: GitBranch },
  { id: "features", label: "Feature Engineering", icon: Layers },
  { id: "training", label: "How Each Model Works", icon: Cpu },
  { id: "prediction", label: "Prediction Pipeline", icon: ArrowRight },
  { id: "uncertainty", label: "Uncertainty Intervals", icon: Activity },
  { id: "alerts", label: "Alert Tiers", icon: AlertTriangle },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "interactive", label: "Interactive Demo", icon: TrendingUp },
  { id: "glossary", label: "Glossary", icon: HelpCircle },
];

// ─── Glossary entries ───
const GLOSSARY = [
  { term: "MAPE", def: "Mean Absolute Percentage Error. Average forecast error as a percentage of actual spend." },
  { term: "MAE", def: "Mean Absolute Error. Average forecast error in BDT (Taka)." },
  { term: "Coverage", def: "How often the confidence interval contains the actual value. Target is 80%." },
  { term: "Confidence Interval", def: "A range that the true value is expected to fall within, with a given probability." },
  { term: "Feature", def: "An input variable used by the model to make predictions (e.g., day of week, rolling sum)." },
  { term: "XGBoost", def: "A gradient-boosted tree algorithm that builds trees level-by-level. The default model." },
  { term: "LightGBM", def: "A gradient-boosted tree algorithm that builds trees leaf-by-leaf. Faster training." },
  { term: "Random Forest", def: "An ensemble of many decision trees trained independently on random subsets of data." },
  { term: "Decision Tree", def: "A model that makes predictions by following a series of if/else rules on features." },
  { term: "Gradient Boosting", def: "Building trees one after another, each correcting the errors of all previous trees combined." },
  { term: "Bagging", def: "Training each tree on a random subset of data (with replacement). Used by Random Forest." },
  { term: "Boosting", def: "Training trees sequentially, each focusing on the mistakes of the previous ones." },
  { term: "Rolling Feature", def: "A feature computed over a sliding window of past data (e.g., sum of last 7 days)." },
  { term: "Lag Feature", def: "The value from N days ago, used as a predictor for today." },
  { term: "Dense Daily", def: "Filling missing days with 0 so the model sees a continuous timeline." },
  { term: "Sanity Cap", def: "A limit that prevents the forecast from exceeding 3x the historical daily average." },
  { term: "Walk-Forward", def: "A validation method that trains on past data and tests on the next day, rolling forward." },
  { term: "Residual", def: "The difference between predicted and actual value: actual minus predicted." },
  { term: "Alert Tier", def: "A severity level (overspend, on_track_exceed, early_warning) based on projected vs budget." },
  { term: "Level-wise Growth", def: "XGBoost builds all nodes at a given depth before going deeper. More conservative." },
  { term: "Leaf-wise Growth", def: "LightGBM grows the leaf with the highest loss reduction. Faster but can overfit on small data." },
  { term: "Overfitting", def: "When a model memorizes training data noise instead of learning real patterns." },
];

// ─── Tree Growth Demo Component ───
function TreeGrowthDemo() {
  const [activeModel, setActiveModel] = useState<"rf" | "lgbm" | "xgb">("xgb");
  const [step, setStep] = useState(0);

  const models = {
    rf: {
      name: "Random Forest",
      color: "emerald",
      trees: [
        { depth: 1, leaves: 2, description: "Tree 1: First split on is_weekend. Samples: 57 unique days." },
        { depth: 2, leaves: 4, description: "Tree 1: Split both leaves on rolling_7d_sum and is_ramadan." },
        { depth: 5, leaves: 32, description: "Tree 1: Continues splitting until each leaf has pure predictions. Full depth." },
        { depth: 1, leaves: 2, description: "Tree 2: Different bootstrap sample (different 57 days). Splits on day_of_month first." },
        { depth: 1, leaves: 2, description: "Tree 3: Another random subset. Splits on days_to_nearest_salary." },
      ],
      final: "Average of all 200 independent, full-depth trees.",
    },
    lgbm: {
      name: "LightGBM",
      color: "amber",
      trees: [
        { depth: 1, leaves: 2, description: "Tree 1: Split on is_weekend. Compute residuals." },
        { depth: 3, leaves: 6, description: "Tree 1: Split the leaf with highest error gain (is_ramadan). Now 3 leaves." },
        { depth: 5, leaves: 12, description: "Tree 1: Keep splitting the best leaf. Some leaves are depth 5, others depth 2." },
        { depth: 1, leaves: 2, description: "Tree 2: Trained on residuals of Tree 1. Finds pattern Tree 1 missed." },
        { depth: 3, leaves: 5, description: "Tree 2: Expands the leaf with biggest remaining error." },
      ],
      final: "Weighted sum of 200 trees (leaf-wise, irregular depth).",
    },
    xgb: {
      name: "XGBoost",
      color: "indigo",
      trees: [
        { depth: 1, leaves: 2, description: "Tree 1: Split on is_weekend. Both leaves at depth 1." },
        { depth: 2, leaves: 4, description: "Tree 1: Split BOTH leaves to depth 2 (rolling_7d_sum and is_ramadan)." },
        { depth: 3, leaves: 8, description: "Tree 1: Split ALL 4 leaves to depth 3. Every region explored equally." },
        { depth: 4, leaves: 16, description: "Tree 1: Split ALL 8 leaves to depth 4. Max depth reached. Stop." },
        { depth: 1, leaves: 2, description: "Tree 2: Trained on residuals. Start fresh, level by level." },
      ],
      final: "Weighted sum of 200 trees (level-wise, max_depth=4, L2 regularized).",
    },
  };

  const current = models[activeModel];
  const tree = current.trees[step % current.trees.length];
  const maxLeaves = activeModel === "xgb" ? 16 : activeModel === "lgbm" ? 12 : 32;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex gap-2">
        {(["rf", "lgbm", "xgb"] as const).map((m) => {
          const activeClass = m === "rf" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
            m === "lgbm" ? "bg-amber-100 text-amber-700 border-amber-200" :
            "bg-indigo-100 text-indigo-700 border-indigo-200";
          return (
            <button
              key={m}
              onClick={() => { setActiveModel(m); setStep(0); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeModel === m
                  ? activeClass
                  : "bg-gray-50 text-gray-500 hover:bg-gray-100 border border-transparent"
              }`}
            >
              {models[m].name}
            </button>
          );
        })}
      </div>

      <div className="flex gap-4 items-center">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors"
        >
          Previous step
        </button>
        <span className="text-xs text-gray-400 font-mono">
          Step {step + 1} of {current.trees.length}
        </span>
        <button
          onClick={() => setStep(Math.min(current.trees.length - 1, step + 1))}
          disabled={step >= current.trees.length - 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 disabled:opacity-30 hover:bg-gray-200 transition-colors"
        >
          Next step
        </button>
      </div>

      <div className="bg-gray-900 text-gray-200 rounded-xl p-5 font-mono text-xs space-y-2 min-h-[160px]">
        <div className="text-gray-400 mb-2">
          {current.name} | Depth {tree.depth} | {tree.leaves} leaves (max {maxLeaves})
        </div>
        <div className="text-gray-200">
          {tree.description}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-700 text-gray-400">
          Final: {current.final}
        </div>
      </div>

      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            activeModel === "xgb" ? "bg-indigo-500" :
            activeModel === "lgbm" ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${((step + 1) / current.trees.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Interactive simulation data ───
function generateDenseHistory(days: number, baseDaily: number, noise: number, seed: number) {
  const data: { day: number; spend: number }[] = [];
  let s = seed;
  for (let d = 0; d < days; d++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const r = s / 0x7fffffff;
    const dayOfWeek = d % 7;
    const weekendBoost = dayOfWeek >= 5 ? 1.6 : 1.0;
    const salaryProximity = [1, 5, 10, 25].some((sd) => Math.abs((d % 30) + 1 - sd) <= 2) ? 1.5 : 1.0;
    const val = baseDaily * weekendBoost * salaryProximity * (1 + (r - 0.5) * noise);
    data.push({ day: d + 1, spend: Math.max(0, Math.round(val * 100) / 100) });
  }
  return data;
}

const DEMO_HISTORY = generateDenseHistory(90, 500, 0.8, 42);

// ─── Section Component ───
function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section id={id} className="scroll-mt-24 border-b border-gray-100 pb-6 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left mb-3 group"
      >
        <Icon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
        <h2 className="text-lg font-semibold text-gray-900 flex-1">{title}</h2>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-300" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-300" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pl-0 pr-0 pb-4 space-y-4 text-gray-700 leading-relaxed">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Info Card ───
function InfoCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="font-medium text-sm text-gray-900 mb-1">{title}</p>
      <div className="text-sm text-gray-600">{children}</div>
    </div>
  );
}

// ─── Comparison Table ───
function MetricTable({ rows }: { rows: [string, string, string, string, string][] }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium">Model</th>
            <th className="text-right px-4 py-3 font-medium">MAPE</th>
            <th className="text-right px-4 py-3 font-medium">MAE (BDT)</th>
            <th className="text-right px-4 py-3 font-medium">WinRate</th>
            <th className="text-right px-4 py-3 font-medium">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([model, mape, mae, win, cov], i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-4 py-3 font-medium text-gray-900">{model}</td>
              <td className={`px-4 py-3 text-right font-mono text-gray-600`}>{mape}</td>
              <td className={`px-4 py-3 text-right font-mono text-gray-600`}>{mae}</td>
              <td className={`px-4 py-3 text-right font-mono text-gray-600`}>{win}</td>
              <td className={`px-4 py-3 text-right font-mono text-gray-600`}>{cov}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Step Diagram ───
function FlowDiagram({ steps }: { steps: { label: string; desc: string }[] }) {
  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          viewport={{ once: true }}
          className="flex items-start gap-3"
        >
          <div className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-medium shrink-0">
              {i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-px h-6 bg-gray-200" />}
          </div>
          <div className="pb-4 pt-0.5">
            <p className="font-medium text-gray-900 text-sm">{s.label}</p>
            <p className="text-xs text-gray-500">{s.desc}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Highlight Box ───
function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-mono text-sm">
      {children}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("first-principles");
  const [demoDaysLeft, setDemoDaysLeft] = useState(15);
  const [demoDailyAvg, setDemoDailyAvg] = useState(500);
  const [demoBudget, setDemoBudget] = useState(25000);

  const demoData = useMemo(() => generateDenseHistory(90, demoDailyAvg, 0.8, 42), [demoDailyAvg]);

  const spentSoFar = useMemo(
    () => demoData.slice(0, 90 - demoDaysLeft).reduce((s, d) => s + d.spend, 0),
    [demoData, demoDaysLeft]
  );
  const projectedRemaining = demoDailyAvg * demoDaysLeft;
  const projectedTotal = spentSoFar + projectedRemaining;
  const baselineTotal = (spentSoFar / (90 - demoDaysLeft)) * 90 * (demoDaysLeft / 90 + 1);
  const alertTier =
    spentSoFar > demoBudget
      ? "overspend"
      : projectedTotal > demoBudget
        ? "on_track_exceed"
        : spentSoFar >= demoBudget * 0.5 && demoDaysLeft >= 15
          ? "early_warning"
          : "on_track";

  const alertColors: Record<string, string> = {
    overspend: "bg-red-50 border-red-300 text-red-700",
    on_track_exceed: "bg-amber-50 border-amber-300 text-amber-700",
    early_warning: "bg-yellow-50 border-yellow-300 text-yellow-700",
    on_track: "bg-emerald-50 border-emerald-300 text-emerald-700",
  };

  const costPerDay = useMemo(() => {
    const d = [...demoData];
    const total = d.slice(0, 90).reduce((s, x) => s + x.spend, 0);
    const remaining = projectedRemaining;
    return d.map((p, i) => ({
      day: p.day,
      actual: p.spend,
      cumulative: d.slice(0, i + 1).reduce((s, x) => s + x.spend, 0),
      forecastTotal: i < 90 - demoDaysLeft ? null : total,
    }));
  }, [demoData, projectedRemaining]);

  return (
    <div className="min-h-screen bg-white">
      {/* ─── Sticky Sidebar ─── */}
      <nav className="fixed top-0 left-0 h-full w-56 bg-white border-r border-gray-100 overflow-y-auto z-30 hidden lg:block">
        <div className="p-5 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">Forecast Docs</span>
          <p className="text-xs text-gray-400 mt-0.5">SpendWise ML Pipeline</p>
        </div>
        <div className="p-3 space-y-0.5">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors ${
                  activeSection === s.id
                    ? "bg-gray-100 text-gray-900 font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {s.label}
              </a>
            );
          })}
        </div>
      </nav>

      {/* ─── Mobile Top Nav ─── */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 p-3 overflow-x-auto">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeSection === s.id
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-400"
                }`}
              >
                <Icon className="w-3 h-3" />
                {s.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <main className="lg:pl-56">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 pb-32">

          {/* ═══ HERO ═══ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Spending Forecast
            </h1>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Every time you open your dashboard, a machine learning model predicts your
              month-end spending before you get there. This page explains exactly how
              that works, starting from absolute zero.
            </p>
          </motion.div>

          {/* ═══ SECTION: FIRST PRINCIPLES ═══ */}
          <Section id="first-principles" title="First Principles" icon={Brain}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">The problem we are solving</h3>
              <p>
                A user sets a monthly budget: <strong>10,000 BDT for Food</strong>.
                Today is the 15th. They have spent 6,000 BDT so far. Are they on track?
              </p>
              <p>
                The naive answer: "6,000 in 15 days = 400 BDT/day. At that rate, 30 days =
                12,000 BDT. You will overspend by 2,000 BDT (20%)."
              </p>
              <p>
                But what if day 10 was a birthday dinner (a one-time 2,000 BDT outlier)?
                The remaining days will be normal at 300 BDT/day. The projection should be
                6,000 + (300 x 15) = 10,500 BDT, not 12,000 BDT.
              </p>

              <InfoCard title="The core question">
                <strong>Given what we know about past spending patterns, how much will
                this user spend in the remaining days of the month?</strong> The answer
                determines whether they get a green "on track" badge or a red "overspend" alert.
              </InfoCard>

              <h3 className="text-lg font-semibold text-gray-700 mt-6">What makes this hard</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["Sparse data", "A category like Entertainment might have spend on only 5 out of 90 days. The model sees mostly zeros."],
                  ["Outliers", "A single 26,300 BDT laptop purchase can look like a pattern to a naive model."],
                  ["Regime changes", "Ramadan shifts eating patterns. A new job changes commute costs. The past stops being predictive."],
                  ["Small sample", "Typically 15-90 days of history per budget line. Deep learning needs 1000x more data."],
                  ["Zero-inflated", "Most days have zero spend in a given category. The model must learn when spend happens vs when it doesn't."],
                  ["Real-time requirement", "The forecast runs synchronously when the user opens their dashboard. Must complete in under 5 seconds."],
                ].map(([title, desc]) => (
                  <div key={title} className="border border-gray-200 rounded-lg p-3">
                    <p className="font-medium text-gray-900 text-sm">{title}</p>
                    <p className="text-xs text-gray-500 mt-1">{desc}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-semibold text-gray-700 mt-6">What forecasting means</h3>
              <p>
                Forecasting is using what happened in the past to guess what will happen
                in the future. You do this every day:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm">
                <li>If you spent 500 BDT on lunch yesterday, you expect to spend ~500 BDT today.</li>
                <li>If rent is due on the 1st, you know the first week will have a big expense.</li>
                <li>If it is Friday, you might eat out more than on Monday.</li>
              </ul>
              <p>
                The computer does the same thing, but with math. It looks at thousands of past
                daily totals and finds patterns: which days of the week have higher spending,
                which categories spike around festivals, how much a typical week costs.
              </p>

              <FlowDiagram
                steps={[
                  { label: "Raw expenses", desc: "Each expense has an amount, date, category, and context" },
                  { label: "Aggregate daily", desc: "Group by date. One row per day with total spend." },
                  { label: "Build features", desc: "Calendar features + rolling statistics for each date" },
                  { label: "Train model", desc: "Tree model learns patterns on last 90 days of history" },
                  { label: "Forecast remaining", desc: "Predict each remaining day individually, then sum to monthly total" },
                  { label: "Evaluate alerts", desc: "Compare projected total vs budget. Trigger overspend/early warning if needed." },
                ]}
              />
            </div>
          </Section>

          {/* ═══ SECTION: USER DATA & BEHAVIOR ═══ */}
          <Section id="user-data" title="User Data & Behavior" icon={Database}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">What the model actually sees</h3>
              <p>
                The model never sees who the user is. It does not know their name, age,
                location, religion, income, or profession. It receives only two things:
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4 bg-white">
                  <p className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400" />
                    1. Daily spend totals
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    For each (context, category) budget, the model gets one row per day
                    with the total amount spent. Days with no spending get 0.
                  </p>
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600">
                    <div className="grid grid-cols-3 gap-2 text-gray-400 font-medium mb-1">
                      <span>Date</span><span className="text-right">Spend</span><span className="text-right">Cat</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-gray-200 pt-1">
                      <span>Feb 01</span><span className="text-right">470</span><span className="text-right text-gray-400">Food</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span>Feb 02</span><span className="text-right">1,200</span><span className="text-right text-gray-400">Food</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span>Feb 03</span><span className="text-right">530</span><span className="text-right text-gray-400">Food</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span>Feb 04</span><span className="text-right">0</span><span className="text-right text-gray-400">Food</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 bg-white">
                  <p className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-400" />
                    2. Calendar features
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Derived from the date itself: day of week, is it a weekend, is it
                    close to salary day, is it Ramadan, is it festival season.
                  </p>
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-600">
                    <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-1 text-gray-400 font-medium mb-1">
                      <span>Feature</span><span className="text-right">Value</span><span className="text-right">Reason</span>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-1 border-t border-gray-200 pt-1">
                      <span>dow</span><span className="text-right">4</span><span className="text-right text-gray-400">Friday</span>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-1">
                      <span>is_weekend</span><span className="text-right">1</span><span className="text-right text-gray-400">Weekend spending spike</span>
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-1">
                      <span>is_ramadan</span><span className="text-right">1</span><span className="text-right text-gray-400">Iftar pattern</span>
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-700 mt-4">What the model does NOT see</h3>
              <div className="space-y-3">
                {[
                  ["User identity", "Name, email, age, gender, religion, profession, income tier. None of these exist in the database for real users. They were only used during synthetic data generation."],
                  ["Notes or descriptions", "The text of each expense note (e.g., 'lunch at KFC') is not used. Only the total per day matters for forecasting."],
                  ["Other users' data", "Each (context, category) model is trained independently. No data is shared across users."],
                  ["External information", "Weather, economic indicators, social media. The model only sees its own 20 features."],
                ].map(([title, desc]) => (
                  <div key={title} className="flex gap-3 items-start text-sm">
                    <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">x</div>
                    <div>
                      <p className="font-medium text-gray-700">{title}</p>
                      <p className="text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <InfoCard title="How behavior is captured without knowing the user">
                The model learns behavior through <strong>rolling features</strong> and
                <strong>calendar features</strong>. If a user consistently spends more on
                Fridays, the model sees that <Highlight>is_friday=1</Highlight> correlates
                with higher <Highlight>rolling_7d_sum</Highlight>. It does not need to know
                "this user is a software engineer who gets paid monthly." The data already
                contains that pattern.
              </InfoCard>

              <h3 className="text-lg font-semibold text-gray-700 mt-4">The 90-day window</h3>
              <p>
                We use the last 90 days of daily totals. Long enough to capture weekly and
                monthly patterns. Short enough to adapt when behavior changes.
              </p>
              <div className="h-48 rounded-xl border border-gray-200 p-2 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={demoData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="spend" stroke="#6366f1" fill="#eef2ff" strokeWidth={2} dot={false} />
                    <ReferenceLine x={75} stroke="#f59e0b" strokeDasharray="6 3" label={{ value: "Training cutoff", position: "top", fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Simulated 90-day spend history. Everything left of the dashed line is training data.
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: DATA PIPELINE ═══ */}
          <Section id="data-pipeline" title="Data Pipeline" icon={Database}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">From expenses to training data</h3>
              <p>
                The model doesn't see individual expenses — it sees daily totals. Here's
                how raw expenses become training rows:
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4 bg-white">
                  <p className="font-semibold text-gray-700 text-sm mb-2">Raw expenses</p>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pr-2">Date</th>
                        <th className="text-left pr-2">Amount</th>
                        <th className="text-left">Category</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr><td>Feb 01</td><td>350</td><td>Food</td></tr>
                      <tr><td>Feb 01</td><td>120</td><td>Transport</td></tr>
                      <tr><td>Feb 02</td><td>1,200</td><td>Groceries</td></tr>
                      <tr><td>Feb 03</td><td>80</td><td>Transport</td></tr>
                      <tr><td>Feb 03</td><td>450</td><td>Food</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 bg-white">
                  <p className="font-semibold text-gray-700 text-sm mb-2">Daily totals</p>
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pr-2">ds (date)</th>
                        <th className="text-left">y (total)</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-600">
                      <tr><td>Feb 01</td><td>470</td></tr>
                      <tr><td>Feb 02</td><td>1,200</td></tr>
                      <tr><td>Feb 03</td><td>530</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-700 mt-4">Dense daily</h3>
              <p>
                Some days have zero expenses. The model needs a continuous timeline, so we
                fill gaps with 0:
              </p>
              <div className="rounded-xl border border-gray-200 p-4 bg-white overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pr-3">ds</th>
                      <th className="text-left pr-3">Feb 01</th>
                      <th className="text-left pr-3">Feb 02</th>
                      <th className="text-left pr-3">Feb 03</th>
                      <th className="text-left pr-3">Feb 04</th>
                      <th className="text-left">Feb 05</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600">
                    <tr>
                      <td className="text-gray-400">y</td>
                      <td>470</td>
                      <td>1,200</td>
                      <td>530</td>
                      <td>0</td>
                      <td>890</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <InfoCard title="Why fill with 0?">
                Tree models like XGBoost split data into branches. If a day has 0 spend,
                the model learns "when there's no expense, predict low" — which is correct.
                Without the zero days, the model only sees spend-days and overestimates.
              </InfoCard>

              <h3 className="text-lg font-semibold text-gray-700 mt-4">The 90-day window</h3>
              <p>
                We use the last 90 days of data to train. This period is long enough to
                capture weekly and monthly patterns, but short enough to adapt when the
                user's lifestyle changes (new job, moved cities, etc.).
              </p>

              <div className="h-48 rounded-xl border border-gray-200 p-2 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={demoData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke="#6366f1"
                      fill="#eef2ff"
                      strokeWidth={2}
                      dot={false}
                    />
                    <ReferenceLine
                      x={75}
                      stroke="#f59e0b"
                      strokeDasharray="6 3"
                      label={{ value: "90-day cutoff", position: "top", fontSize: 10 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Simulated 90-day spend history. Everything left of the dashed line is training data.
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: MODEL SELECTION ═══ */}
          <Section id="model-selection" title="Model Selection" icon={GitBranch}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                From problem to model family
              </h3>
              <p>
                We started with a problem: <strong>predict remaining monthly spend per
                (context, category) using up to 90 days of daily totals.</strong> Every
                model family was evaluated against these hard constraints:
              </p>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["Training rows", "7 to 90 (one per day, depends on user history)"],
                  ["Features", "20 columns (calendar + rolling stats)"],
                  ["Prediction speed", "Under 100ms per model (50+ models per user)"],
                  ["Inference mode", "Synchronous. User waits for result."],
                  ["Retraining", "Every forecast run. No pre-trained models saved."],
                  ["Target", "Zero-inflated. Most days have 0 spend."],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
                    <span className="text-xs text-gray-500">{k}</span>
                    <span className="font-mono text-xs text-gray-700">{v}</span>
                  </div>
                ))}
              </div>

              <h4 className="font-semibold text-gray-700 mt-6">Elimination bracket</h4>
              <p className="text-sm">Each model family was evaluated against the constraints. Here is why each one was eliminated or kept:</p>

              <div className="space-y-4 mt-2">
                {[
                  {
                    family: "Statistical / Time Series",
                    models: "ARIMA, SARIMA, Exponential Smoothing (Holt-Winters)",
                    icon: Sigma,
                    verdict: "Eliminated",
                    reason: "These models require continuous, regularly-spaced time series with no zeros. Our data has 50-70% zero days. They also cannot use calendar features like is_ramadan or is_festival_season. They only see the past spend sequence, missing all context about why spending changes.",
                  },
                  {
                    family: "Linear Models",
                    models: "Linear Regression, Ridge, Lasso, ElasticNet",
                    icon: ArrowUpDown,
                    verdict: "Eliminated",
                    reason: "Linear models predict negative spend values (impossible). A single outlier day (26,300 BDT laptop) pulls the regression line up for all predictions. They cannot model non-linear patterns like U-shaped monthly spending (low mid-month, spikes at salary days). They would need manual polynomial features for every interaction.",
                  },
                  {
                    family: "Deep Learning",
                    models: "LSTM, GRU, Transformers, CNN",
                    icon: Cpu,
                    verdict: "Eliminated",
                    reason: "LSTM needs thousands of time steps per sequence. We have 15 to 90. Transformers need massive datasets. A state-of-the-art time-series transformer is pretrained on 100M+ data points. We have at most 90 rows per model. Even a tiny LSTM would overfit immediately and take 100x longer to train than a tree.",
                  },
                  {
                    family: "Prophet",
                    models: "Meta Prophet",
                    icon: Activity,
                    verdict: "Eliminated",
                    reason: "Prophet handles seasonality and holidays well, but it is 10x slower than tree models on a typical 30-90 row dataset. It requires its own holiday dataframe format. It adds a heavy dependency (PyStan) for marginal benefit. We originally used Prophet and replaced it with LightGBM for speed.",
                  },
                  {
                    family: "k-Nearest Neighbors",
                    models: "kNN Regression",
                    icon: Target,
                    verdict: "Eliminated",
                    reason: "kNN does not forecast. It finds similar past days and averages their spend. It cannot extrapolate to unseen patterns (e.g., a festival date that has never occurred in the training window). It also requires storing all training data and searching it at inference time.",
                  },
                  {
                    family: "Tree Ensembles",
                    models: "Random Forest, LightGBM, XGBoost",
                    icon: TreePine,
                    verdict: "Selected",
                    reason: "Tree models handle zero-inflated data naturally (they split on 'is this feature > threshold?'). They are robust to outliers (each tree sees a subset). They learn non-linear patterns automatically. They accept mixed feature types (binary, float, int). Training is sub-second on 90 rows. They need no preprocessing, no scaling, no feature engineering beyond the raw features.",
                  },
                ].map(({ family, models, icon: Icon, verdict, reason }) => (
                  <div key={family} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{family}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{models}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${
                        verdict === "Selected" ? "bg-gray-100 text-gray-700" : "bg-gray-100 text-gray-500"
                      }`}>{verdict}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">{reason}</p>
                  </div>
                ))}
              </div>

              <InfoCard title="Why tree ensembles fit this problem">
                <strong>90 rows, 20 features, zero-inflated target, sub-second requirement.</strong>
                Every constraint points to tree models. They need no data scaling, handle
                mixed feature types natively, are robust to outliers, and train in milliseconds.
              </InfoCard>
            </div>
          </Section>

          {/* ═══ SECTION: FEATURES ═══ */}
          <Section id="features" title="Feature Engineering" icon={Layers}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                What is a feature?
              </h3>
              <p>
                A <strong>feature</strong> is any number the model can use to make a prediction.
                If you were forecasting manually, your features might be:{" "}
                <em>"What day of the week is it?"</em>, <em>"How much did I spend yesterday?"</em>,
                <em>"Is it close to salary day?"</em>
              </p>
              <p>
                The model gets 20 features for every date. They fall into two categories:
              </p>

              <h4 className="font-semibold text-gray-700 mt-4">1. Calendar features (from the date)</h4>
              <p className="text-sm">These require no past data — they come purely from the calendar date.</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Feature</th>
                      <th className="text-left px-3 py-2 font-medium">Example</th>
                      <th className="text-left px-3 py-2 font-medium">Why it helps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["dow", "3 (Wednesday)", "Weekly patterns — weekends differ from weekdays"],
                      ["is_friday", "1 (yes)", "Bangladesh weekend starts Friday"],
                      ["is_weekend", "1 (yes)", "Leisure spending spikes"],
                      ["is_month_start", "1 (day <= 3)", "Salary just arrived"],
                      ["is_month_end", "1 (<=2 days left)", "Urgency to spend remaining budget"],
                      ["is_pay_cycle_window", "1 (25th-5th)", "Salary cluster window"],
                      ["day_of_month", "15", "Some bills are mid-month"],
                      ["days_to_month_end", "15", "More urgency = more spending"],
                      ["days_to_nearest_salary", "2", "Closer to salary = more spending"],
                      ["is_winter", "1", "Heating, winter clothing costs"],
                      ["is_monsoon", "0", "Indoor activities, transport disruption"],
                      ["is_ramadan", "1", "Iftar spikes, daytime dips"],
                      ["is_festival_season", "1", "Eid/Puja/Christmas shopping"],
                    ].map(([f, ex, why], i) => (
                      <tr key={i} className="border-t border-gray-100 text-xs">
                        <td className="px-3 py-2 font-mono text-gray-800">{f}</td>
                        <td className="px-3 py-2 text-gray-500">{ex}</td>
                        <td className="px-3 py-2 text-gray-400">{why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h4 className="font-semibold text-gray-700 mt-6">2. History features (from past spend)</h4>
              <p className="text-sm">These require knowing what happened on previous days.</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium">Feature</th>
                      <th className="text-left px-3 py-2 font-medium">Calculation</th>
                      <th className="text-left px-3 py-2 font-medium">What it captures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["rolling_7d_sum", "Sum of last 7 days", "Recent weekly spending level"],
                      ["rolling_30d_sum", "Sum of last 30 days", "Broader monthly trend"],
                      ["lag_1d", "Yesterday's spend", "Day-to-day continuity"],
                      ["lag_7d", "Same day last week", "Weekly rhythm (e.g., Friday night out)"],
                      ["days_since_last_expense", "Days since last non-zero", "Irregular spending gaps"],
                    ].map(([f, calc, why], i) => (
                      <tr key={i} className="border-t border-gray-100 text-xs">
                        <td className="px-3 py-2 font-mono text-gray-800">{f}</td>
                        <td className="px-3 py-2 text-gray-500">{calc}</td>
                        <td className="px-3 py-2 text-gray-400">{why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <InfoCard title="How features work together">
                For a Friday during Ramadan, the model sees: <Highlight>is_friday=1</Highlight>,{" "}
                <Highlight>is_ramadan=1</Highlight>, <Highlight>rolling_7d_sum=4,500</Highlight>,{" "}
                <Highlight>days_to_nearest_salary=0</Highlight>. It learned from past Fridays
                in Ramadan that spending spikes at iftar time — so it predicts higher.
                Each feature is a clue; together they tell the full story.
              </InfoCard>
            </div>
          </Section>

          {/* ═══ SECTION: HOW EACH MODEL WORKS ═══ */}
          <Section id="training" title="How Each Model Works" icon={Cpu}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                The three tree ensemble models
              </h3>
              <p>
                We selected three tree ensemble models. All three build hundreds of small
                decision trees and combine their predictions. But they differ in
                <strong>how</strong> those trees are built. Understanding the difference
                explains why XGBoost wins on this data.
              </p>

              {/* ── Foundation: Decision Trees ── */}
              <h4 className="font-semibold text-gray-700 mt-2">The foundation: a single decision tree</h4>
              <p>
                Before comparing the three, you need to understand what a single decision
                tree looks like. It asks yes/no questions about features, and each answer
                leads to a prediction:
              </p>
              <div className="bg-gray-900 text-gray-200 rounded-xl p-5 font-mono text-sm space-y-1.5 overflow-x-auto">
                <div className="text-indigo-400">if is_weekend == 1:</div>
                <div className="pl-6 text-gray-300">if is_ramadan == 1:</div>
                <div className="pl-12 text-amber-400">predict 1,200 BDT  (10 samples)</div>
                <div className="pl-6 text-gray-300">else:</div>
                <div className="pl-12 text-amber-400">predict 850 BDT  (16 samples)</div>
                <div className="text-indigo-400 mt-2">else:</div>
                <div className="pl-6 text-gray-300">if rolling_7d_sum &gt; 3,000:</div>
                <div className="pl-12 text-amber-400">predict 600 BDT  (22 samples)</div>
                <div className="pl-6 text-gray-300">else:</div>
                <div className="pl-12 text-amber-400">predict 320 BDT  (42 samples)</div>
              </div>
              <p className="text-sm">
                Each leaf (final box) predicts the <strong>average spend</strong> of all
                training days that ended up in that leaf. A single tree is a weak predictor
                by itself. But combine 200 of them, and the ensemble becomes accurate.
              </p>

              {/* ── Common: Ensemble ── */}
              <h4 className="font-semibold text-gray-700 mt-6">What all three share: the ensemble</h4>
              <p>
                All three models combine many trees. The final prediction is the average
                (Random Forest) or weighted sum (LightGBM, XGBoost) of all tree predictions.
                This is why they are called <strong>ensemble methods</strong>:
              </p>
              <div className="bg-gray-900 text-gray-200 rounded-xl p-4 font-mono text-sm">
                final_prediction = average(tree_1_pred, tree_2_pred, ..., tree_200_pred)
              </div>
              <p className="text-sm">
                The magic is in <strong>how each tree is built</strong>. If every tree
                were identical, the ensemble would be no better than a single tree. Each
                model has a different strategy for making trees diverse.
              </p>

              {/* ── Model 1: Random Forest ── */}
              <div className="border border-gray-200 rounded-lg p-5 mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <TreePine className="w-4 h-4 text-gray-500" />
                  <h4 className="font-semibold text-gray-900">Random Forest</h4>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>Bagging (Bootstrap Aggregating).</strong> Each tree is trained
                  independently on a random subset of the data. Every tree gets about 63% of
                  the available rows (sampled with replacement). It also only sees a random subset
                  of features for each split.
                </p>
                <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <p className="font-medium text-gray-900 text-sm">How it works:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-600 mt-2">
                    <li>Take a random bootstrap sample of the available days (sampled with replacement). About 57 unique days per tree for a 90-day window.</li>
                    <li>Pick a random subset of features (about 5 of 20) to consider at each split.</li>
                    <li>Build a full-depth decision tree (no pruning). Each leaf gets a prediction equal to the average of samples in that leaf.</li>
                    <li>Repeat 200 times. Each tree is completely independent of the others.</li>
                    <li>Final prediction = average of all 200 tree predictions.</li>
                  </ol>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Robust to outliers</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Low overfitting</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Con: Each tree sees less data</span>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  With limited rows, each tree sees about 37% fewer unique days than the full dataset.
                  On small datasets, bagging throws away valuable training examples. Random
                  Forest needs more total data to compensate.
                </p>
              </div>

              {/* ── Model 2: LightGBM ── */}
              <div className="border border-gray-200 rounded-lg p-5 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-gray-500" />
                  <h4 className="font-semibold text-gray-900">LightGBM</h4>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>Gradient Boosting with leaf-wise growth.</strong> Unlike Random
                  Forest, trees are built <strong>sequentially</strong>. Each new tree learns
                  the errors of all previous trees. LightGBM grows trees by expanding the
                  leaf that reduces error the most, regardless of depth.
                </p>
                <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <p className="font-medium text-gray-900 text-sm">How it works:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-600 mt-2">
                    <li>Tree 1 predicts all available days poorly. Compute the error for each day: actual minus prediction.</li>
                    <li>Tree 2 is trained to predict those errors. It learns what Tree 1 missed.</li>
                    <li>Tree 3 learns the errors of Tree 1 + Tree 2 combined.</li>
                    <li>Continue for 200 trees. Each tree is shallow (num_leaves=31, roughly depth 5).</li>
                    <li>At each step, LightGBM picks the <strong>leaf with the largest error reduction</strong> and splits it. This is leaf-wise growth.</li>
                    <li>Final prediction = weighted sum of all 200 trees, scaled by learning_rate (0.05).</li>
                  </ol>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Fastest training</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Sees all rows every tree</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Con: Can overfit on tiny data</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Con: Leaf-wise growth is greedy</span>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Leaf-wise growth is faster but riskier on small data. With limited rows,
                  LightGBM can find a leaf that looks good by chance instead of by a real pattern
                  and keep splitting it, memorizing noise. The min_child_samples=5 helps,
                  but the risk remains.
                </p>
              </div>

              {/* ── Model 3: XGBoost ── */}
              <div className="border border-gray-200 rounded-lg p-5 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-gray-500" />
                  <h4 className="font-semibold text-gray-900">XGBoost</h4>
                </div>
                <p className="text-sm text-gray-700">
                  <strong>Gradient Boosting with level-wise growth.</strong> Same sequential
                  training as LightGBM, but trees are built <strong>level by level</strong>.
                  At depth 1, all nodes split. At depth 2, all 4 nodes split. This is more
                  conservative and prevents the model from memorizing noise in sparse regions.
                </p>
                <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <p className="font-medium text-gray-900 text-sm">How it works:</p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-xs text-gray-600 mt-2">
                    <li>Tree 1 predicts all available days. Compute errors (residuals).</li>
                    <li>Tree 2 is trained on residuals. But instead of picking the best leaf, XGBoost builds all nodes at depth 1 first, then all at depth 2, then depth 3, then depth 4 (max_depth=4).</li>
                    <li>Level-wise growth means every region of the feature space gets explored equally, not just the most promising one.</li>
                    <li>Repeat for 200 trees. Each tree has at most 2^4 = 16 leaves.</li>
                    <li>Uses <strong>L2 regularization</strong> on leaf weights to prevent any single leaf from having too much influence.</li>
                    <li>Final prediction = weighted sum of all 200 trees, each scaled by learning_rate (0.05).</li>
                  </ol>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Better on small data</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Regularized (less overfit)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Pro: Best coverage</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Con: Slightly slower training</span>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Level-wise growth + L2 regularization make XGBoost the safest choice for
                  small data. It will not chase a spurious pattern in a single leaf. This
                  is why XGBoost achieves 75% coverage while LightGBM gets 25% on the same
                  data. The tradeoff is slightly slower training, but 150ms vs 50ms does not
                  matter when the user waits for a dashboard to load.
                </p>
              </div>

              {/* ── Interactive: Tree growth visualization ── */}
              <h4 className="font-semibold text-gray-700 mt-6">Interactive: Tree growth comparison</h4>
              <p>See how each model builds its trees differently on the same data.</p>
              <TreeGrowthDemo />

              {/* ── Comparison table ── */}
              <h4 className="font-semibold text-gray-700 mt-6">Full comparison</h4>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-3 py-2.5 font-medium">Property</th>
                      <th className="text-left px-3 py-2.5 font-medium">Random Forest</th>
                      <th className="text-left px-3 py-2.5 font-medium">LightGBM</th>
                      <th className="text-left px-3 py-2.5 font-medium">XGBoost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Ensemble type", "Bagging", "Boosting", "Boosting"],
                      ["Tree growth", "Full depth (independent)", "Leaf-wise", "Level-wise"],
                      ["Rows per tree", "~57 (63% bootstrap)", "All 90", "All 90"],
                      ["Max depth", "Unlimited (full tree)", "31 leaves (~depth 5)", "Depth 4 (16 leaves)"],
                      ["Regularization", "None (averaging)", "min_child_samples", "L2 on leaf weights"],
                      ["Training speed", "Fast", "Fastest", "Fast"],
                      ["Overfit risk", "Low (bagging)", "Medium (leaf-wise)", "Lowest (level-wise + L2)"],
                      ["Coverage (test)", "40-50%", "20-25%", "75%"],
                      ["MAPE (test)", "12-17%", "15-20%", "11-15%"],
                    ].map(([prop, rf, lgbm, xgb], i) => (
                      <tr key={i} className="border-t border-gray-100 text-xs">
                        <td className="px-3 py-2.5 font-medium text-gray-700">{prop}</td>
                        <td className={`px-3 py-2.5 ${rf.includes("Best") ? "text-emerald-600 font-medium" : "text-gray-500"}`}>{rf}</td>
                        <td className={`px-3 py-2.5 ${lgbm.includes("Best") ? "text-emerald-600 font-medium" : "text-gray-500"}`}>{lgbm}</td>
                        <td className={`px-3 py-2.5 ${xgb.includes("Best") ? "text-emerald-600 font-medium" : "text-gray-500"}`}>{xgb}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <InfoCard title="Why XGBoost is the default">
                XGBoost wins because of <strong>level-wise growth + L2 regularization</strong>.
                On 90-row data, LightGBM's leaf-wise growth finds spurious patterns (25%
                coverage). Random Forest wastes 37% of rows per tree. XGBoost uses all 90
                rows, grows conservatively level-by-level, and regularizes leaf weights.
                The result: 75% coverage and 11% MAPE, the best of all three.
              </InfoCard>
            </div>
          </Section>

          {/* ═══ SECTION: PREDICTION ═══ */}
          <Section id="prediction" title="Prediction Pipeline" icon={GitBranch}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                From trained model to monthly forecast
              </h3>

              <FlowDiagram
                steps={[
                  { label: "Fetch 90-day history", desc: "For this (context, category), get daily totals" },
                  { label: "Fill gaps (dense daily)", desc: "Insert 0-spend days for missing dates" },
                  { label: "Build 20 features", desc: "Calendar + rolling/lag for each of the 90 days" },
                  { label: "Train XGBoost", desc: "200 trees, 20 features, ~90 rows" },
                  { label: "Extract last known state", desc: "Get the last rolling sums and lags from training data" },
                  { label: "Build future features", desc: "Calendar features for remaining days + forward-filled history state" },
                  { label: "Predict each future day", desc: "Model predicts daily spend for each remaining day" },
                  { label: "Sum and sanity cap", desc: "Add up all predictions; clamp if daily rate exceeds 3x historical avg" },
                  { label: "Add confidence interval", desc: "Walk-forward residual quantiles give upper/lower bounds" },
                ]}
              />

              <h3 className="text-lg font-semibold text-gray-700 mt-4">The sanity cap</h3>
              <p>
                Sometimes the model predicts absurdly high values (e.g., a single 26,300 BDT
                laptop purchase is treated as normal). The sanity cap prevents this:
              </p>
              <div className="bg-gray-900 text-gray-200 rounded-xl p-4 font-mono text-sm overflow-x-auto">
                daily_rate = predicted_total / days_remaining{"\n"}
                cap = historical_daily_avg x 3 x days_remaining{"\n"}
                if daily_rate &gt; historical_daily_avg x 3:{"\n"}
                &nbsp;&nbsp;predicted_total = min(predicted_total, cap)
              </div>
              <p className="text-sm">
                If the model says you'll spend 3x your normal daily average for the rest of
                the month, it's probably wrong — so we clamp it.
              </p>

              <h3 className="text-lg font-semibold text-gray-700 mt-4">Fallback chain</h3>
              <div className="space-y-3">
                {[
                  ["1. XGBoost (primary)", "Requires ≥7 history days. Returns None if fitting fails."],
                  ["2. Linear projection", "(spent_so_far / days_passed) x days_left. Uses last 3 months daily avg if current month has <3 spend days."],
                  ["3. Naive baseline", "Only used for comparison in backtest — not for production forecasts."],
                ].map(([model, desc]) => (
                  <div key={model} className="flex gap-3 items-start">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700 text-sm">{model}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ═══ SECTION: UNCERTAINTY ═══ */}
          <Section id="uncertainty" title="Uncertainty Intervals" icon={Activity}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                A single number isn't enough
              </h3>
              <p>
                A forecast of "you'll spend 24,000 BDT remaining" sounds precise — but it's
                wrong. The real number will almost certainly be different. The question is:
                <strong> by how much?</strong>
              </p>
              <p>
                Instead of one number, we return an <strong>80% confidence interval</strong>:
                "You'll spend between 18,000 and 30,000 BDT, and we're 80% sure the real
                number is in this range."
              </p>

              <h4 className="font-semibold text-gray-700">How the interval is built</h4>
              <p className="text-sm">We measure how wrong the model tends to be using a walk-forward test:</p>
              <ol className="list-decimal pl-6 space-y-2 text-sm">
                <li><strong>Train on day 1-7, predict day 8.</strong> Record the error: actual - predicted.</li>
                <li><strong>Train on day 1-8, predict day 9.</strong> Record the error.</li>
                <li>Continue through all 90 days. This gives ~83 past errors.</li>
                <li>Take the 10th and 90th percentiles of those errors.</li>
                <li>Scale by <strong>sqrt(days_remaining)</strong> — more days ahead = more uncertainty.</li>
              </ol>

              <div className="h-56 rounded-xl border border-gray-200 p-2 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[
                    { day: 1, lower: 300, actual: 470, upper: 650 },
                    { day: 2, lower: 900, actual: 1200, upper: 1500 },
                    { day: 3, lower: 350, actual: 530, upper: 720 },
                    { day: 4, lower: 0, actual: 0, upper: 300 },
                    { day: 5, lower: 600, actual: 890, upper: 1100 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="upper" stroke="#818cf8" fill="#eef2ff" strokeWidth={0} />
                    <Area type="monotone" dataKey="lower" stroke="#818cf8" fill="#ffffff" strokeWidth={0} />
                    <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Actual" />
                    <Line type="monotone" dataKey="upper" stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 3" name="Upper (90%)" />
                    <Line type="monotone" dataKey="lower" stroke="#a5b4fc" strokeWidth={1} strokeDasharray="4 3" name="Lower (10%)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Walk-forward predictions with 80% interval bands. When coverage = 80%, about 4 out of 5 actuals
                fall inside the band.
              </p>

              <h4 className="font-semibold text-gray-700 mt-4">What coverage means</h4>
              <p>
                Coverage is a <strong>calibration check</strong>. If the model says "80%
                confidence" but only captures the truth 40% of the time, the intervals are
                too narrow (overconfident). If it captures 95% of the time, they're too wide.
              </p>
              <p>
                In our backtests, XGBoost achieves ~75% coverage — close to the 80% target.
                Coverage drops during regime changes (e.g., Ramadan starts mid-month, invalidating
                the pre-Ramadan training data).
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: ALERTS ═══ */}
          <Section id="alerts" title="Alert Tiers" icon={AlertTriangle}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                From forecast to action
              </h3>
              <p>
                The forecast alone doesn't help the user — they need to know{" "}
                <strong>what to do about it</strong>. Three alert tiers translate the
                projection into actionable warnings:
              </p>

              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    tier: "Overspend",
                    condition: "spent_so_far > budget",
                    color: "red",
                    ui: "Red card: Budget Exceeded",
                    meaning: "You've already spent more than your budget. No projection needed — it's already happened.",
                  },
                  {
                    tier: "On Track to Exceed",
                    condition: "projected > budget",
                    color: "amber",
                    ui: "Amber card: On Track to Exceed",
                    meaning: "You haven't overspent yet, but at your current pace you will. Time to cut back.",
                  },
                  {
                    tier: "Early Warning",
                    condition: "spent >= 50% AND days_left >= 15",
                    color: "yellow",
                    ui: "Yellow badge: Early Warning",
                    meaning: "Halfway through your budget with half the month left. Good to be aware.",
                  },
                ].map((a) => (
                  <div key={a.tier} className="border border-gray-200 rounded-lg p-4">
                    <p className="font-medium text-sm text-gray-900">{a.tier}</p>
                    <p className="text-xs font-mono mt-1 text-gray-500">{a.condition}</p>
                    <p className="text-xs mt-2 text-gray-500">{a.ui}</p>
                    <p className="text-xs mt-1 text-gray-400">{a.meaning}</p>
                  </div>
                ))}
              </div>

              <InfoCard title="Evaluation order">
                Tiers are checked in order: overspend first, then on_track_exceed, then
                early_warning. If you've already overspent, the other two don't matter.
              </InfoCard>

              <h4 className="font-semibold text-gray-700 mt-4">Notifications</h4>
              <p>
                Once per day, per (context, category, tier), the system creates an in-app
                notification. This prevents spamming the user every time they open the dashboard.
                The notification links directly to the relevant budget so they can adjust.
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: METRICS ═══ */}
          <Section id="metrics" title="Metrics" icon={BarChart3}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                How we measure success
              </h3>
              <p>
                We compare three models (XGBoost, LightGBM, Random Forest) against a
                naive baseline using four metrics:
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    name: "MAPE",
                    formula: "|projected - actual| / actual x 100",
                    ideal: "Lower is better (&lt; 15% is good)",
                    why: "Percentage error is intuitive — 10% means you're off by 10% of actual spend.",
                  },
                  {
                    name: "MAE (BDT)",
                    formula: "|projected - actual|",
                    ideal: "Lower is better",
                    why: "Absolute error in Taka — a 500 BDT error matters more for a 5,000 BDT budget than a 50,000 BDT one.",
                  },
                  {
                    name: "Win Rate",
                    formula: "model MAE &lt; baseline MAE ? win : loss",
                    ideal: "&gt; 50% means model beats baseline",
                    why: "The model must prove it's better than a trivial carry-forward. Win rate counts how often it does.",
                  },
                  {
                    name: "Coverage",
                    formula: "lower ≤ actual ≤ upper ? hit : miss",
                    ideal: "~80% (matches the 80% confidence level)",
                    why: "Well-calibrated uncertainty is as important as accurate point forecasts.",
                  },
                ].map((m) => (
                  <div key={m.name} className="rounded-xl border border-gray-200 p-4 bg-white">
                    <p className="font-bold text-gray-700">{m.name}</p>
                    <p className="text-xs font-mono text-gray-500 mt-1">{m.formula}</p>
                    <p className="text-xs text-indigo-600 mt-1">Target: {m.ideal}</p>
                    <p className="text-xs text-gray-400 mt-1">{m.why}</p>
                  </div>
                ))}
              </div>

              <h4 className="font-semibold text-gray-700 mt-4">Real comparison (user 8218e952, Feb 2026)</h4>
              <MetricTable
                rows={[
                  ["Baseline", "22.5%", "51,584 BDT", "—", "—"],
                  ["LightGBM", "15.6%", "31,526 BDT", "50%", "25%"],
                  ["Random Forest", "12.6%", "28,816 BDT", "75%", "50%"],
                  ["XGBoost", "11.0%", "24,372 BDT", "75%", "75%"],
                ]}
              />
              <p className="text-xs text-gray-400">
                XGBoost wins on every metric. All three models beat the baseline — the ML
                features are genuinely adding value.
              </p>

              <h4 className="font-semibold text-gray-700 mt-4">When models fail</h4>
              <MetricTable
                rows={[
                  ["Baseline", "48.0%", "776,257 BDT", "—", "—"],
                  ["LightGBM", "67.0%", "1,122,818 BDT", "40%", "0%"],
                  ["Random Forest", "56.4%", "937,725 BDT", "40%", "0%"],
                  ["XGBoost", "72.9%", "1,258,123 BDT", "40%", "0%"],
                ]}
              />
              <p className="text-xs text-gray-400">
                March 2026 — the 90-day training window spans pre-Ramadan and Ramadan (starts
                Feb 20). The regime change mid-window confuses every model. Coverage hits 0%.
                This is a known weakness: the model assumes the past predicts the future, but
                during lifestyle transitions, the past is misleading.
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: INTERACTIVE DEMO ═══ */}
          <Section id="interactive" title="Interactive Demo" icon={TrendingUp}>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Play with the forecast
              </h3>
              <p>Adjust the sliders and see how the forecast and alert tier change in real time.</p>

              <div className="grid sm:grid-cols-3 gap-4 p-4 rounded-xl bg-white border border-gray-200">
                <div>
                  <label className="text-xs font-medium text-gray-500">Daily average spend</label>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={demoDailyAvg}
                    onChange={(e) => setDemoDailyAvg(Number(e.target.value))}
                    className="w-full mt-2 accent-indigo-600"
                  />
                  <p className="text-sm font-mono text-gray-700 mt-1">{demoDailyAvg} BDT</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Days remaining</label>
                  <input
                    type="range"
                    min="1"
                    max="28"
                    step="1"
                    value={demoDaysLeft}
                    onChange={(e) => setDemoDaysLeft(Number(e.target.value))}
                    className="w-full mt-2 accent-indigo-600"
                  />
                  <p className="text-sm font-mono text-gray-700 mt-1">{demoDaysLeft} days</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Monthly budget</label>
                  <input
                    type="range"
                    min="5000"
                    max="100000"
                    step="1000"
                    value={demoBudget}
                    onChange={(e) => setDemoBudget(Number(e.target.value))}
                    className="w-full mt-2 accent-indigo-600"
                  />
                  <p className="text-sm font-mono text-gray-700 mt-1">{demoBudget.toLocaleString()} BDT</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4 bg-white space-y-2">
                  <p className="font-semibold text-gray-700 text-sm">Forecast Breakdown</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Spent so far</span>
                    <span className="font-mono text-gray-700">{spentSoFar.toLocaleString(undefined, { maximumFractionDigits: 0 })} BDT</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Projected remaining</span>
                    <span className="font-mono text-indigo-600">+{projectedRemaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} BDT</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-bold">
                    <span className="text-gray-700">Projected total</span>
                    <span className="font-mono">{projectedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} BDT</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Budget</span>
                    <span className="font-mono text-gray-700">{demoBudget.toLocaleString()} BDT</span>
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${alertColors[alertTier]} space-y-2`}>
                  <p className="font-semibold text-sm">Alert Tier</p>
                  <p className="text-2xl font-bold capitalize">
                    {alertTier === "on_track" ? "On Track" : alertTier.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm opacity-80">
                    {alertTier === "overspend" && "You've already exceeded your budget."}
                    {alertTier === "on_track_exceed" && "At this pace, you'll exceed your budget by month end."}
                    {alertTier === "early_warning" && "Halfway through with plenty of month left — keep an eye on it."}
                    {alertTier === "on_track" && "You're on track to stay within budget."}
                  </p>
                </div>
              </div>

              <div className="h-64 rounded-xl border border-gray-200 p-2 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={costPerDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: "Day of month", position: "bottom", fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="cumulative" stroke="#6366f1" fill="#eef2ff" strokeWidth={2} name="Cumulative spend" />
                    <ReferenceLine y={demoBudget} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "Budget", position: "right", fontSize: 10, fill: "#ef4444" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Cumulative spend over time. Red dashed line = your budget. Cross it → alert triggers.
              </p>
            </div>
          </Section>

          {/* ═══ SECTION: GLOSSARY ═══ */}
          <Section id="glossary" title="Glossary" icon={HelpCircle}>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                {GLOSSARY.map((g) => (
                  <div key={g.term} className="rounded-xl border border-gray-200 p-3 bg-white">
                    <p className="font-bold text-indigo-700 text-sm">{g.term}</p>
                    <p className="text-xs text-gray-500 mt-1">{g.def}</p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ─── Footer ─── */}
          <div className="mt-16 pt-8 border-t border-gray-200 text-center text-sm text-gray-400">
            <p>SpendWise Forecasting Pipeline — Built with XGBoost, powered by your data.</p>
            <p className="mt-1">
              <a href="/" className="text-gray-400 hover:text-indigo-600 underline">Back to Dashboard</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
