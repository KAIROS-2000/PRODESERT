'use client';

export const ANALYTICS_EVENTS = [
  'view_home',
  'view_category',
  'view_product',
  'search',
  'search_no_results',
  'apply_filter',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'checkout_validation_error',
  'order_created',
  'stock_confirmed',
  'payment_details_sent',
  'payment_proof_uploaded',
  'payment_confirmed',
  'order_ready_for_pickup',
  'order_completed',
  'repeat_order',
  'registration_completed',
  'email_verified',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsContext {
  source?: string;
  surface?: string;
  itemCount?: number;
  resultCount?: number;
  status?: number;
  errorCode?: string;
  category?: string;
}

export type AnalyticsConsent = 'granted' | 'denied' | 'undecided';

const CONSENT_KEY = 'pro-dessert-analytics-consent';
const CONSENT_CHANGE_EVENT = 'pro-dessert:analytics-consent-change';

export function analyticsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';
}

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined' || !analyticsEnabled()) return 'denied';
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : 'undecided';
}

export function saveAnalyticsConsent(consent: Exclude<AnalyticsConsent, 'undecided'>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, consent);
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

export function subscribeToAnalyticsConsent(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY) listener();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(CONSENT_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener);
  };
}

export function trackAnalyticsEvent(event: AnalyticsEvent, context: AnalyticsContext = {}): void {
  if (
    typeof window === 'undefined' ||
    !analyticsEnabled() ||
    readAnalyticsConsent() !== 'granted'
  ) {
    return;
  }

  const payload = {
    event,
    occurredAt: new Date().toISOString(),
    path: window.location.pathname,
    context,
  };
  window.dispatchEvent(new CustomEvent('pro-dessert:analytics', { detail: payload }));

  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT?.trim();
  if (!endpoint) return;

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    return;
  }
  void fetch(endpoint, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => undefined);
}
