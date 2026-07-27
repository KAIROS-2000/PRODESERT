# Staging и production deployment

## Границы ответственности

Этот репозиторий поставляет Docker-образы, миграции, health-check и runbook. Домен, TLS-сертификаты, секреты, S3, SMTP, мониторинг и подключение реальной 1С принадлежат инфраструктурной и бизнес-командам. `ONE_C_ADAPTER=mock` допустим только для development/staging и блокируется production-валидацией.

## Подготовка окружения

1. Создайте отдельные PostgreSQL, Redis, S3 bucket и SMTP credentials для каждого окружения.
2. Поместите секреты в secret manager. Не копируйте `.env` в образ, CI-логи или репозиторий.
3. Укажите реальные `PUBLIC_APP_URL`, `PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_SITE_URL` и строгий `CORS_ORIGINS` с HTTPS-origin витрины и админки.
4. Для production включите `COOKIE_SECURE=true`, `DEMO_BANK_DETAILS_ENABLED=false`, `FILE_SCAN_MODE=clamav`, `ONE_C_ADAPTER=rest` и HTTPS URL 1С. Валидация API остановит запуск при нарушении этих условий.
5. Передайте реальные реквизиты, юридические тексты, режим работы и данные 1С по перечню в [`one-c-integration.md`](./one-c-integration.md). До этого production release не утверждается.

## Staging

1. Разверните новый образ вместе с отдельными параметрами staging.
   `NEXT_PUBLIC_ANALYTICS_ENABLED`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT` и `NEXT_PUBLIC_SITE_URL`
   передаются в storefront как build arguments: изменение этих значений требует пересборки
   образа, а не только перезапуска контейнера.
2. Выполните миграции ровно один раз через задачу `migrate` (Compose: `docker compose --profile full run --rm migrate`) или из корня репозитория командой `npm run db:migrate`.
3. Дождитесь `GET /api/v1/health/live` и `GET /api/v1/health/ready`.
4. Выполните unit, integration smoke и Playwright E2E из [`testing.md`](./testing.md).
5. Прогоните 1С mock и согласованные contract tests; проверьте dashboard, DLQ, аудит и защищённый доступ к документам оплаты.
6. Измерьте Web Vitals и сверьте с performance budget.

## Production rollout

1. Снимите и проверьте PostgreSQL backup до миграции. Скрипт [`backup-postgres.sh`](../infrastructure/scripts/backup-postgres.sh) создаёт проверяемый custom dump; место хранения и retention утверждаются отдельно.
2. Соберите неизменяемый образ из зафиксированного commit SHA и запишите его в release note.
3. Выполните задачу `migrate` с `prisma migrate deploy` (либо `npm run db:migrate` из корня подготовленного release), затем запустите API, worker, storefront и admin. Не используйте `prisma migrate dev` в production.
4. Проверьте readiness, вход сотрудника, каталог, guest checkout и отсутствие запрещённой доставки/карточной оплаты.
5. Наблюдайте минимум один интервал worker: очереди, retry/DLQ, 1С ошибки, SMTP ошибки, 5xx, latency и свободное место backup-хранилища.

## Rollback и восстановление

- Приложение откатывают только на совместимый образ. Prisma-миграции считаются forward-only: если новая схема уже используется, сначала подготовьте совместимый hotfix.
- При потере данных или несовместимой миграции остановите запись, восстановите проверенный dump в отдельную БД, прогоните `pg_restore --list`, затем переключите приложение по утверждённой процедуре.
- Не удаляйте DLQ или audit log ради rollback. Решение о replay принимает ADMIN с причиной; это фиксируется в аудите.

## Мониторинг и инциденты

Минимальные алерты: readiness API, PostgreSQL/Redis, error rate 5xx, latency, oldest outbox age, retry/DLQ size, 1С ошибки/расхождения, ошибки отправки email, неуспешные file scans и возраст последнего backup. Логи содержат correlation ID, но не PII, реквизиты или содержимое документов.

При инциденте сохраните correlation ID, время и безопасный код ошибки; не передавайте клиенту stack trace. Для 1С сначала исправьте первопричину, затем запускайте retry/replay только через ADMIN.
