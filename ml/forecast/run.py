#!/usr/bin/env python3
"""
SpendWise — Spending Forecast per user.

Generates month-end projections per budget category using Prophet (ML)
with a linear fallback. Also supports backtesting to measure accuracy.

Usage:
    python3 ml/forecast/run.py --user-id <uuid>
    python3 ml/forecast/run.py --user-id <uuid> --dry-run
    python3 ml/forecast/run.py --user-id <uuid> --target-month 5 --target-year 2026 --cutoff-day 15
"""

import argparse, os, sys
from datetime import date, timedelta
import psycopg2
import pandas as pd

# ── Database config (overridable via --db-host / --db-port CLI args) ──────────
DB_CONFIG = {
    "host": "127.0.0.1", "port": 5435,
    "dbname": "spendwise", "user": "spendwise", "password": "spendwise",
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
from regression_model import forecast_remaining
from alert_tiers import evaluate as evaluate_alert


# ── Main forecast: projects spending for each budget for the current month ────
def forecast_for_user(cursor, user_id, dry_run=False):
    """
    For each budget the user has in the current month:
      1. Fetch daily spend so far
      2. Fetch last 90 days of history for training
      3. Try Prophet ML forecast for remaining days; fall back to linear projection
      4. Evaluate alert tier (overspend / on_track_exceed / early_warning)
      5. Return list of results (one per budget category)
    """
    today = date.today()
    month, year = today.month, today.year
    # Calculate total days in current month
    total_days = (date(year + 1, 1, 1) if month == 12
                  else date(year, month + 1, 1) - date(year, month, 1)).days
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
        SELECT b.id, b.context_id, b.category_id, b.amount
        FROM budgets b
        WHERE b.context_id = ANY(%s::uuid[])
          AND b.month = %s AND b.year = %s
          AND b.amount > 0
    """
    cursor.execute(budget_query, (ctx_ids, month, year))
    budgets = cursor.fetchall()

    # Step 3: Loop through each budget and project
    for b in budgets:
        budget_id = b[0]
        context_id = b[1]
        category_id = b[2]
        budget_amount = float(b[3])

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

        # ── Try regression model forecast if enough history (>= 7 days) ──
        if hist_n_days >= 7:
            df = pd.DataFrame(hist_rows, columns=["ds", "y"])
            projected_remaining = forecast_remaining(
                df, days_left,
                historical_daily_avg=historical_daily_avg
            )
        else:
            projected_remaining = None

        # ── Fallback: linear projection if regression fails or insufficient data ──
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
def backtest_for_user(cursor, user_id, target_month, target_year, cutoff_day):
    """
    Run forecast as if today were cutoff_day (past date), then compare
    projected month-end total against the actual full-month spend.

    Returns per-category daily breakdown + overall MAPE score.
    Used by the Forecast backtest UI tab to measure accuracy.
    """
    today = date(target_year, target_month, cutoff_day)
    total_days = (date(target_year + 1, 1, 1) if target_month == 12
                  else date(target_year, target_month + 1, 1) - date(target_year, target_month, 1)).days
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
                "cutoff_day": cutoff_day, "overall_mape": None, "results": []}

    ctx_ids = [c[0] for c in contexts]
    results = []

    # Get budgets for the target month
    budget_query = """
        SELECT b.id, b.context_id, b.category_id, b.amount
        FROM budgets b
        WHERE b.context_id = ANY(%s::uuid[])
          AND b.month = %s AND b.year = %s
          AND b.amount > 0
    """
    cursor.execute(budget_query, (ctx_ids, target_month, target_year))
    budgets = cursor.fetchall()

    if not budgets:
        return {"backtest": True, "target_month": target_month, "target_year": target_year,
                "cutoff_day": cutoff_day, "overall_mape": None, "results": []}

    for b in budgets:
        budget_id = b[0]
        context_id = b[1]
        category_id = b[2]
        budget_amount = float(b[3])

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

        # ── D) Historical data (90 days before cutoff, for Prophet training) ──
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

        # ── E) Projection (regression → linear fallback) ──
        if hist_n_days >= 7:
            df = pd.DataFrame(hist_rows, columns=["ds", "y"])
            projected_remaining = forecast_remaining(
                df, days_left, historical_daily_avg=historical_daily_avg
            )
        else:
            projected_remaining = None

        if projected_remaining is None:
            projected_remaining = linear_projection(
                spent_so_far, days_passed, days_left,
                historical_daily_avg=historical_daily_avg,
                n_days=n_days,
            )

        projected_total = round(spent_so_far + projected_remaining, 2)
        alert_tier = evaluate_alert(
            spent_so_far, projected_total, budget_amount,
            days_left, total_days
        )

        # MAPE = Mean Absolute Percentage Error (how off the projection was)
        mape = round(abs(projected_total - actual_total) / actual_total * 100, 2) if actual_total > 0 else None

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
            "projected": projected_total,
            "actual": actual_total,
            "mape": mape,
            "alert_tier": alert_tier,
            "daily_breakdown": daily_breakdown,
        })

    # Overall MAPE: weighted by actual spend (so larger categories count more)
    valid = [r for r in results if r["mape"] is not None]
    overall_mape = round(
        sum(r["mape"] * r["actual"] for r in valid) / sum(r["actual"] for r in valid), 2
    ) if valid and sum(r["actual"] for r in valid) > 0 else None

    return {
        "backtest": True,
        "target_month": target_month,
        "target_year": target_year,
        "cutoff_day": cutoff_day,
        "overall_mape": overall_mape,
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
    args = parser.parse_args()

    patch_db_config(args)
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    # Backtest mode: --target-month and --target-year are provided
    if args.target_month and args.target_year:
        import json
        result = backtest_for_user(cursor, args.user_id, args.target_month, args.target_year, args.cutoff_day)
        print(json.dumps(result))
        conn.close()
        return

    # Default mode: run forecast for current month
    results = forecast_for_user(cursor, args.user_id, args.dry_run)

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
