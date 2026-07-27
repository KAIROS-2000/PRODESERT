import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentApiError, getPublishedContentPage } from '@/lib/content-api';

export const dynamic = 'force-dynamic';

interface ContentPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const page = await getPublishedContentPage(slug);
    return {
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? page.body.slice(0, 155),
      alternates: { canonical: `/content/${page.slug}` },
    };
  } catch {
    return { title: 'Страница не найдена', robots: { index: false, follow: true } };
  }
}

export default async function ContentPage({ params }: ContentPageProps) {
  const { slug } = await params;
  let page;
  try {
    page = await getPublishedContentPage(slug);
  } catch (error) {
    if (error instanceof ContentApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="content-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">Pro Dessert</p>
        <h1 id="content-title">{page.title}</h1>
      </header>
      <div className="information-page__article">
        {page.body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
