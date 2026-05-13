#!/usr/bin/env python3
"""
Export all labeled expenses from PostgreSQL to a CSV.
The notebook loads this CSV and splits into train/test itself.

Usage:  python scripts/export.py
        python scripts/export.py --limit 100000
"""

import argparse, os
import psycopg2
import pandas as pd

DB_CONFIG = {
    "host": "127.0.0.1", "port": 5435,
    "dbname": "spendwise", "user": "spendwise", "password": "spendwise",
}

BASE = os.path.dirname(os.path.abspath(__file__))


def clean_note(note):
    if note is None or note.strip() == "":
        return None
    note = note.strip().lower()
    note = note.replace("—", " ").replace("–", " ").replace("-", " ")
    note = note.replace("/", " ").replace(",", " ")
    note = note.replace("'", "").replace('"', "").replace("!", "").replace("?", "").replace(".", "")
    note = " ".join(note.split())
    return note


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Limit rows (0 = all)")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    query = """
        SELECT e.note, c.name AS category
        FROM expenses e
        JOIN categories c ON e.category_id = c.id
        WHERE e.note IS NOT NULL AND e.note != ''
    """
    if args.limit > 0:
        query += f" LIMIT {args.limit}"

    df = pd.read_sql(query, conn)
    conn.close()
    print(f"Loaded {len(df):,} labeled samples")

    df["note"] = df["note"].apply(clean_note)
    df = df[df["note"].notna() & (df["note"].str.len() >= 2)].reset_index(drop=True)
    print(f"After cleaning: {len(df):,}")

    csv_path = os.path.join(BASE, "data.csv")
    df.to_csv(csv_path, index=False)
    print(f"Saved: {csv_path}")


if __name__ == "__main__":
    main()
