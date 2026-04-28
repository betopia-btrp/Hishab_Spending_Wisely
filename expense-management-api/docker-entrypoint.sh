#!/bin/bash
set -e

echo "==> Clearing stale bootstrap cache..."
rm -f bootstrap/cache/services.php bootstrap/cache/packages.php 2>/dev/null || true

echo "==> Waiting for PostgreSQL..."
until php -r "try { new PDO('pgsql:host=${DB_HOST:-db};port=${DB_PORT:-5432};dbname=${DB_DATABASE:-spendwise}', '${DB_USERNAME:-spendwise}', '${DB_PASSWORD:-spendwise}'); exit(0); } catch (Exception \$e) { exit(1); }" 2>/dev/null; do
    sleep 1
done
echo "==> PostgreSQL is ready."

if [ ! -f vendor/autoload.php ]; then
    echo "==> Installing PHP dependencies..."
    composer install --no-interaction
fi

if ! grep -q '^APP_KEY=base64:' .env 2>/dev/null; then
    echo "==> Generating APP_KEY..."
    php artisan key:generate --force
fi

if ! grep -q '^JWT_SECRET=' .env 2>/dev/null; then
    echo "==> Generating JWT_SECRET..."
    php artisan jwt:secret --force
fi

if [ "${SKIP_MIGRATIONS:-}" != "true" ]; then
    echo "==> Running migrations..."
    php artisan migrate --force

    echo "==> Seeding database..."
    php artisan db:seed --force || true

    echo "==> Syncing Stripe prices..."
    php artisan stripe:sync-prices || true
fi

echo "==> Starting Laravel server..."
exec "$@"
