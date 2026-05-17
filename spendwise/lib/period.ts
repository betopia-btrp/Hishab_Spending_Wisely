import { PeriodPreset, PeriodConfig } from "@/types";

export function getPeriodConfig(preset: PeriodPreset): PeriodConfig {
  const now = new Date();

  switch (preset) {
    case "this_month": {
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return {
        preset,
        month: m,
        year: y,
        dateFrom,
        dateTo,
        label: now.toLocaleString("en-US", { month: "long", year: "numeric" }),
        isSingleMonth: true,
      };
    }
    case "last_month": {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const m = prev.getMonth() + 1;
      const y = prev.getFullYear();
      const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return {
        preset,
        month: m,
        year: y,
        dateFrom,
        dateTo,
        label: prev.toLocaleString("en-US", { month: "long", year: "numeric" }),
        isSingleMonth: true,
      };
    }
    case "last_3_months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
      const toStr = formatDate(now);
      const fromLabel = from.toLocaleString("en-US", { month: "short", year: "numeric" });
      const toLabel = now.toLocaleString("en-US", { month: "short", year: "numeric" });
      return {
        preset,
        dateFrom: fromStr,
        dateTo: toStr,
        label: `${fromLabel} – ${toLabel}`,
        isSingleMonth: false,
      };
    }
    case "this_year": {
      const y = now.getFullYear();
      return {
        preset,
        year: y,
        dateFrom: `${y}-01-01`,
        dateTo: `${y}-12-31`,
        label: String(y),
        isSingleMonth: false,
      };
    }
    case "all_time":
      return {
        preset,
        dateFrom: undefined,
        dateTo: undefined,
        label: "All Time",
        isSingleMonth: false,
      };
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
