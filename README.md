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

## Локальный запуск

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
- API / Swagger: `http://localhost:4000/api/v1`, `http://localhost:4000/docs`;
- Mailpit: `http://localhost:8025`;
- MinIO console: `http://localhost:9001`.

## Проверки

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Архитектура, ER-модель, владение данными и контракт 1С находятся в [`docs`](./docs/architecture.md). Фактическая готовность функций отслеживается по этапам 1–8 мастер-плана; наличие файла или экрана само по себе не означает готовность production.
