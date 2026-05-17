# SpendWise

Group expense management — track shared expenses, split bills, manage budgets, and settle balances with friends.

## Quick Start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux)

```bash
git clone <repo-url>
cd Hishab_Spending_Wisely
cp expense-management-api/.env.example expense-management-api/.env
cp spendwise/.env.example spendwise/.env
# edit .env files to add your Stripe keys
docker compose up --build
```

On first run, the entrypoint automatically: waits for PostgreSQL, generates `APP_KEY`, generates `JWT_SECRET`, runs migrations, and seeds the database.

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4000 |
| API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/api/documentation |

### Seeded Account

| Email | Password |
|-------|----------|
| test@example.com | password |

## Manual Setup (Without Docker)

If you prefer running natively, you need PHP 8.4+, Composer, Node.js 22+, and PostgreSQL 17.

```bash
# Backend
cd expense-management-api
cp .env.example .env
# Edit .env: set DB_HOST=127.0.0.1, DB credentials, STRIPE_KEY, STRIPE_SECRET, and GEMINI_API_KEY
composer install
php artisan migrate:fresh --seed
php artisan stripe:sync-prices
php artisan key:generate
php artisan jwt:secret
php -S localhost:8000 -t public                # port 8000

# Frontend (separate terminal)
cd Hishab_Spending_Wisely
cd spendwise
cp .env.example .env.local
npm install
npm run dev                       # port 4000
```

## Common Commands

```bash
docker compose up --build         # Build and start everything
docker compose down               # Stop everything
docker compose down -v            # Stop and nuke database/volumes
docker compose logs -f            # Follow all logs
docker compose exec api bash      # Shell into API container
docker compose exec api php artisan tinker   # Laravel tinker

make fresh    # Nuke DB, re-seed, sync Stripe prices
make shell    # Bash into API container
make seed     # Re-seed database
make sync     # Sync Stripe prices
make logs     # Follow all logs
make restart  # Restart API
```

## ML / Forecast Setup

The app uses Python ML models for spending forecasts and auto-categorization.

```bash
# From project root (Hishab_Spending_Wisely/)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r ml/requirements.txt
pip install -r ml/forecast/requirements.txt

# Install fastText CLI (for auto-categorization)
mkdir -p /tmp/fastText && cd /tmp/fastText
git clone https://github.com/facebookresearch/fastText.git .
make
cd -

# Train auto-categorization model (run once after seeding)
# This uses the existing expense data to train a FastText model
python3 ml/auto_categorize/export.py
```

The forecast script (`ml/forecast/run.py`) runs automatically when you visit the Dashboard or Budgets tab. It uses Prophet (Facebook's time-series ML) to predict month-end spending per budget category based on the last 90 days of expense history.

The auto-categorization model lives at `expense-management-api/storage/app/ml/autocategorize.ftz` and the fastText CLI is expected at `/tmp/fastText/fasttext`. When adding expenses, the app suggests a category based on the note text.

### Troubleshooting

- **Forecast returns old data or `{"predictions":[]}`** — Make sure the venv is activated and both `requirements.txt` files are installed. The PHP backend calls `venv/bin/python3` via a project-relative path (`base_path('../venv/bin/python3')`).
- **Auto-categorization returns empty** — Run `python3 ml/auto_categorize/export.py` to generate the model file. Ensure `/tmp/fastText/fasttext` exists (see install step above).

## Environment Variables

Edit `expense-management-api/.env` for:
- **Stripe** — `STRIPE_KEY`, `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`
- **Gemini AI** — `GEMINI_API_KEY`
