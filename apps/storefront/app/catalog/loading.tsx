export default function CatalogLoading() {
  return (
    <div className="catalog-page" aria-label="Загружаем каталог" aria-busy="true">
      <div className="shell">
        <div className="skeleton skeleton--breadcrumb" />
        <div className="skeleton skeleton--heading" />
        <div className="catalog-layout">
          <div className="skeleton skeleton--sidebar" />
          <div className="product-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton skeleton--product" key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
