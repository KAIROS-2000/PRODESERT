'use client';

import { useEffect } from 'react';

import { trackAnalyticsEvent, type AnalyticsContext, type AnalyticsEvent } from '@/lib/analytics';

export function AnalyticsEvent({
  event,
  context,
}: Readonly<{ event: AnalyticsEvent; context?: AnalyticsContext }>) {
  useEffect(() => {
    trackAnalyticsEvent(event, context);
  }, [context, event]);
  return null;
}
