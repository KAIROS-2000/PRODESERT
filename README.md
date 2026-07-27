# Pro Dessert

Production-oriented monorepo интернет-магазина товаров для кондитеров в Оренбурге. MVP принимает гостевые и пользовательские заказы только с самовывозом из магазина на Липовой улице, 20. Оплата — формализованный банковский перевод после подтверждения наличия.

## Неподвижные ограничения MVP

- `fulfillmentMethod` — только `PICKUP`;
- `paymentMethod` — только `BANK_TRANSFER`;
- адрес и стоимость доставки отсутствуют в UI, API и модели данных;
- номенклатура, цены, остатки, резерв и факты исполнения принадлежат 1С;
- локальная разработка использует отдельный mock-адаптер 1С;
- реквизиты из `.env.example` демонстрационные и не подходят для реальной оплаты;
- юридические материалы нельзя публиковать без профессиональной проверки.

## Структура

```text
apps/
  storefront/  Next.js 16 публичный магазин
  admin/       Next.js 16 панель сотрудников
  api/         NestJS REST API, worker и Prisma
packages/
  contracts/   единые TypeScript-контракты
  validation/  общие Zod-схемы
  ui/          доступные UI-примитивы
  config/      типизированная конфигурация
infrastructure/
  docker/      production Dockerfiles
  nginx/       reverse proxy
  scripts/     эксплуатационные скрипты
docs/          архитектура и эксплуатационная документация
```

## Быстрый запуск для ручного тестирования

Полный локальный стенд запускается в Docker и доступен через единый адрес Nginx. Команды выполняются в корне репозитория, в PowerShell:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm ci
$env:SEED_STAFF_PASSWORD = '<придумайте-локальный-пароль>'
docker compose --profile full up -d --build
npm run db:seed
```

После завершения команд откройте:

- магазин: `http://localhost:8080`;
- панель сотрудников: `http://localhost:8080/admin`;
- API readiness: `http://localhost:8080/api/v1/health/ready`;
- тестовая почта Mailpit: `http://localhost:8025`;
- MinIO Console: `http://localhost:9001`.

Для входа в панель используйте `admin.local@pro-dessert.test` и значение `SEED_STAFF_PASSWORD`, заданное выше. Другие демонстрационные роли: `manager.local@pro-dessert.test` и `content.local@pro-dessert.test`. Реквизиты оплаты в demo-режиме не предназначены для реальных переводов.

Проверить состояние сервисов можно командой `docker compose --profile full ps`, остановить стенд — `docker compose --profile full down`. Данные PostgreSQL, Redis и MinIO сохраняются в Docker volumes; команда `down` их не удаляет.

## Локальный запуск в режиме разработки

Требуются Node.js 20.9+, npm, Docker и Docker Compose.

1. Скопируйте `.env.example` в `.env` и замените локальные секреты.
2. Выполните `npm install`.
3. Запустите PostgreSQL, Redis, MinIO и Mailpit: `docker compose up -d postgres redis minio mailpit`.
4. Сгенерируйте Prisma Client: `npm run db:generate`.
5. Примените миграции: `npm run db:migrate`.
6. Запустите приложения: `npm run dev`.

Адреса по умолчанию:

- storefront: `http://localhost:3000`;
- admin: `http://localhost:3001`;
- API readiness: `http://localhost:4000/api/v1/health/ready`;
- Mailpit: `http://localhost:8025`;
- MinIO console: `http://localhost:9001`.

## Проверки

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Для полного локального качества используйте также `npm run test:integration` (после запуска API с seed-данными) и `npm run test:e2e` (после `npx playwright install chromium`). Подробные сценарии находятся в [`docs/testing.md`](./docs/testing.md), а staging/production runbook — в [`docs/deployment.md`](./docs/deployment.md).

Архитектура, ER-модель, владение данными и контракт 1С находятся в [`docs`](./docs/architecture.md). Фактическая готовность функций отслеживается по этапам 1–8 мастер-плана; наличие файла или экрана само по себе не означает готовность production.
