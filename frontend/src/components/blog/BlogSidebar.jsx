import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { postDate } from './PostMain.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthKey = (iso) => String(iso || '').slice(0, 7);
export const monthName = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

const tally = (values) => {
  const map = new Map();
  for (const value of values) if (value) map.set(value, (map.get(value) || 0) + 1);
  return [...map];
};

// Beside a post: search, categories with their counts, recent posts, archives
// and tags, all drawn from the live posts.
export default function BlogSidebar({ posts, currentSlug }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const recent = posts.filter((p) => p.slug !== currentSlug).slice(0, 4);
  const categories = tally(posts.map((p) => p.category)).sort((a, b) => b[1] - a[1]);
  const archives = tally(posts.map((p) => monthKey(p.publishAt))).sort((a, b) => b[0].localeCompare(a[0]));
  const tags = tally(posts.flatMap((p) => p.tags || [])).sort((a, b) => b[1] - a[1]).slice(0, 15);

  return (
    <aside className="blog-side" aria-label="More from the blog">
      <form
        className="blog-side__search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/blog?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input type="search" placeholder="Search the blog…" aria-label="Search the blog" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      {categories.length > 0 && (
        <section>
          <h2>Categories</h2>
          <ul className="blog-side__list">
            {categories.map(([name, count]) => (
              <li key={name}>
                <Link to={`/blog?category=${encodeURIComponent(name)}`}>{name}</Link> <span>({count})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2>Recent posts</h2>
          <ul className="blog-side__recent">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to={`/blog/${p.slug}`}>
                  {p.coverUrl ? <img src={p.coverUrl} alt="" loading="lazy" /> : <span className="blog-side__blank" />}
                  <span>
                    <strong>{p.title}</strong>
                    <small>{postDate(p.publishAt)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {archives.length > 0 && (
        <section>
          <h2>Archives</h2>
          <ul className="blog-side__list">
            {archives.map(([key, count]) => (
              <li key={key}>
                <Link to={`/blog?month=${key}`}>{monthName(key)}</Link> <span>({count})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <section>
          <h2>Tags</h2>
          <ul className="blog-side__tags">
            {tags.map(([tag]) => (
              <li key={tag}>
                <Link to={`/blog?tag=${encodeURIComponent(tag)}`}>{tag}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
