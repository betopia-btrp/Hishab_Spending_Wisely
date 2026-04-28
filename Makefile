.PHONY: up down logs fresh seed key shell tinker restart

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

migrate:
	docker compose exec api php artisan migrate

fresh:
	docker compose exec api php artisan migrate:fresh --seed

seed:
	docker compose exec api php artisan db:seed --force

key:
	docker compose exec api php artisan key:generate

shell:
	docker compose exec api bash

tinker:
	docker compose exec api php artisan tinker

restart:
	docker compose restart api
