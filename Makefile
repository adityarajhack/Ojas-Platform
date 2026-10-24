.PHONY: up down build logs test test-unit test-integration seed lint clean demo

up:
	docker compose up -d

down:
	docker compose down -v

build:
	docker compose build

logs:
	docker compose logs -f

test:
	cd backend && npm test

seed:
	cd backend && npm run seed

benchmark:
	cd backend && npm run benchmark

demo:
	cd backend && npm run demo
