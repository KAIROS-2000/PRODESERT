import 'server-only';

const API_ORIGIN = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const API_PREFIX = '/api/v1';

export interface PublicPromotion {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  badgeColor: string | null;
  textColor: string | null;
  discountPercent: string | null;
  products: readonly { id: string; name: string; slug: string }[];
  categories: readonly { id: string; name: string; slug: string; path: string }[];
}

export interface PublicBanner {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  linkUrl: string | null;
  priority: number;
}

export interface PublicContentPageSummary {
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export interface PublicContentPage extends PublicContentPageSummary {
  body: string;
  publishedAt: string | null;
}

export class ContentApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function contentFetch<T>(path: string, revalidate = 60): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate },
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    throw new ContentApiError('Информация временно недоступна. Попробуйте ещё раз позже.');
  }

  if (!response.ok) {
    throw new ContentApiError(
      response.status === 404
        ? 'Запрошенная страница не найдена.'
        : 'Не удалось загрузить информацию.',
      response.status,
    );
  }
  return (await response.json()) as T;
}

export async function getPromotions(): Promise<readonly PublicPromotion[]> {
  const payload = await contentFetch<{ items: PublicPromotion[] }>('/content/promotions', 60);
  return payload.items;
}

export async function getBanners(): Promise<readonly PublicBanner[]> {
  const payload = await contentFetch<{ items: PublicBanner[] }>('/content/banners', 60);
  return payload.items;
}

export async function getPublishedContentPages(): Promise<readonly PublicContentPageSummary[]> {
  const payload = await contentFetch<{ items: PublicContentPageSummary[] }>('/content/pages', 300);
  return payload.items;
}

export async function getPublishedContentPage(slug: string): Promise<PublicContentPage> {
  return contentFetch<PublicContentPage>(`/content/pages/${encodeURIComponent(slug)}`, 300);
}
