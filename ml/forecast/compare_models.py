#!/usr/bin/env python3
"""
Compare all ML models on the same backtest and print a results table.

Usage:
    python3 ml/forecast/compare_models.py --user-id <uuid> --target-month 5 --target-year 2026
    python3 ml/forecast/compare_models.py --user-id <uuid> --all-months
    python3 ml/forecast/compare_models.py --user-id <uuid> --all-months --cutoff-day 15
"""

import argparse
import os
import sys
import json
from collections import defaultdict

import psycopg2

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from run import backtest_for_user, load_model_engine

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 5435,
    "dbname": "spendwise",
    "user": "spendwise",
    "password": "spendwise",
}

_MODELS = ["lightgbm", "random_forest", "xgboost"]

SKIP_FIRST_MONTHS = 3


def _fmt(val, suffix=""):
    if val is None:
        return "-"
    if isinstance(val, str):
        return val
    if isinstance(val, float):
        return f"{val:.1f}{suffix}"
    return str(val)


def _print_segment_table(segment_key, label, results):
    print(f"\n  {label}:")
    print(f"    {'Model':<20} {'MAPE':>8} {'MAE(BDT)':>10} {'WinRate':>8} {'Coverage':>9}")
    print(f"    {'-'*20} {'-'*8} {'-'*10} {'-'*8} {'-'*9}")
    for model_name, r in results:
        if r is None:
            print(f"    {model_name:<20} {'FAILED':>8} {'FAILED':>10} {'FAILED':>8} {'FAILED':>9}")
            continue
        seg = r.get("segment_metrics", {}).get(segment_key)
        if seg:
            print(f"    {model_name:<20} {_fmt(seg.get('overall_mape'), '%'):>8} "
                  f"{_fmt(seg.get('overall_mae_bdt'), ' BDT'):>10} "
                  f"{_fmt(seg.get('model_win_rate'), '%'):>8} "
                  f"{_fmt(seg.get('coverage_rate'), '%'):>9}")
        else:
            print(f"    {model_name:<20} {'-':>8} {'-':>10} {'-':>8} {'-':>9}")


def _aggregate_across_months(monthly_results):
    """Aggregate per-category results across all months for each model."""
    agg = {}
    for model_name in _MODELS:
        all_rows = []
        for mr in monthly_results.get(model_name, []):
            if mr and mr.get("results"):
                all_rows.extend(mr["results"])
        if not all_rows:
            agg[model_name] = None
            continue

        total_actual = sum(r["actual"] for r in all_rows if r.get("actual"))
        total_mae = sum(r["mae_bdt"] for r in all_rows if r.get("mae_bdt") is not None)
        weighted_mape_sum = sum(
            r["mape"] * r["actual"] for r in all_rows
            if r.get("mape") is not None and r.get("actual")
        )
        total_mape = (weighted_mape_sum / total_actual) if total_actual > 0 else None
        wins = sum(1 for r in all_rows if r.get("model_beats_baseline") is True)
        win_rate = (wins / len(all_rows) * 100) if all_rows else None
        interval_hits = sum(1 for r in all_rows if r.get("interval_hit") is True)
        interval_total = sum(1 for r in all_rows if r.get("interval_hit") is not None)
        coverage = (interval_hits / interval_total * 100) if interval_total > 0 else None

        agg[model_name] = {
            "overall_mape": total_mape,
            "overall_mae_bdt": total_mae,
            "model_win_rate": win_rate,
            "coverage_rate": coverage,
            "total_budgets": len(all_rows),
        }
    return agg


def run_single_month(cursor, user_id, month, year, cutoff_day):
    """Run all 3 models for a single month. Returns {model_name: result_dict}."""
    results = {}
    for model_name in _MODELS:
        try:
            forecast_fn, forecast_with_interval_fn = load_model_engine(model_name)
            result = backtest_for_user(
                cursor, user_id, month, year, cutoff_day,
                forecast_remaining_fn=forecast_fn,
                forecast_remaining_with_interval_fn=forecast_with_interval_fn,
            )
            results[model_name] = result
        except Exception:
            results[model_name] = None
    return results


def print_single_month_table(month, year, results, cutoff_day):
    """Print comparison table for a single month."""
    print(f"\n  {month:>2}/{year}  (cutoff day {cutoff_day}):")
    best_mae = None
    best_model = None
    for model_name in _MODELS:
        r = results.get(model_name)
        if r is None:
            print(f"    {model_name:<20} {'FAILED':>8} {'FAILED':>10} {'FAILED':>8} {'FAILED':>9}")
            continue
        mape = _fmt(r.get("overall_mape"), "%")
        mae = _fmt(r.get("overall_mae_bdt"), " BDT")
        wr = _fmt(r.get("model_win_rate"), "%")
        cov = _fmt(r.get("coverage_rate"), "%")
        print(f"    {model_name:<20} {mape:>8} {mae:>10} {wr:>8} {cov:>9}")
        mae_val = r.get("overall_mae_bdt")
        if mae_val is not None and (best_mae is None or mae_val < best_mae):
            best_mae = mae_val
            best_model = model_name
    if best_model:
        print(f"    {'':>20} {'':>8} {'':>10} {'':>8} {'Best: ' + best_model:>9}")


def print_aggregate_table(agg):
    """Print aggregated comparison table across all months."""
    print(f"\n  {'='*60}")
    print(f"  Aggregate across all months:")
    print(f"  {'='*60}")
    print(f"  {'Model':<20} {'MAPE':>8} {'MAE(BDT)':>10} {'WinRate':>8} {'Coverage':>9} {'Budgets':>8}")
    print(f"  {'-'*20} {'-'*8} {'-'*10} {'-'*8} {'-'*9} {'-'*8}")
    best_mae = None
    best_model = None
    for model_name in _MODELS:
        r = agg.get(model_name)
        if r is None:
            print(f"  {model_name:<20} {'FAILED':>8} {'FAILED':>10} {'FAILED':>8} {'FAILED':>9} {'FAILED':>8}")
            continue
        print(f"  {model_name:<20} {_fmt(r['overall_mape'], '%'):>8} "
              f"{_fmt(r['overall_mae_bdt'], ' BDT'):>10} "
              f"{_fmt(r['model_win_rate'], '%'):>8} "
              f"{_fmt(r['coverage_rate'], '%'):>9} "
              f"{r['total_budgets']:>8}")
        mae_val = r["overall_mae_bdt"]
        if mae_val is not None and (best_mae is None or mae_val < best_mae):
            best_mae = mae_val
            best_model = model_name
    if best_model:
        print(f"  {'-'*60}")
        print(f"  Best overall: {best_model} (MAE={best_mae:.1f} BDT)")


# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Compare ML models on backtest")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--target-month", type=int, default=None, help="Single month")
    parser.add_argument("--target-year", type=int, default=None, help="Single year")
    parser.add_argument("--cutoff-day", type=int, default=13)
    parser.add_argument("--all-months", action="store_true",
                        help="Run for all months (skipping first 3 warmup months)")
    parser.add_argument("--skip-months", type=int, default=SKIP_FIRST_MONTHS,
                        help="Number of initial months to skip for warmup (default: 3)")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    if args.all_months:
        main_all_months(cursor, args.user_id, args.cutoff_day, args.skip_months)
    elif args.target_month and args.target_year:
        main_single_month(cursor, args.user_id, args.target_month, args.target_year, args.cutoff_day)
    else:
        parser.error("Provide --target-month/--target-year or --all-months")

    conn.close()


def main_single_month(cursor, user_id, month, year, cutoff_day):
    print(f"Running models...")
    results = run_single_month(cursor, user_id, month, year, cutoff_day)

    # Print per-model table
    print(f"\n{'='*70}")
    print(f"  Model Comparison: user {user_id[:8]}.., {month}/{year}, cutoff day {cutoff_day}")
    print(f"{'='*70}")
    print(f"  {'Model':<20} {'MAPE':>8} {'MAE(BDT)':>10} {'WinRate':>8} {'Coverage':>9}")
    print(f"  {'-'*20} {'-'*8} {'-'*10} {'-'*8} {'-'*9}")
    best_mae = None
    best_model = None
    for model_name in _MODELS:
        r = results.get(model_name)
        if r is None:
            print(f"  {model_name:<20} {'FAILED':>8} {'FAILED':>10} {'FAILED':>8} {'FAILED':>9}")
            continue
        print(f"  {model_name:<20} {_fmt(r.get('overall_mape'), '%'):>8} "
              f"{_fmt(r.get('overall_mae_bdt'), ' BDT'):>10} "
              f"{_fmt(r.get('model_win_rate'), '%'):>8} "
              f"{_fmt(r.get('coverage_rate'), '%'):>9}")
        mae = r.get("overall_mae_bdt")
        if mae is not None and (best_mae is None or mae < best_mae):
            best_mae = mae
            best_model = model_name
    if best_model:
        print(f"\n  Best: {best_model} (MAE={best_mae:.1f} BDT)")

    # Segment breakdown
    print(f"\n  Segment Breakdown:")
    result_tuples = [(m, results.get(m)) for m in _MODELS]
    for seg_key, seg_label in [("dense", "Dense (>=30d, >=35%)"),
                                ("mid", "Mid (>=14d, >=18%)"),
                                ("sparse", "Sparse (fallback)")]:
        _print_segment_table(seg_key, seg_label, result_tuples)

    # JSON
    print(f"\n  JSON output:")
    summary = {}
    for model_name in _MODELS:
        r = results.get(model_name)
        if r is None:
            continue
        summary[model_name] = {
            "overall_mape": r.get("overall_mape"),
            "overall_mae_bdt": r.get("overall_mae_bdt"),
            "model_win_rate": r.get("model_win_rate"),
            "coverage_rate": r.get("coverage_rate"),
            "mean_mae_bdt": r.get("mean_mae_bdt"),
            "segment_metrics": r.get("segment_metrics"),
        }
    print(json.dumps(summary, indent=2))


def main_all_months(cursor, user_id, cutoff_day, skip_months):
    # Discover user's date range from expenses
    cursor.execute("""
        SELECT EXTRACT(YEAR FROM MIN(expense_date))::int,
               EXTRACT(MONTH FROM MIN(expense_date))::int,
               EXTRACT(YEAR FROM MAX(expense_date))::int,
               EXTRACT(MONTH FROM MAX(expense_date))::int
        FROM expenses e
        JOIN context_members cm ON cm.context_id = e.context_id
        WHERE cm.user_id = %s AND cm.status = 'active' AND e.deleted_at IS NULL
    """, (user_id,))
    row = cursor.fetchone()
    if not row or row[0] is None:
        print("No expense data found for this user.")
        return

    y0, m0, y1, m1 = row
    # Build list of all months
    all_months = []
    y, m = y0, m0
    while (y < y1) or (y == y1 and m <= m1):
        all_months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1

    # Skip warmup months
    test_months = all_months[skip_months:]
    if not test_months:
        print(f"Not enough data. Found {len(all_months)} months, need >{skip_months}.")
        return

    print(f"User {user_id[:8]}..  data range: {m0}/{y0} to {m1}/{y1}")
    print(f"Warmup months (skipped): {' '.join(f'{m}/{y}' for y, m in all_months[:skip_months])}")
    print(f"Testing {len(test_months)} months: {' '.join(f'{m}/{y}' for y, m in test_months)}")
    print()

    # Run backtest for each month
    all_monthly = {m: [] for m in _MODELS}  # {model_name: [result_dicts]}
    for ym_idx, (year, month) in enumerate(test_months):
        print(f"[{ym_idx + 1}/{len(test_months)}] {month}/{year}... ", end="", flush=True)
        results = run_single_month(cursor, user_id, month, year, cutoff_day)

        # Accumulate per-model
        for model_name in _MODELS:
            all_monthly[model_name].append(results.get(model_name))

        # Print inline result
        best = None
        best_mae = None
        parts = []
        for model_name in _MODELS:
            r = results.get(model_name)
            if r is None:
                parts.append(f"{model_name[:4]}=FAIL")
                continue
            mae = r.get("overall_mae_bdt")
            mape = r.get("overall_mape")
            parts.append(f"{model_name[:4]}={_fmt(mape, '%')}")
            if mae is not None and (best_mae is None or mae < best_mae):
                best_mae = mae
                best = model_name
        print(f"  {' | '.join(parts)}  >> {best}")

    # ── Aggregate table ──
    agg = _aggregate_across_months(all_monthly)
    print_aggregate_table(agg)

    # ── Per-month detail table ──
    print(f"\n  {'='*60}")
    print(f"  Per-month breakdown:")
    print(f"  {'='*60}")
    header = f"  {'Month':>7}  "
    for m in _MODELS:
        header += f"  {m[:8]:>10}"
    print(header)
    print(f"  {'-'*7}  " + "  " + f"{'-'*10}  " * len(_MODELS))
    for (year, month) in test_months:
        line = f"  {month:>2}/{year:<4}  "
        for model_name in _MODELS:
            r = all_monthly[model_name][test_months.index((year, month))]
            if r is None:
                line += f"  {'FAIL':>10}"
            else:
                line += f"  {_fmt(r.get('overall_mape'), '%'):>10}"
        print(line)

    # ── JSON output ──
    print(f"\n  JSON output:")
    output = {}
    for model_name in _MODELS:
        months_data = []
        for ym_idx, (year, month) in enumerate(test_months):
            r = all_monthly[model_name][ym_idx]
            if r is None:
                continue
            months_data.append({
                "month": month,
                "year": year,
                "overall_mape": r.get("overall_mape"),
                "overall_mae_bdt": r.get("overall_mae_bdt"),
                "model_win_rate": r.get("model_win_rate"),
                "coverage_rate": r.get("coverage_rate"),
            })
        output[model_name] = {
            "months": months_data,
            "aggregate": agg.get(model_name),
        }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
