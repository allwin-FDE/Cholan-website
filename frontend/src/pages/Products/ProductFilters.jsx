import { categories } from '../../data/categories';
import { products } from '../../data/products';

// Category chips + search box.
export default function ProductFilters({ category, onCategory, query, onQuery }) {
  return (
    <div className="filters">
      <div className="filters__chips">
        <button
          className={`chip${category === 'all' ? ' chip--on' : ''}`}
          onClick={() => onCategory('all')}
        >
          All ({products.length})
        </button>
        {categories.map((cat) => {
          const count = products.filter((p) => p.category === cat.slug).length;
          return (
            <button
              key={cat.slug}
              className={`chip${category === cat.slug ? ' chip--on' : ''}`}
              onClick={() => onCategory(cat.slug)}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>
      <div className="filters__tools">
        <svg
          className="filters__search-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="input filters__search"
          placeholder="Search products…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          aria-label="Search products"
        />
      </div>
    </div>
  );
}
