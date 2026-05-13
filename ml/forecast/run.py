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


if __name__ == "__main__":
    run()
