# Тестирование и quality gates

## Набор проверок

| Уровень              | Команда                             | Что подтверждает                                                                                    |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Форматирование       | `npm run format:check`              | единый формат исходников и документации                                                             |
| Статический анализ   | `npm run lint && npm run typecheck` | типы, правила React/Nest и доступность JSX                                                          |
| Unit                 | `npm run test:ci`                   | расчёты корзины, checkout, статусы, резерв, права, 1С и валидация                                   |
| Интеграционный smoke | `npm run test:integration`          | авторизация сотрудников, RBAC и публичный/административный API на поднятом API + PostgreSQL + Redis |
| E2E                  | `npm run test:e2e`                  | поиск, корзина, гостевой checkout с самовывозом, статус ожидания, keyboard skip-link                |

## Интеграционный smoke

Перед запуском поднимите полный локальный профиль, примените миграции и загрузите демонстрационные данные. Пароль тестовых сотрудников передаётся только через окружение:

```powershell
$env:POSTGRES_PORT = '55432'
$env:CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001,http://localhost:8080,http://127.0.0.1:8080'
$env:DATABASE_URL = 'postgresql://pro_dessert:local-development-only@localhost:55432/pro_dessert?schema=public'
$env:SEED_STAFF_PASSWORD = '<local-only-test-password>'
docker compose --profile full up -d --build
npm run db:seed
$env:INTEGRATION_STAFF_PASSWORD = $env:SEED_STAFF_PASSWORD
npm run test:integration
```

Замените `<local-only-test-password>` перед выполнением. Скрипт выполняет только чтение и вход с тестовыми staff-аккаунтами. Он не подтверждает оплаты, не меняет статус заказов и не выгружает данные наружу.

## Playwright E2E

Первый запуск на рабочей машине требует браузер Chromium:

```powershell
npx playwright install chromium
$env:E2E_BASE_URL = 'http://localhost:8080'
npm run test:e2e
```

E2E не должен запускаться против production. Тест использует явный демонстрационный email и создаёт тестовый заказ, поэтому для staging нужен отдельный каталог/контур, который можно очищать по утверждённому регламенту.

## Ручная приёмка release candidate

Перед production-публикацией владелец сервиса подтверждает:

1. 100 последовательных тестовых заказов на изолированном staging-контуре без потери, дубля или расхождения суммы.
2. Полный путь: наличие → резерв → банковские реквизиты → документ → подтверждение оплаты → сборка → самовывоз → завершение.
3. Отрицательные сценарии: изменение цены, недостаточный остаток, повторный idempotency key, временная недоступность 1С, истечение резерва и недопустимый переход статуса.
4. Проверку keyboard navigation, видимого focus, мобильного checkout и экранов без сети/с временной ошибкой.
5. Отсутствие PII и реквизитов в аналитике, browser console и структурированных логах.

## Performance budget

Пороговые значения находятся в [`infrastructure/performance-budget.json`](../infrastructure/performance-budget.json). Их измеряют Lighthouse/Web Vitals на staging с production-сборкой, без расширений браузера и с согласованным профилем сети. Превышение требует решения владельца и фиксируется в release notes.
