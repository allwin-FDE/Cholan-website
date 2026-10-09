import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/product/ProductCard';
import { pinnedRank } from '../../components/product/productOrder';
import { products } from '../../data/products';
import { gsap, ScrollTrigger, Flip } from '../../lib/gsap';
import { prefersReducedMotion } from '../../lib/motion';
import { hasProductImage } from '../../lib/products';
import ProductFilters from './ProductFilters';

export default function Products() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || 'all';
  const [query, setQuery] = useState('');
  const gridRef = useRef(null);
  const flipState = useRef(null);

  // Capture card positions before a filter change so Flip can animate to the new layout.
  const captureState = () => {
    const grid = gridRef.current;
    if (grid && !prefersReducedMotion()) {
      flipState.current = Flip.getState(grid.children, { props: 'opacity' });
    }
  };

  const selectCategory = (slug) => {
    captureState();
    setParams(slug === 'all' ? {} : { category: slug });
  };

  const visible = useMemo(() => {
    let list = category === 'all' ? [...products] : products.filter((p) => p.category === category);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.tagline.toLowerCase().includes(needle) ||
          p.description.toLowerCase().includes(needle),
      );
    }
    list.sort(
      (a, b) =>
        pinnedRank(a) - pinnedRank(b) ||
        Number(hasProductImage(b)) - Number(hasProductImage(a)) ||
        Number(!!b.featured) - Number(!!a.featured),
    );
    return list;
  }, [category, query]);

  useLayoutEffect(() => {
    const state = flipState.current;
    const grid = gridRef.current;
    flipState.current = null;
    if (!state || !grid) return;
    gsap.set(grid.children, { autoAlpha: 1, clearProps: 'transform' });
    const flip = Flip.from(state, {
      targets: grid.children,
      duration: 0.6,
      ease: 'power3.inOut',
      stagger: 0.02,
      clearProps: 'transform',
      onEnter: (entering) =>
        gsap.fromTo(
          entering,
          { autoAlpha: 0, scale: 0.85, y: 30 },
          {
            autoAlpha: 1,
            scale: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.04,
            ease: 'back.out(1.6)',
            clearProps: 'transform',
          },
        ),
      onComplete: () => ScrollTrigger.refresh(),
    });
    return () => flip.progress(1);
  }, [visible]);

  return (
    <section className="section products-page">
      <div className="container">
        <h1 className="visually-hidden">Our products: rice, millets, oils and more</h1>
        <ProductFilters
          category={category}
          onCategory={selectCategory}
          query={query}
          onQuery={(value) => {
            captureState();
            setQuery(value);
          }}
        />
        <p className="muted results-count">
          Showing {visible.length} of {products.length} products
        </p>
        {visible.length > 0 ? (
          <div className="products-grid" ref={gridRef}>
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>No products match that search</h3>
            <p className="muted">Try a different word, or clear the filters to see everything.</p>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                captureState();
                setQuery('');
                selectCategory('all');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
