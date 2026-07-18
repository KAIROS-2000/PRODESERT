'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CheckoutField, CheckoutInput } from '@pro-dessert/contracts';
import {
  Info,
  Landmark,
  LoaderCircle,
  MapPin,
  PackageSearch,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCart } from '@/components/cart/cart-provider';
import {
  CheckoutApiError,
  createOrder,
  getCheckoutErrorMessage,
  validateCheckout,
} from '@/lib/checkout-api';
import { rememberCreatedOrder } from '@/lib/order-session';

import styles from './order-flow.module.css';

const optionalText = (max: number, message: string) =>
  z.string().trim().max(max, message).or(z.literal(''));

function localCalendarDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yekaterinburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const checkoutSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Укажите имя полностью.').max(100, 'Имя слишком длинное.'),
    lastName: optionalText(100, 'Фамилия слишком длинная.'),
    phone: z
      .string()
      .trim()
      .min(10, 'Укажите номер телефона.')
      .max(24, 'Номер телефона слишком длинный.')
      .refine(
        (value) =>
          /^\+?[0-9()\-\s]{10,24}$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, '')),
        'Используйте цифры и, при необходимости, +, пробелы, скобки или дефисы.',
      ),
    email: z.string().trim().email('Введите корректный email.').max(254, 'Email слишком длинный.'),
    comment: optionalText(1000, 'Комментарий не должен превышать 1000 символов.'),
    desiredPickupAt: z
      .string()
      .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Выберите дату.')
      .refine(
        (value) => value === '' || value >= localCalendarDate(),
        'Желаемая дата не может быть в прошлом.',
      ),
    organizationName: optionalText(200, 'Название организации слишком длинное.'),
    organizationInn: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || /^(\d{10}|\d{12})$/.test(value),
        'ИНН содержит 10 или 12 цифр.',
      ),
    organizationKpp: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d{9}$/.test(value), 'КПП содержит 9 цифр.'),
    privacyConsent: z.boolean().refine(Boolean, 'Подтвердите согласие на обработку данных.'),
    orderTermsConsent: z.boolean().refine(Boolean, 'Подтвердите согласие с условиями заказа.'),
  })
  .superRefine((values, context) => {
    const hasOrganization = Boolean(
      values.organizationName || values.organizationInn || values.organizationKpp,
    );
    if (!hasOrganization) return;
    if (!values.organizationName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationName'],
        message: 'Укажите название организации.',
      });
    }
    if (!values.organizationInn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationInn'],
        message: 'Укажите ИНН организации.',
      });
    }
  });

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

function formatMoney(value: string): string {
  return money.format(Number(value));
}

function formatQuantity(value: string): string {
  const quantity = Number(value);
  return Number.isFinite(quantity)
    ? quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
    : value;
}

function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function toCheckoutInput(values: CheckoutFormValues, cartUpdatedAt: string): CheckoutInput {
  const lastName = values.lastName.trim();
  const comment = values.comment.trim();
  const organizationName = values.organizationName.trim();
  const organizationInn = values.organizationInn.trim();
  const organizationKpp = values.organizationKpp.trim();

  return {
    cartUpdatedAt,
    firstName: values.firstName.trim(),
    phone: values.phone.trim(),
    email: values.email.trim(),
    privacyConsent: values.privacyConsent,
    orderTermsConsent: values.orderTermsConsent,
    ...(lastName ? { lastName } : {}),
    ...(comment ? { comment } : {}),
    ...(values.desiredPickupAt ? { desiredPickupAt: values.desiredPickupAt } : {}),
    ...(organizationName && organizationInn
      ? {
          organization: {
            name: organizationName,
            inn: organizationInn,
            ...(organizationKpp ? { kpp: organizationKpp } : {}),
          },
        }
      : {}),
  };
}

const formFieldByServerField: Partial<Record<CheckoutField, keyof CheckoutFormValues>> = {
  firstName: 'firstName',
  phone: 'phone',
  email: 'email',
  privacyConsent: 'privacyConsent',
  orderTermsConsent: 'orderTermsConsent',
  desiredPickupAt: 'desiredPickupAt',
  organization: 'organizationName',
};

export function CheckoutForm() {
  const router = useRouter();
  const { cart, isLoading, isMutating, error: cartError, refresh } = useCart();
  const [requestError, setRequestError] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  const orderCreated = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const idempotencyPayload = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      comment: '',
      desiredPickupAt: '',
      organizationName: '',
      organizationInn: '',
      organizationKpp: '',
      privacyConsent: false,
      orderTermsConsent: false,
    },
  });

  const cartNeedsReview = !cart || cart.items.length === 0 || !cart.canCheckout;

  useEffect(() => {
    if (!isLoading && cartNeedsReview && !orderCreated.current) router.replace('/cart');
  }, [cartNeedsReview, isLoading, router]);

  const submitValidOrder = async (values: CheckoutFormValues) => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setRequestError(null);

    if (!cart) return;
    const input = toCheckoutInput(values, cart.updatedAt);
    const serializedPayload = JSON.stringify(input);
    let currentIdempotencyKey =
      idempotencyPayload.current === serializedPayload ? idempotencyKey.current : null;

    try {
      if (!currentIdempotencyKey) {
        const validation = await validateCheckout(input);
        if (!validation.valid) {
          for (const fieldError of validation.fieldErrors) {
            const formField = formFieldByServerField[fieldError.field];
            if (formField) setError(formField, { type: 'server', message: fieldError.message });
          }
          const messages = [
            ...validation.notices.map((notice) => notice.message),
            ...validation.fieldErrors
              .filter((fieldError) => fieldError.field === 'cart')
              .map((fieldError) => fieldError.message),
          ];
          setRequestError(
            messages[0] ?? 'Не удалось подтвердить заказ. Проверьте корзину и заполнение формы.',
          );
          await refresh();
          return;
        }

        currentIdempotencyKey = createIdempotencyKey();
        idempotencyKey.current = currentIdempotencyKey;
        idempotencyPayload.current = serializedPayload;
      }

      const order = await createOrder(input, currentIdempotencyKey);
      orderCreated.current = true;
      rememberCreatedOrder(order);
      try {
        await refresh();
      } catch {
        // The order already exists; a stale cart badge must not lead to a duplicate submission.
      }
      router.replace('/order/success');
    } catch (error) {
      if (error instanceof CheckoutApiError && error.status === 409) {
        await refresh();
      }
      if (
        error instanceof CheckoutApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        idempotencyKey.current = null;
        idempotencyPayload.current = null;
      }
      setRequestError(getCheckoutErrorMessage(error));
    } finally {
      submitInFlight.current = false;
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitInFlight.current) return;
    void handleSubmit(submitValidOrder)(event);
  };

  if (isLoading) {
    return (
      <div className={`${styles.page} shell`}>
        <div className={styles.loadingCard} role="status">
          <LoaderCircle className={styles.spin} aria-hidden="true" size={28} />
          <span>Проверяем корзину…</span>
        </div>
      </div>
    );
  }

  if (cartNeedsReview || !cart) {
    return (
      <div className={`${styles.narrowPage} shell`}>
        <section className={styles.emptyCard}>
          <PackageSearch aria-hidden="true" size={42} />
          <h1>{cart?.items.length ? 'Сначала проверьте корзину' : 'Корзина пока пуста'}</h1>
          <p>
            {cart?.items.length
              ? 'В корзине есть позиции, которые нужно проверить перед оформлением. Возвращаем вас к ним.'
              : 'Добавьте товары, чтобы оформить заказ с самовывозом из магазина Pro Dessert.'}
          </p>
          {cartError ? <div className={styles.formStatus}>{cartError}</div> : null}
          <div className={styles.actions}>
            <Link className="button button--primary" href="/cart">
              Открыть корзину
            </Link>
            {!cart?.items.length ? (
              <Link className="button button--secondary" href="/catalog">
                Перейти в каталог
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${styles.page} shell`}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>
          <ShieldCheck aria-hidden="true" size={16} /> Защищённое оформление
        </p>
        <h1>Оформление заказа</h1>
        <p>Проверьте состав и оставьте контакты. Регистрация для заказа не требуется.</p>
      </header>

      <form className={styles.checkoutGrid} onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
        <div className={styles.formColumn}>
          <section className={styles.sectionCard} aria-labelledby="checkout-contact-title">
            <div className={styles.sectionHeading}>
              <UserRound aria-hidden="true" size={22} />
              <div>
                <h2 id="checkout-contact-title">Контактные данные</h2>
                <p>По ним магазин сообщит о проверке наличия и готовности заказа.</p>
              </div>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label htmlFor="checkout-first-name">Имя *</label>
                <input
                  id="checkout-first-name"
                  autoComplete="given-name"
                  aria-invalid={errors.firstName ? 'true' : undefined}
                  aria-describedby={errors.firstName ? 'checkout-first-name-error' : undefined}
                  {...register('firstName')}
                />
                {errors.firstName ? (
                  <span className={styles.fieldError} id="checkout-first-name-error" role="alert">
                    {errors.firstName.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="checkout-last-name">
                  Фамилия <span className={styles.optional}>необязательно</span>
                </label>
                <input
                  id="checkout-last-name"
                  autoComplete="family-name"
                  {...register('lastName')}
                />
                {errors.lastName ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.lastName.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="checkout-phone">Телефон *</label>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+7 900 000-00-00"
                  aria-invalid={errors.phone ? 'true' : undefined}
                  aria-describedby={errors.phone ? 'checkout-phone-error' : undefined}
                  {...register('phone')}
                />
                {errors.phone ? (
                  <span className={styles.fieldError} id="checkout-phone-error" role="alert">
                    {errors.phone.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="checkout-email">Email *</label>
                <input
                  id="checkout-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.ru"
                  aria-invalid={errors.email ? 'true' : undefined}
                  aria-describedby={errors.email ? 'checkout-email-error' : undefined}
                  {...register('email')}
                />
                {errors.email ? (
                  <span className={styles.fieldError} id="checkout-email-error" role="alert">
                    {errors.email.message}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.sectionCard} aria-labelledby="checkout-pickup-title">
            <div className={styles.sectionHeading}>
              <MapPin aria-hidden="true" size={22} />
              <div>
                <h2 id="checkout-pickup-title">Получение</h2>
                <p>Для заказов доступен один способ получения.</p>
              </div>
            </div>
            <div className={styles.fixedChoice}>
              <span className={styles.choiceDot} aria-hidden="true" />
              <span className={styles.choiceContent}>
                <strong>Самовывоз</strong>
                <span>Магазин Pro Dessert · Оренбург, Липовая улица, 20</span>
              </span>
            </div>
            <div className={styles.notice}>
              <Info aria-hidden="true" size={18} />
              <span>
                Забрать заказ можно только после уведомления «Заказ готов к самовывозу». Оформление
                и оплата сами по себе не означают готовность.
              </span>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fullField}>
                <label htmlFor="checkout-pickup-date">
                  Желаемая дата самовывоза <span className={styles.optional}>необязательно</span>
                </label>
                <input
                  id="checkout-pickup-date"
                  type="date"
                  min={localCalendarDate()}
                  aria-invalid={errors.desiredPickupAt ? 'true' : undefined}
                  aria-describedby="checkout-pickup-date-hint"
                  {...register('desiredPickupAt')}
                />
                <span className={styles.fieldHint} id="checkout-pickup-date-hint">
                  Это пожелание, а не подтверждение готовности заказа.
                </span>
                {errors.desiredPickupAt ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.desiredPickupAt.message}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.sectionCard} aria-labelledby="checkout-payment-title">
            <div className={styles.sectionHeading}>
              <Landmark aria-hidden="true" size={22} />
              <div>
                <h2 id="checkout-payment-title">Оплата</h2>
                <p>Для заказа доступен один способ оплаты.</p>
              </div>
            </div>
            <div className={styles.fixedChoice}>
              <span className={styles.choiceDot} aria-hidden="true" />
              <span className={styles.choiceContent}>
                <strong>Банковский перевод на расчётный счёт</strong>
                <span>Без платёжного шлюза на сайте</span>
              </span>
            </div>
            <div className={styles.notice}>
              <Info aria-hidden="true" size={18} />
              <span>
                Реквизиты отправим только после подтверждения фактического наличия и резерва
                товаров.
              </span>
            </div>
          </section>

          <section className={styles.sectionCard} aria-labelledby="checkout-extra-title">
            <div className={styles.sectionHeading}>
              <Info aria-hidden="true" size={22} />
              <div>
                <h2 id="checkout-extra-title">Дополнительная информация</h2>
                <p>Все поля в этом блоке необязательные.</p>
              </div>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fullField}>
                <label htmlFor="checkout-comment">Комментарий к заказу</label>
                <textarea
                  id="checkout-comment"
                  placeholder="Например, уточнение по фасовке"
                  aria-invalid={errors.comment ? 'true' : undefined}
                  {...register('comment')}
                />
                {errors.comment ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.comment.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.fullField}>
                <label htmlFor="checkout-organization-name">Название организации</label>
                <input
                  id="checkout-organization-name"
                  autoComplete="organization"
                  aria-invalid={errors.organizationName ? 'true' : undefined}
                  {...register('organizationName')}
                />
                {errors.organizationName ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.organizationName.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="checkout-organization-inn">ИНН</label>
                <input
                  id="checkout-organization-inn"
                  inputMode="numeric"
                  aria-invalid={errors.organizationInn ? 'true' : undefined}
                  {...register('organizationInn')}
                />
                {errors.organizationInn ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.organizationInn.message}
                  </span>
                ) : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="checkout-organization-kpp">КПП</label>
                <input
                  id="checkout-organization-kpp"
                  inputMode="numeric"
                  aria-invalid={errors.organizationKpp ? 'true' : undefined}
                  {...register('organizationKpp')}
                />
                {errors.organizationKpp ? (
                  <span className={styles.fieldError} role="alert">
                    {errors.organizationKpp.message}
                  </span>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.summaryCard} aria-labelledby="checkout-summary-title">
          <div className={styles.summaryHeader}>
            <h2 id="checkout-summary-title">Ваш заказ</h2>
            <p>{cart.itemCount} товарных позиций</p>
          </div>
          <div className={styles.summaryItems}>
            {cart.items.map((item) => (
              <div className={styles.summaryItem} key={item.id}>
                <strong>{item.productName}</strong>
                <span>
                  {item.offerName} · {formatQuantity(item.quantity)} {item.unit}
                </span>
                <span className={styles.summaryItemPrice}>{formatMoney(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className={styles.totals}>
            <div className={styles.totalRow}>
              <span>Товары</span>
              <span>{formatMoney(cart.totals.products)}</span>
            </div>
            <div className={styles.totalRow}>
              <span>Скидка</span>
              <span>−{formatMoney(cart.totals.discount)}</span>
            </div>
            <div className={styles.totalRow}>
              <strong>Итого к оплате</strong>
              <strong>{formatMoney(cart.totals.grandTotal)}</strong>
            </div>
          </div>

          <div className={styles.consents}>
            <label className={styles.checkbox}>
              <input type="checkbox" {...register('privacyConsent')} />
              <span>Я согласен на обработку персональных данных для оформления заказа. *</span>
              {errors.privacyConsent ? (
                <span className={styles.consentError} role="alert">
                  {errors.privacyConsent.message}
                </span>
              ) : null}
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" {...register('orderTermsConsent')} />
              <span>
                Я согласен с условиями заказа, проверкой наличия до оплаты и понимаю, что
                самостоятельно заберу заказ из магазина только после уведомления о готовности. *
              </span>
              {errors.orderTermsConsent ? (
                <span className={styles.consentError} role="alert">
                  {errors.orderTermsConsent.message}
                </span>
              ) : null}
            </label>
          </div>

          <div className={styles.submitArea}>
            {requestError ? (
              <div className={styles.formStatus} role="alert">
                {requestError}
              </div>
            ) : null}
            {cartError ? (
              <div className={styles.formStatus} role="alert">
                {cartError}
              </div>
            ) : null}
            {!cart.canCheckout ? (
              <div className={styles.formStatus} role="alert">
                Проверьте замечания к товарам в корзине перед оформлением.
              </div>
            ) : null}
            <button
              className="button button--primary"
              type="submit"
              disabled={isSubmitting || isMutating || !cart.canCheckout}
            >
              {isSubmitting ? (
                <LoaderCircle className={styles.spin} aria-hidden="true" size={19} />
              ) : null}
              {isSubmitting ? 'Создаём заказ…' : 'Оформить заказ'}
            </button>
            <p className={styles.submitNote}>
              Нажатие создаёт заказ со статусом проверки наличия, но не означает его готовность.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
