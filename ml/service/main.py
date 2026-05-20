"""
FastAPI microservice for SpendWise ML forecasting.

Runs independently from the PHP backend. PHP calls these endpoints
via HTTP instead of shell_exec, avoiding all cross-platform issues.

Usage:
    python -m uvicorn ml.service.main:app --port 5100
"""

import sys, os
from datetime import date

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

app = FastAPI(title="SpendWise ML Service", version="1.0")


class ForecastRequest(BaseModel):
    user_id: str
    db_host: str = "127.0.0.1"
    db_port: int = 5435


class BacktestRequest(BaseModel):
    user_id: str
    month: int
    year: int
    cutoff_day: int = 13
    db_host: str = "127.0.0.1"
    db_port: int = 5435


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast")
def forecast(req: ForecastRequest):
    try:
        from ml.forecast.run import forecast_for_user, load_model_engine
        import psycopg2

        conn = psycopg2.connect(
            host=req.db_host, port=req.db_port,
            dbname="spendwise", user="spendwise", password="spendwise",
        )
        cursor = conn.cursor()

        forecast_fn, _ = load_model_engine("xgboost")
        results = forecast_for_user(cursor, req.user_id, dry_run=False, forecast_remaining_fn=forecast_fn)

        if results:
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
            data = [
                (r["context_id"], r["category_id"], r["month"], r["year"],
                 r["projected_amount"], r["budget_amount"],
                 r["spent_so_far"], r["alert_tier"])
                for r in results
            ]
            cursor.executemany(insert_sql, data)

        conn.commit()
        conn.close()

        return {"forecasts": results or [], "notifications": []}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
def backtest(req: BacktestRequest):
    try:
        from ml.forecast.run import backtest_for_user, load_model_engine
        import psycopg2

        conn = psycopg2.connect(
            host=req.db_host, port=req.db_port,
            dbname="spendwise", user="spendwise", password="spendwise",
        )
        cursor = conn.cursor()

        forecast_fn, forecast_with_interval_fn = load_model_engine("xgboost")
        result = backtest_for_user(
            cursor, req.user_id, req.month, req.year, req.cutoff_day,
            forecast_remaining_fn=forecast_fn,
            forecast_remaining_with_interval_fn=forecast_with_interval_fn,
        )
        conn.close()
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
