import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHero from '../../components/common/PageHero.jsx';
import Seo from '../../components/common/Seo.jsx';
import { pages } from '../../config/seo.js';
import { fetchPosts, hasBackend } from '../../lib/api.js';
import BlogSidebar, { monthKey, monthName } from '../../components/blog/BlogSidebar.jsx';
import { postDate } from '../../components/blog/PostMain.jsx';

// /blog: the journal. Posts are written in the admin (/admin/blog)
// and load from the backend; with none published yet, an empty state.
export default function Blog() {
  const [posts, setPosts] = useState(null); // null while loading
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const tag = params.get('tag') || '';
  const month = params.get('month') || '';
  const q = (params.get('q') || '').toLowerCase();
  const filtered = Boolean(tag || month || q);
  const setCategory = (name) => setParams(name ? { category: name } : {});

  useEffect(() => {
    if (!hasBackend) return setPosts([]);
    fetchPosts()
      .then(setPosts)
      .catch(() => setPosts([]));
    return undefined;
  }, []);

  const categories = [...new Set((posts || []).map((p) => p.category).filter(Boolean))];
  const shown = (posts || []).filter(
    (p) =>
      (!category || p.category === category) &&
      (!tag || (p.tags || []).includes(tag)) &&
      (!month || monthKey(p.publishAt) === month) &&
      (!q || [p.title, p.excerpt, p.category, ...(p.tags || [])].join(' ').toLowerCase().includes(q)),
  );
  // Every post is the same small card; a featured one just comes first.
  const featured = !category && !filtered ? shown.find((p) => p.featured) : null;
  const ordered = featured ? [featured, ...shown.filter((p) => p !== featured)] : shown;

  return (
    <>
      <Seo {...pages.blog} />
      <PageHero
        title="The Cholan journal"
        lede="Recipes, farming notes and nutrition, from the mill and the fields we buy from."
      />
      {posts === null && (
        <section className="section section--alt blog">
          <div className="container">
            <div className="blog-grid" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="blog-card blog-card--ghost" />
              ))}
            </div>
          </div>
        </section>
      )}
      {posts && posts.length === 0 && <EmptyBlog />}
      {posts && posts.length > 0 && (
        <section className="section section--alt blog">
          <div className="container">
            {categories.length > 1 && (
              <div className="blog-cats" role="group" aria-label="Categories">
                <button type="button" className={!category ? 'is-on' : ''} onClick={() => setCategory('')}>
                  All posts
                </button>
                {categories.map((c) => (
                  <button key={c} type="button" className={category === c ? 'is-on' : ''} onClick={() => setCategory(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            {filtered && (
              <p className="blog-filter" role="status">
                {shown.length} {shown.length === 1 ? 'post' : 'posts'} {q ? `matching “${params.get('q')}”` : tag ? `tagged “${tag}”` : `from ${monthName(month)}`}.{' '}
                <button type="button" onClick={() => setParams({})}>
                  Show all posts
                </button>
              </p>
            )}
            {ordered.length > 0 && (
              <div className="blog-grid">
                {ordered.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            )}
            <BlogSidebar posts={posts} />
          </div>
        </section>
      )}
    </>
  );
}

export function PostCard({ post }) {
  const short = post.format === 'post';
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card__media">
        {post.coverUrl ? (
          <img src={post.coverUrl} alt={post.coverAlt || ''} loading="lazy" />
        ) : (
          <span className="blog-card__placeholder" aria-hidden="true">
            <img src="/images/cholan-logo.png" alt="" />
          </span>
        )}
      </div>
      <div className="blog-card__body">
        <span className="blog-card__meta">
          {post.category && <span className="blog-card__cat">{post.category}</span>}
          <span>{postDate(post.publishAt)}</span>
          {!short && <span>{post.readingMinutes} min read</span>}
        </span>
        <h2 lang={post.language === 'ta' ? 'ta' : undefined}>{post.title}</h2>
        {post.excerpt && <p>{post.excerpt}</p>}
        <span className="blog-card__more">Read more →</span>
      </div>
    </Link>
  );
}

function EmptyBlog() {
  return (
    <section className="section section--alt blog-empty">
      <div className="container">
        <div className="blog-empty__card">
          <span className="blog-empty__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
              <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
            </svg>
          </span>
          <h2>Our blogs are yet to be posted.</h2>
          <p>Recipes, farming notes and stories from the mill are on their way. Please check back soon.</p>
          <Link to="/products" className="btn btn--primary">
            Explore our products
          </Link>
        </div>
      </div>
    </section>
  );
}
