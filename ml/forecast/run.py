#!/usr/bin/env python3
"""
SpendWise — Spending Forecast per user.

Generates month-end projections per budget category using ML
(lightgbm / random_forest / xgboost) with a linear fallback.

Usage:
    python3 ml/forecast/run.py --user-id <uuid>
    python3 ml/forecast/run.py --user-id <uuid> --model random_forest
    python3 ml/forecast/run.py --user-id <uuid> --target-month 5 --target-year 2026 --cutoff-day 15
    python3 ml/forecast/run.py --user-id <uuid> --target-month 5 --target-year 2026 --model xgboost
"""

import argparse, os, sys, importlib
from datetime import date, timedelta
import psycopg2
import pandas as pd
import numpy as np

# ── Database config (overridable via --db-host / --db-port CLI args) ──────────
DB_CONFIG = {
    "host": "127.0.0.1", "port": 5435,
    "dbname": "spendwise", "user": "spendwise", "password": "spendwise",
}

_MODEL_REGISTRY = {
    "lightgbm": "lightbgm",
    "random_forest": "random_forest",
    "xgboost": "xgboost_model",
}

def patch_db_config(args):
    """Override DB_CONFIG with CLI-provided host/port (used in Docker)."""
    if args.db_host:
        DB_CONFIG["host"] = args.db_host
    if args.db_port:
        DB_CONFIG["port"] = int(args.db_port)

# Import sibling modules (linear_fallback, alert_tiers) from same directory
BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from linear_fallback import linear_projection
from alert_tiers import evaluate as evaluate_alert


def load_model_engine(model_name):
    """Lazy-import the requested ML model module and return its forecast functions."""
    module_name = _MODEL_REGISTRY.get(model_name)
    if module_name is None:
        available = ", ".join(_MODEL_REGISTRY)
        raise ValueError(f"Unknown model '{model_name}'. Available: {available}")
    mod = importlib.import_module(module_name)
    return mod.forecast_remaining, mod.forecast_remaining_with_interval


def naive_baseline_total(spent_so_far, days_passed, days_left, historical_daily_avg=None):
    """Simple carry-forward baseline for month-end total projection."""
    if days_left <= 0:
        return round(float(spent_so_far), 2)

    if days_passed > 0 and spent_so_far > 0:
        daily_rate = spent_so_far / days_passed
    elif historical_daily_avg and historical_daily_avg > 0:
        daily_rate = historical_daily_avg
    else:
        daily_rate = 0.0

    return round(float(spent_so_far + (daily_rate * days_left)), 2)


def weighted_mean(values, weights):
    paired = [(v, w) for v, w in zip(values, weights) if v is not None and w is not None and w > 0]
    if not paired:
        return None
    numerator = sum(v * w for v, w in paired)
    denominator = sum(w for _, w in paired)
    if denominator <= 0:
        return None
    return round(numerator / denominator, 2)


def density_segment(hist_n_days, hist_density):
    if hist_n_days >= 30 and hist_density >= 0.35:
        return "dense"
    if hist_n_days >= 14 and hist_density >= 0.18:
        return "mid"
    return "sparse"


def aggregate_segment_metrics(results):
    segments = {}
    for row in results:
        seg = row["segment"]
        segments.setdefault(seg, []).append(row)

    summary = {}
    for seg, rows in segments.items():
        weights = [r["actual"] for r in rows]
        interval_rows = [r for r in rows if r["interval_hit"] is not None]
        win_rows = [r for r in rows if isinstance(r["model_beats_baseline"], bool)]
        summary[seg] = {
            "count": len(rows),
            "overall_mape": weighted_mean([r["mape"] for r in rows], weights),
            "overall_mae_bdt": weighted_mean([r["mae_bdt"] for r in rows], weights),
            "baseline_overall_mape": weighted_mean([r["baseline_mape"] for r in rows], weights),
            "baseline_overall_mae_bdt": weighted_mean([r["baseline_mae_bdt"] for r in rows], weights),
            "model_win_rate": round(
                (sum(1 for r in win_rows if r["model_beats_baseline"]) / len(win_rows)) * 100, 2
            ) if win_rows else None,
            "coverage_rate": round(
                (sum(1 for r in interval_rows if r["interval_hit"]) / len(interval_rows)) * 100, 2
            ) if interval_rows else None,
            "interval_rows": len(interval_rows),
        }
    return summary


# ── Main forecast: projects spending for each budget for the current month ────
def forecast_for_user(cursor, user_id, dry_run=False, forecast_remaining_fn=None):
    """
    For each budget the user has in the current month:
      1. Fetch daily spend so far
      2. Fetch last 90 days of history for training
      3. Try LightGBM forecast for remaining days; fall back to linear projection
      4. Evaluate alert tier (overspend / on_track_exceed / early_warning)
      5. Return list of results (one per budget category)
    """
    today = date.today()
    month, year = today.month, today.year
    # Calculate total days in current month
    month_end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    total_days = (month_end - date(year, month, 1)).days
    days_passed = today.day - 1
    days_left = total_days - days_passed

    # Step 1: Find all group/contexts the user belongs to
    cursor.execute("""
        SELECT c.id, c.type
        FROM contexts c
        JOIN context_members cm ON cm.context_id = c.id
        WHERE cm.user_id = %s AND cm.status = 'active'
    """, (user_id,))
    contexts = cursor.fetchall()
    if not contexts:
        return []

    ctx_ids = [c[0] for c in contexts]
    results = []

    # Step 2: Get all budgets for this user's contexts for the current month
    budget_query = """
        SELECT b.context_id, b.category_id, SUM(b.amount)::numeric AS amount
        FROM budgets b
        WHERE b.context_id = ANY(%s::uuid[])
          AND b.month = %s AND b.year = %s
          AND b.amount > 0
        GROUP BY b.context_id, b.category_id
    """
    cursor.execute(budget_query, (ctx_ids, month, year))
    budgets = cursor.fetchall()

    # Step 3: Loop through each budget and project
    for b in budgets:
        context_id = b[0]
        category_id = b[1]
        budget_amount = float(b[2])

        # ── Fetch daily spend so far this month ──
        if category_id:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, category_id, date(year, month, 1), today))
        else:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, date(year, month, 1), today))

        rows = cursor.fetchall()
        spent_so_far = round(float(sum(r[1] for r in rows)), 2)
        n_days = len(rows)

        if n_days == 0:
            continue  # skip budgets with no spend yet this month

        # ── Fetch last 90 days of data for ML training ──
        lookback_start = today - timedelta(days=90)
        if category_id:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, category_id, lookback_start, today))
        else:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, lookback_start, today))

        hist_rows = cursor.fetchall()
        hist_n_days = len(hist_rows)
        hist_density = hist_n_days / 90.0

        # ── Compute recency-weighted historical daily average ──
        # Buckets: last 30 days (weight 3), days 31-60 (weight 2), days 61-90 (weight 1)
        # This means recent spending patterns influence the average more.
        historical_daily_avg = None
        if hist_rows:
            cutoff_30 = today - timedelta(days=30)
            cutoff_60 = today - timedelta(days=60)
            weighted_total = 0.0
            for r in hist_rows:
                d = r[0]
                if d >= cutoff_30:
                    weight = 3
                elif d >= cutoff_60:
                    weight = 2
                else:
                    weight = 1
                weighted_total += float(r[1]) * weight
            historical_daily_avg = weighted_total / (30 * 3 + 30 * 2 + 30)

        # ── Try ML model forecast (falls back to linear if None returned) ──
        df = pd.DataFrame(hist_rows, columns=["ds", "y"])
        projected_remaining = forecast_remaining_fn(
            df, days_left,
            historical_daily_avg=historical_daily_avg
        ) if forecast_remaining_fn else None

        # ── Fallback: linear projection if LightGBM fails ──
        if projected_remaining is None:
            projected_remaining = linear_projection(
                spent_so_far, days_passed, days_left,
                historical_daily_avg=historical_daily_avg,
                n_days=n_days,
            )

        projected_total = round(spent_so_far + projected_remaining, 2)

        # ── Evaluate alert tier based on projected vs budget ──
        alert_tier = evaluate_alert(
            spent_so_far, projected_total, budget_amount,
            days_left, total_days
        )

        results.append({
            "context_id": context_id,
            "category_id": category_id,
            "month": month, "year": year,
            "projected_amount": projected_total,
            "budget_amount": budget_amount,
            "spent_so_far": spent_so_far,
            "alert_tier": alert_tier,
        })

        if dry_run:
            cat_label = category_id[:8] if category_id else "overall"
            tier = alert_tier or "ok"
            print(f"  {tier:20s} ctx={context_id[:8]}.. cat={cat_label}  "
                  f"spent={spent_so_far:>8.2f}  "
                  f"projected={projected_total:>8.2f}  "
                  f"budget={budget_amount:>8.2f}")

    return results


# ── Backtest: simulates forecast from a past cutoff date and compares with actuals ──
def backtest_for_user(cursor, user_id, target_month, target_year, cutoff_day,
                      forecast_remaining_fn=None, forecast_remaining_with_interval_fn=None):
    """
    Run forecast as if today were cutoff_day (past date), then compare
    projected month-end total against the actual full-month spend.

    Returns per-category daily breakdown + aggregate evaluation metrics.
    Used by the Forecast backtest UI tab to measure accuracy.
    """
    interval_level = 0.8
    today = date(target_year, target_month, cutoff_day)
    month_end = date(target_year + 1, 1, 1) if target_month == 12 else date(target_year, target_month + 1, 1)
    total_days = (month_end - date(target_year, target_month, 1)).days
    days_passed = today.day - 1
    days_left = total_days - days_passed

    if total_days < cutoff_day:
        cutoff_day = total_days

    # Find user's contexts
    cursor.execute("""
        SELECT c.id, c.type
        FROM contexts c
        JOIN context_members cm ON cm.context_id = c.id
        WHERE cm.user_id = %s AND cm.status = 'active'
    """, (user_id,))
    contexts = cursor.fetchall()
    if not contexts:
        return {"backtest": True, "target_month": target_month, "target_year": target_year,
                "cutoff_day": cutoff_day, "interval_level": interval_level,
                "overall_mape": None, "overall_mae_bdt": None,
                "baseline_overall_mape": None, "baseline_overall_mae_bdt": None,
                "coverage_rate": None, "results": []}

    ctx_ids = [c[0] for c in contexts]
    results = []

    # Get budgets for the target month
    budget_query = """
        SELECT b.context_id, b.category_id, SUM(b.amount)::numeric AS amount
        FROM budgets b
        WHERE b.context_id = ANY(%s::uuid[])
          AND b.month = %s AND b.year = %s
          AND b.amount > 0
        GROUP BY b.context_id, b.category_id
    """
    cursor.execute(budget_query, (ctx_ids, target_month, target_year))
    budgets = cursor.fetchall()

    if not budgets:
        return {"backtest": True, "target_month": target_month, "target_year": target_year,
                "cutoff_day": cutoff_day, "interval_level": interval_level,
                "overall_mape": None, "overall_mae_bdt": None,
                "baseline_overall_mape": None, "baseline_overall_mae_bdt": None,
                "coverage_rate": None, "results": []}

    for b in budgets:
        context_id = b[0]
        category_id = b[1]
        budget_amount = float(b[2])

        # Get category name for display
        cursor.execute("SELECT name FROM categories WHERE id = %s", (category_id,))
        cat_row = cursor.fetchone()
        category_name = cat_row[0] if cat_row else "Base"

        # ── A) Expenses up to cutoff day (acts as "training data" for the backtest) ──
        if category_id:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, category_id, date(target_year, target_month, 1), today))
        else:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, date(target_year, target_month, 1), today))

        train_rows = cursor.fetchall()
        spent_so_far = round(float(sum(r[1] for r in train_rows)), 2)
        n_days = len(train_rows)

        if n_days == 0:
            continue

        # ── B) Full month actual total (used as ground truth for comparison) ──
        if category_id:
            cursor.execute("""
                SELECT SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
            """, (context_id, category_id, date(target_year, target_month, 1),
                  date(target_year, target_month, total_days)))
        else:
            cursor.execute("""
                SELECT SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
            """, (context_id, date(target_year, target_month, 1),
                  date(target_year, target_month, total_days)))
        actual_total = round(float(cursor.fetchone()[0] or 0), 2)

        # ── C) Full month daily breakdown (for the chart) ──
        if category_id:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, category_id, date(target_year, target_month, 1),
                  date(target_year, target_month, total_days)))
        else:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, date(target_year, target_month, 1),
                  date(target_year, target_month, total_days)))
        full_month_rows = cursor.fetchall()

        # ── D) Historical data (90 days before cutoff, for LightGBM training) ──
        lookback_start = today - timedelta(days=90)
        if category_id:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s AND category_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, category_id, lookback_start, today))
        else:
            cursor.execute("""
                SELECT expense_date, SUM(amount)::numeric
                FROM expenses
                WHERE context_id = %s
                  AND expense_date >= %s AND expense_date <= %s
                  AND deleted_at IS NULL
                GROUP BY expense_date ORDER BY expense_date
            """, (context_id, lookback_start, today))
        hist_rows = cursor.fetchall()
        hist_n_days = len(hist_rows)
        hist_density = hist_n_days / 90.0
        segment = density_segment(hist_n_days, hist_density)

        # Recency-weighted historical daily average (same logic as forecast_for_user)
        historical_daily_avg = None
        if hist_rows:
            cutoff_30 = today - timedelta(days=30)
            cutoff_60 = today - timedelta(days=60)
            weighted_total = 0.0
            for r in hist_rows:
                d = r[0]
                if d >= cutoff_30:
                    weight = 3
                elif d >= cutoff_60:
                    weight = 2
                else:
                    weight = 1
                weighted_total += float(r[1]) * weight
            historical_daily_avg = weighted_total / (30 * 3 + 30 * 2 + 30)

        # ── E) Projection (LightGBM → linear fallback) ──
        interval_lower = None
        interval_upper = None
        projected_remaining = None
        if forecast_remaining_with_interval_fn is not None:
            df = pd.DataFrame(hist_rows, columns=["ds", "y"])
            interval_result = forecast_remaining_with_interval_fn(
                df,
                days_left,
                historical_daily_avg=historical_daily_avg,
                interval_level=interval_level,
            )
            if interval_result:
                projected_remaining = interval_result["point"]
                interval_lower = interval_result["lower"]
                interval_upper = interval_result["upper"]

        if projected_remaining is None:
            projected_remaining = linear_projection(
                spent_so_far, days_passed, days_left,
                historical_daily_avg=historical_daily_avg,
                n_days=n_days,
            )
            interval_lower = None
            interval_upper = None

        projected_total = round(spent_so_far + projected_remaining, 2)
        alert_tier = evaluate_alert(
            spent_so_far, projected_total, budget_amount,
            days_left, total_days
        )

        # Model errors
        mape = round(abs(projected_total - actual_total) / actual_total * 100, 2) if actual_total > 0 else None
        mae_bdt = round(abs(projected_total - actual_total), 2)

        # Naive baseline errors
        baseline_total = naive_baseline_total(
            spent_so_far=spent_so_far,
            days_passed=days_passed,
            days_left=days_left,
            historical_daily_avg=historical_daily_avg,
        )
        baseline_mape = round(abs(baseline_total - actual_total) / actual_total * 100, 2) if actual_total > 0 else None
        baseline_mae_bdt = round(abs(baseline_total - actual_total), 2)
        model_beats_baseline = mae_bdt < baseline_mae_bdt

        # Interval calibration (if interval exists)
        if interval_lower is not None and interval_upper is not None:
            total_pred_lower = round(spent_so_far + interval_lower, 2)
            total_pred_upper = round(spent_so_far + interval_upper, 2)
            interval_hit = total_pred_lower <= actual_total <= total_pred_upper
        else:
            total_pred_lower = None
            total_pred_upper = None
            interval_hit = None

        # Build daily breakdown: before cutoff = actual only, after = actual + projected
        daily_projected_amt = round(projected_remaining / days_left, 2) if days_left > 0 else 0
        daily_breakdown = []
        day_map = {r[0].day: float(r[1]) for r in full_month_rows}
        for day_num in range(1, total_days + 1):
            actual_val = day_map.get(day_num, 0)
            if day_num <= cutoff_day:
                daily_breakdown.append({
                    "day": day_num,
                    "projected": None,
                    "actual": actual_val,
                })
            else:
                daily_breakdown.append({
                    "day": day_num,
                    "projected": daily_projected_amt,
                    "actual": actual_val,
                })

        results.append({
            "category_id": category_id,
            "category_name": category_name,
            "context_id": context_id,
            "budget": budget_amount,
            "history_days": hist_n_days,
            "history_density": round(hist_density, 3),
            "segment": segment,
            "projected": projected_total,
            "actual": actual_total,
            "mape": mape,
            "mae_bdt": mae_bdt,
            "baseline_projected": baseline_total,
            "baseline_mape": baseline_mape,
            "baseline_mae_bdt": baseline_mae_bdt,
            "model_beats_baseline": model_beats_baseline,
            "pred_lower": total_pred_lower,
            "pred_upper": total_pred_upper,
            "interval_hit": interval_hit,
            "alert_tier": alert_tier,
            "daily_breakdown": daily_breakdown,
        })

    actual_weights = [r["actual"] for r in results]
    overall_mape = weighted_mean([r["mape"] for r in results], actual_weights)
    overall_mae_bdt = weighted_mean([r["mae_bdt"] for r in results], actual_weights)
    mean_mae_bdt = round(float(np.mean([r["mae_bdt"] for r in results])), 2) if results else None

    baseline_overall_mape = weighted_mean([r["baseline_mape"] for r in results], actual_weights)
    baseline_overall_mae_bdt = weighted_mean([r["baseline_mae_bdt"] for r in results], actual_weights)
    baseline_mean_mae_bdt = round(float(np.mean([r["baseline_mae_bdt"] for r in results])), 2) if results else None

    if baseline_overall_mae_bdt and baseline_overall_mae_bdt > 0 and overall_mae_bdt is not None:
        mae_improvement_pct = round(
            ((baseline_overall_mae_bdt - overall_mae_bdt) / baseline_overall_mae_bdt) * 100,
            2,
        )
    else:
        mae_improvement_pct = None

    mae_improvement_bdt = (
        round(baseline_overall_mae_bdt - overall_mae_bdt, 2)
        if baseline_overall_mae_bdt is not None and overall_mae_bdt is not None
        else None
    )

    if results:
        model_win_rate = round(
            (sum(1 for r in results if r["model_beats_baseline"]) / len(results)) * 100,
            2,
        )
    else:
        model_win_rate = None

    interval_rows = [r for r in results if r["interval_hit"] is not None]
    coverage_rate = round(
        (sum(1 for r in interval_rows if r["interval_hit"]) / len(interval_rows)) * 100,
        2,
    ) if interval_rows else None
    segment_metrics = aggregate_segment_metrics(results)

    return {
        "backtest": True,
        "target_month": target_month,
        "target_year": target_year,
        "cutoff_day": cutoff_day,
        "interval_level": interval_level,
        "overall_mape": overall_mape,
        "overall_mae_bdt": overall_mae_bdt,
        "mean_mae_bdt": mean_mae_bdt,
        "baseline_overall_mape": baseline_overall_mape,
        "baseline_overall_mae_bdt": baseline_overall_mae_bdt,
        "baseline_mean_mae_bdt": baseline_mean_mae_bdt,
        "mae_improvement_bdt": mae_improvement_bdt,
        "mae_improvement_pct": mae_improvement_pct,
        "model_win_rate": model_win_rate,
        "coverage_rate": coverage_rate,
        "interval_rows": len(interval_rows),
        "segment_metrics": segment_metrics,
        "results": results,
    }


# ── CLI entry point: parses args, picks forecast or backtest mode ─────────────
def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--target-month", type=int, help="Month to backtest")
    parser.add_argument("--target-year", type=int, help="Year to backtest")
    parser.add_argument("--cutoff-day", type=int, default=13, help="Day to use as cutoff for backtest")
    parser.add_argument("--db-host", default=None, help="Database host")
    parser.add_argument("--db-port", default=None, help="Database port")
    parser.add_argument(
        "--model", default="xgboost",
        choices=list(_MODEL_REGISTRY),
        help="ML model engine to use for forecasting",
    )
    args = parser.parse_args()

    patch_db_config(args)
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    forecast_fn, forecast_with_interval_fn = load_model_engine(args.model)

    # Backtest mode: --target-month and --target-year are provided
    if args.target_month and args.target_year:
        import json
        result = backtest_for_user(
            cursor, args.user_id, args.target_month, args.target_year, args.cutoff_day,
            forecast_remaining_fn=forecast_fn,
            forecast_remaining_with_interval_fn=forecast_with_interval_fn,
        )
        print(json.dumps(result))
        conn.close()
        return

    # Default mode: run forecast for current month
    results = forecast_for_user(cursor, args.user_id, args.dry_run, forecast_remaining_fn=forecast_fn)

    if not args.dry_run and results:
        # Delete old forecasts for these contexts/month/year before inserting new ones
        ctx_months = set((r["context_id"], r["month"], r["year"]) for r in results)
        for ctx_id, m, y in ctx_months:
            cursor.execute(
                "DELETE FROM ml_forecasts WHERE context_id = %s AND month = %s AND year = %s",
                (ctx_id, m, y)
            )

        # Insert new forecast results into the database
        insert_sql = """
            INSERT INTO ml_forecasts
                (id, context_id, category_id, month, year,
                 projected_amount, budget_amount, spent_so_far, alert_tier,
                 created_at, updated_at)
            VALUES (gen_random_uuid(), %s, %s, %s, %s,
                    %s, %s, %s, %s, NOW(), NOW())
        """
        data = [(r["context_id"], r["category_id"], r["month"], r["year"],
                 r["projected_amount"], r["budget_amount"],
                 r["spent_so_far"], r["alert_tier"]) for r in results]
        cursor.executemany(insert_sql, data)
        conn.commit()

        alerts = [r for r in results if r["alert_tier"]]
        print(f"User {args.user_id[:8]}.. : {len(results)} forecasts, "
              f"{len(alerts)} alerts")

    conn.close()


if __name__ == "__main__":
    run()
