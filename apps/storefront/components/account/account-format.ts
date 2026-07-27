import { OrderStatus, type AccountOrderSummary } from '@pro-dessert/contracts';

const statusLabels: Record<OrderStatus, string> = {
  [OrderStatus.DRAFT]: 'Черновик',
  [OrderStatus.CREATED]: 'Создан',
  [OrderStatus.AWAITING_STOCK_CONFIRMATION]: 'Проверяем наличие',
  [OrderStatus.AWAITING_PAYMENT]: 'Ожидает оплаты',
  [OrderStatus.PAYMENT_VERIFICATION]: 'Проверяем оплату',
  [OrderStatus.PAID]: 'Оплачен',
  [OrderStatus.ASSEMBLING]: 'Собираем заказ',
  [OrderStatus.READY_FOR_PICKUP]: 'Готов к самовывозу',
  [OrderStatus.COMPLETED]: 'Получен',
  [OrderStatus.CANCELLED_BY_CUSTOMER]: 'Отменён покупателем',
  [OrderStatus.CANCELLED_BY_STORE]: 'Отменён магазином',
  [OrderStatus.RESERVATION_EXPIRED]: 'Резерв истёк',
  [OrderStatus.RETURN_REQUESTED]: 'Запрошен возврат',
  [OrderStatus.RETURNED]: 'Возвращён',
};

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
});

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const accountStatusLabel = (status: OrderStatus) => statusLabels[status] ?? status;
export const accountMoney = (amount: string) => moneyFormatter.format(Number(amount));
export const accountDate = (value: string) => dateFormatter.format(new Date(value));

export function orderSummaryText(order: AccountOrderSummary): string {
  return `${order.itemCount} поз. · ${accountMoney(order.grandTotal)} · самовывоз`;
}
