#!/usr/bin/env python3
"""
SpendWise — Spending Forecast per user.

Usage:
    python3 ml/forecast/run.py --user-id <uuid>
    python3 ml/forecast/run.py --user-id <uuid> --dry-run
"""

import argparse, os, sys
from datetime import date, timedelta
import psycopg2
import pandas as pd

DB_CONFIG = {
    "host": "127.0.0.1", "port": 5435,
    "dbname": "spendwise", "user": "spendwise", "password": "spendwise",
}

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from linear_fallback import linear_projection
from alert_tiers import evaluate as evaluate_alert


def forecast_for_user(cursor, user_id, dry_run=False):
    today = date.today()
    month, year = today.month, today.year
    total_days = (date(year + 1, 1, 1) if month == 12
                  else date(year, month + 1, 1) - date(year, month, 1)).days
    days_passed = today.day - 1
    days_left = total_days - days_passed

    # Get contexts this user belongs to
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

    # Get budgets for this user's contexts this month
    budget_query = """
        SELECT b.id, b.context_id, b.category_id, b.amount
        FROM budgets b
        WHERE b.context_id = ANY(%s::uuid[])
          AND b.month = %s AND b.year = %s
          AND b.amount > 0
    """
    cursor.execute(budget_query, (ctx_ids, month, year))
    budgets = cursor.fetchall()

    for b in budgets:
        budget_id = b[0]
        context_id = b[1]
        category_id = b[2]
        budget_amount = float(b[3])

        # Fetch daily spend this month (for current tracked spend)
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
            continue

        # Fetch last 90 days of data for Prophet training
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

        # Compute historical daily average from 90-day window
        historical_daily_avg = None
        if hist_rows:
            lookback_total = sum(float(r[1]) for r in hist_rows)
            historical_daily_avg = lookback_total / 90  # per calendar day avg

        # Forecast — train on last 90 days, predict remaining this month
        if hist_n_days >= 7:
            try:
                from prophet_model import forecast_remaining
                df = pd.DataFrame(hist_rows, columns=["ds", "y"])
                df["ds"] = pd.to_datetime(df["ds"])
                df["y"] = df["y"].astype(float)
                projected_remaining = forecast_remaining(
                    df, days_left,
                    historical_daily_avg=historical_daily_avg
                )
            except Exception:
                projected_remaining = None
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


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    results = forecast_for_user(cursor, args.user_id, args.dry_run)

    if not args.dry_run and results:
        # Delete old forecasts for these contexts/month/year to avoid NULL duplicates
        ctx_months = set((r["context_id"], r["month"], r["year"]) for r in results)
        for ctx_id, m, y in ctx_months:
            cursor.execute(
                "DELETE FROM ml_forecasts WHERE context_id = %s AND month = %s AND year = %s",
                (ctx_id, m, y)
            )

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


def backtest_for_user(cursor, user_id, target_month, target_year, cutoff_day):
    """Run forecast as if today were cutoff_day, then compare with actual full-month spend."""
    today = date(target_year, target_month, cutoff_day)
    total_days = (date(target_year + 1, 1, 1) if target_month == 12
                  else date(target_year, target_month + 1, 1) - date(target_year, target_month, 1)).days
    days_passed = today.day - 1
    days_left = total_days - days_passed

    if total_days < cutoff_day:
        cutoff_day = total_days

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

        # Expenses up to cutoff day (training data)
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

        # Full month actual spend
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

        # Full month daily actual for breakdown
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

        # Historical data for ML (90 days before cutoff)
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

        historical_daily_avg = None
        if hist_rows:
            lookback_total = sum(float(r[1]) for r in hist_rows)
            historical_daily_avg = lookback_total / 90

        if hist_n_days >= 7:
            try:
                from prophet_model import forecast_remaining
                df = pd.DataFrame(hist_rows, columns=["ds", "y"])
                df["ds"] = pd.to_datetime(df["ds"])
                df["y"] = df["y"].astype(float)
                projected_remaining = forecast_remaining(
                    df, days_left, historical_daily_avg=historical_daily_avg
                )
            except Exception:
                projected_remaining = None
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

        mape = round(abs(projected_total - actual_total) / actual_total * 100, 2) if actual_total > 0 else None

        # Build daily breakdown for remaining days
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

    # Overall MAPE (weighted by actual spend)
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


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--target-month", type=int, help="Month to backtest")
    parser.add_argument("--target-year", type=int, help="Year to backtest")
    parser.add_argument("--cutoff-day", type=int, default=13, help="Day to use as cutoff for backtest")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    if args.target_month and args.target_year:
        import json
        result = backtest_for_user(cursor, args.user_id, args.target_month, args.target_year, args.cutoff_day)
        print(json.dumps(result))
        conn.close()
        return

    results = forecast_for_user(cursor, args.user_id, args.dry_run)

    if not args.dry_run and results:
        ctx_months = set((r["context_id"], r["month"], r["year"]) for r in results)
        for ctx_id, m, y in ctx_months:
            cursor.execute(
                "DELETE FROM ml_forecasts WHERE context_id = %s AND month = %s AND year = %s",
                (ctx_id, m, y)
            )

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
