"use client";

import { PeriodPreset } from "@/types";
import { cn } from "@/lib/utils";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "this_year", label: "This Year" },
  { value: "all_time", label: "All Time" },
];

interface PeriodSelectorProps {
  value: PeriodPreset;
  onChange: (preset: PeriodPreset) => void;
}

export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((preset) => (
        <button
          key={preset.value}
          onClick={() => onChange(preset.value)}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-bold transition-all",
            value === preset.value
              ? "bg-[#636B2F] text-white shadow-md shadow-emerald-200"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 shadow-sm",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
