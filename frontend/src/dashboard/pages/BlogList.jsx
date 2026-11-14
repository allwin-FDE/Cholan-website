import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Empty, ErrorNote, Icon, Loading, PageHead, Stat, ago, dateOnly, num, useLoad } from '../ui.jsx';

export const POST_STATUS = {
  draft: { label: 'Draft', tone: 'muted' },
  published: { label: 'Published', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'warn' },
  // Left from the old posting login's approval step: not on the website.
  pending: { label: 'Not published', tone: 'warn' },
  changes: { label: 'Not published', tone: 'muted' },
};

// A scheduled post whose time has come is live on the site.
export const liveStatus = (post) =>
  post.status === 'scheduled' && post.publishAt && Date.parse(post.publishAt) <= Date.now() ? 'published' : post.status;

export default function BlogList() {
  const navigate = useNavigate();
  const saved = useLocation().state?.saved;
  const { data, loading, error, reload } = useLoad(() => api.posts(), []);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  // A photo blog opens in the composer; an older text article in its editor.
  const open = (p) => (p.format === 'post' ? `/admin/blog/edit/${p.id}` : `/admin/blog/${p.id}`);

  const posts = useMemo(() => {
    const query = q.toLowerCase();
    return (data?.posts || []).filter(
      (p) =>
        (!status || liveStatus(p) === status) &&
        (!query || [p.title, p.category, p.excerpt, ...(p.tags || [])].join(' ').toLowerCase().includes(query)),
    );
  }, [data, status, q]);
  const countOf = (s) => (data?.posts || []).filter((p) => liveStatus(p) === s).length;

  return (
    <div className="dash-page">
      <PageHead
        title="Blog"
        intro="Write your blogs and publish them on the Blog page of the website. A blog goes live as soon as you press Publish."
        range={false}
        actions={
          <Link to="/admin/blog/new" className="dash-btn">
            <Icon name="plus" /> New blog
          </Link>
        }
      />
      {saved && (
        <div className="dash-flash dash-flash--good" role="status">
          {saved}
        </div>
      )}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="dash-stats">
            <Stat icon="check" label="Published" value={num(countOf('published'))} sub="live on cholanrice.in/blog" />
            <Stat icon="star" label="Scheduled" value={num(countOf('scheduled'))} sub="go live on their date" />
            <Stat icon="pen" label="Drafts" value={num(countOf('draft'))} sub="only visible here" />
          </div>
          {data.posts.length === 0 ? (
            <Empty icon="pen" title="No posts yet">
              Write your first blog: recipes with your rice, how to choose rice for idli, news
              from the shop. Click “New blog” to start.
            </Empty>
          ) : (
            <>
              <div className="dash-filters">
                <label className="dash-search">
                  <Icon name="search" />
                  <input placeholder="Search posts…" value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <div className="dash-seg" role="group" aria-label="Status">
                  {[['', 'All'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['draft', 'Drafts'], ...(countOf('pending') ? [['pending', `Not published (${countOf('pending')})`]] : [])].map(([key, label]) => (
                    <button key={key} type="button" className={status === key ? 'is-on' : ''} onClick={() => setStatus(key)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dash-posts">
                {posts.map((p) => {
                  const s = liveStatus(p);
                  return (
                    <article key={p.id} className="dash-post" onClick={() => navigate(open(p))}>
                      <div className="dash-post__cover">
                        {p.coverUrl ? <img src={p.coverUrl} alt="" loading="lazy" /> : <Icon name="image" />}
                      </div>
                      <div className="dash-post__body">
                        <div className="dash-post__meta">
                          <Badge tone={POST_STATUS[s].tone}>{POST_STATUS[s].label}</Badge>
                          {p.featured && <Badge tone="info">Featured</Badge>}
                          {p.category && <span className="dash-muted">{p.category}</span>}
                        </div>
                        <h3>{p.title || 'Untitled'}</h3>
                        {p.excerpt && <p>{p.excerpt}</p>}
                        <span className="dash-muted dash-small">
                          {s === 'published'
                            ? `Published ${dateOnly(p.publishAt)}`
                            : s === 'scheduled'
                              ? `Goes live ${dateOnly(p.publishAt)}`
                              : `Edited ${ago(p.updatedAt)}`}
                          {' · '}
                          {p.format === 'post' && p.postedBy ? `By ${p.postedBy}` : `${p.readingMinutes} min read`}
                        </span>
                      </div>
                      <div className="dash-post__tools" onClick={(e) => e.stopPropagation()}>
                        {s === 'published' && (
                          <a className="dash-icon-btn" href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" title="View on the website" aria-label="View on the website">
                            <Icon name="external" />
                          </a>
                        )}
                        <Link className="dash-icon-btn" to={open(p)} title="Edit" aria-label="Edit">
                          <Icon name="pen" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
                {!posts.length && <p className="dash-muted">No posts match.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
