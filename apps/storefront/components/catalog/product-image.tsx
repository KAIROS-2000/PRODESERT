import { ImageIcon } from 'lucide-react';
import Image from 'next/image';

import type { CatalogImage } from '@/lib/catalog-types';

interface ProductImageProps {
  image?: CatalogImage | null | undefined;
  productName: string;
  eager?: boolean;
  className?: string;
}

export function ProductImage({
  image,
  productName,
  eager = false,
  className = '',
}: ProductImageProps) {
  return (
    <span className={`product-image ${className}`.trim()}>
      {image?.url ? (
        <Image
          alt={image.alt || productName}
          fill
          priority={eager}
          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
          src={image.url}
          unoptimized
        />
      ) : (
        <span className="product-image__placeholder" role="img" aria-label={productName}>
          <ImageIcon aria-hidden="true" size={34} strokeWidth={1.5} />
          <span>{productName}</span>
        </span>
      )}
    </span>
  );
}
