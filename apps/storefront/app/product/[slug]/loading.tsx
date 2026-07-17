export default function ProductLoading() {
  return (
    <div className="product-page" aria-label="Загружаем товар" aria-busy="true">
      <div className="shell">
        <div className="skeleton skeleton--breadcrumb" />
        <div className="product-main">
          <div className="skeleton skeleton--gallery" />
          <div>
            <div className="skeleton skeleton--heading" />
            <div className="skeleton skeleton--copy" />
            <div className="skeleton skeleton--purchase" />
          </div>
        </div>
      </div>
    </div>
  );
}
