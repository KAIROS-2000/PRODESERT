'use client';

import type { CartView } from '@pro-dessert/contracts';
import { ShoppingBasket, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  addCartItem,
  deleteCart,
  deleteCartItem,
  getCart,
  mergeGuestCart,
  updateCartItem,
  validateCart,
} from '@/lib/cart-api';
import { trackAnalyticsEvent } from '@/lib/analytics';

interface ToastState {
  id: number;
  message: string;
  tone: 'success' | 'warning';
  showCartLink?: boolean;
}

interface CartContextValue {
  cart: CartView | null;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  refresh: () => Promise<CartView | null>;
  validate: () => Promise<CartView>;
  addItem: (variantId: string, quantity: string) => Promise<CartView>;
  updateItem: (itemId: string, quantity: string) => Promise<CartView>;
  removeItem: (itemId: string) => Promise<CartView | null>;
  clearCart: () => Promise<CartView | null>;
  mergeCartAfterLogin: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [cart, setCart] = useState<CartView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const mutationLock = useRef(false);
  const requestVersion = useRef(0);
  const previousPathname = useRef(pathname);
  const toastCounter = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastState['tone'], showCartLink = false) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastCounter.current += 1;
      setToast({ id: toastCounter.current, message, tone, showCartLink });
      toastTimer.current = setTimeout(() => setToast(null), 5_000);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const refresh = useCallback(async (): Promise<CartView | null> => {
    const version = ++requestVersion.current;
    setError(null);
    setIsLoading(true);
    try {
      const view = await getCart();
      if (version === requestVersion.current) {
        setCart(view);
        const importantNotice = view.notices[0];
        if (importantNotice) showToast(importantNotice.message, 'warning', true);
      }
      return view;
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Не удалось загрузить корзину.';
      if (version === requestVersion.current) setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void refresh().finally(() => {
        if (!cancelled) setInitialLoadComplete(true);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh]);

  const runMutation = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (mutationLock.current) throw new Error('Подождите завершения предыдущего действия.');
    mutationLock.current = true;
    requestVersion.current += 1;
    setIsMutating(true);
    setError(null);
    try {
      return await operation();
    } finally {
      mutationLock.current = false;
      setIsMutating(false);
    }
  }, []);

  const addItem = useCallback(
    (variantId: string, quantity: string) =>
      runMutation(async () => {
        const view = await addCartItem({ variantId, quantity });
        setCart(view);
        const item = view.items.find((candidate) => candidate.variantId === variantId);
        trackAnalyticsEvent('add_to_cart', { itemCount: view.itemCount, surface: 'catalog' });
        const importantNotice = view.notices[0];
        if (importantNotice) {
          showToast(importantNotice.message, 'warning', true);
        } else {
          showToast(
            item ? `«${item.productName}» добавлен в корзину.` : 'Товар добавлен в корзину.',
            'success',
            true,
          );
        }
        return view;
      }),
    [runMutation, showToast],
  );

  const updateItem = useCallback(
    (itemId: string, quantity: string) =>
      runMutation(async () => {
        const view = await updateCartItem(itemId, { quantity });
        setCart(view);
        const importantNotice = view.notices[0];
        if (importantNotice) showToast(importantNotice.message, 'warning', true);
        return view;
      }),
    [runMutation, showToast],
  );

  const removeItem = useCallback(
    (itemId: string) =>
      runMutation(async () => {
        await deleteCartItem(itemId);
        const view = await getCart();
        setCart(view);
        trackAnalyticsEvent('remove_from_cart', { itemCount: view.itemCount, surface: 'cart' });
        showToast('Товар удалён из корзины.', 'success');
        return view;
      }),
    [runMutation, showToast],
  );

  const clearCart = useCallback(
    () =>
      runMutation(async () => {
        await deleteCart();
        const view = await getCart();
        setCart(view);
        showToast('Корзина очищена.', 'success');
        return view;
      }),
    [runMutation, showToast],
  );

  const validate = useCallback(
    () =>
      runMutation(async () => {
        const view = await validateCart();
        setCart(view);
        return view;
      }),
    [runMutation],
  );

  useEffect(() => {
    const previous = previousPathname.current;
    if (!initialLoadComplete) {
      previousPathname.current = pathname;
      return;
    }
    if (pathname !== '/cart' || previous === '/cart') {
      previousPathname.current = pathname;
      return;
    }
    if (mutationLock.current || isMutating) {
      // Every mutation response already contains a freshly validated cart.
      previousPathname.current = pathname;
      return;
    }

    previousPathname.current = pathname;

    void validate().catch((requestError: unknown) => {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось проверить корзину. Повторите попытку.',
      );
    });
  }, [initialLoadComplete, isMutating, pathname, validate]);

  const mergeCartAfterLogin = useCallback(async () => {
    try {
      const view = await runMutation(mergeGuestCart);
      setCart(view);
      if (view.itemCount > 0) showToast('Корзина сохранена после входа.', 'success', true);
    } catch {
      showToast('Вход выполнен, но корзину не удалось объединить. Обновите её позже.', 'warning');
      await refresh();
    }
  }, [refresh, runMutation, showToast]);

  const contextValue = useMemo<CartContextValue>(
    () => ({
      cart,
      isLoading,
      isMutating,
      error,
      refresh,
      validate,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      mergeCartAfterLogin,
    }),
    [
      addItem,
      cart,
      clearCart,
      error,
      isLoading,
      isMutating,
      mergeCartAfterLogin,
      refresh,
      removeItem,
      updateItem,
      validate,
    ],
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
      <div className="cart-toast-region" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className={`cart-toast cart-toast--${toast.tone}`} key={toast.id} role="status">
            <ShoppingBasket aria-hidden="true" size={20} />
            <span>{toast.message}</span>
            {toast.showCartLink ? <Link href="/cart">Открыть</Link> : null}
            <button type="button" aria-label="Закрыть уведомление" onClick={() => setToast(null)}>
              <X aria-hidden="true" size={17} />
            </button>
          </div>
        ) : null}
      </div>
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
