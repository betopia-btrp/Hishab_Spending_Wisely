#!/usr/bin/env bash
# ────────────────────────────────────────────────────────
# SpendWise — Load generated TSV data into Docker Postgres
# Usage:  bash ml/seeding/load.sh
# ────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER="spendwise-db"
DB_USER="spendwise"
DB_NAME="spendwise"
TSV_DIR="ml/seeding/output"
SQL_FILE="ml/seeding/import.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "[!] Run this from the project root (where $SQL_FILE lives)"
    exit 1
fi

echo "[1/3] Copying TSV files to container..."
docker cp "$TSV_DIR/." "$CONTAINER:/tmp/seeding/"

echo "[2/3] Piping import.sql into psql..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$SQL_FILE"

echo "[3/3] Done."
