import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../dashboard/api.js';
import { Badge, ErrorNote, Icon, Loading, ago, dateOnly, useLoad } from '../dashboard/ui.jsx';
import PostMain from '../components/blog/PostMain.jsx';
import { clearDraft, loadDraft } from './photos.js';

// A post's state, in the words the person posting needs.
function statusOf(post) {
  if (post.status === 'draft') return { label: 'Draft', tone: 'neutral' };
  if (post.status === 'pending') return { label: 'Waiting for approval', tone: 'warn' };
  if (post.status === 'changes') return { label: 'Changes requested', tone: 'bad' };
  if (post.status === 'scheduled' && Date.parse(post.publishAt) > Date.now()) {
    return { label: `Approved · live ${dateOnly(post.publishAt)}`, tone: 'info' };
  }
  return { label: 'Live', tone: 'good' };
}

const canEdit = (post) => ['draft', 'pending', 'changes'].includes(post.status);

export default function Home({ onSignOut }) {
  const navigate = useNavigate();
  const saved = useLocation().state?.saved;
  const { data, loading, error, reload } = useLoad(() => api.myPosts(), []);
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    loadDraft().then(setDraft);
  }, []);

  const withdraw = async (post) => {
    if (!window.confirm(post.status === 'draft' ? 'Delete this draft?' : 'Withdraw this post? It will be deleted.')) return;
    try {
      await api.deleteMyPost(post.id);
      setOpen(null);
      reload();
    } catch (e) {
      window.alert(e.message);
    }
  };

  const discard = async () => {
    if (!window.confirm('Delete this draft?')) return;
    await clearDraft();
    setDraft(null);
  };

  const posts = data?.posts || [];

  return (
    <div className="adm-page">
      <header className="adm-head">
        <img src="/images/cholan-logo.png" alt="Cholan" />
        <button type="button" className="adm-link" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {saved && (
        <p className="adm-saved" role="status">
          {saved}
        </p>
      )}

      <Link to="/admin/new" className="adm-btn adm-btn--wide adm-btn--big">
        <Icon name="plus" /> New post
      </Link>

      {draft?.photos?.length > 0 && (
        <div className="adm-draft">
          <img src={draft.photos[0].src} alt="" />
          <div>
            <strong>Unfinished post</strong>
            <span>
              {draft.photos.length} photo{draft.photos.length > 1 ? 's' : ''} · saved {ago(draft.savedAt)}
            </span>
          </div>
          <button type="button" className="adm-link" onClick={discard}>
            Delete
          </button>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => navigate('/admin/new')}>
            Continue
          </button>
        </div>
      )}

      <h2 className="adm-title">Your posts</h2>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !posts.length && <p className="adm-muted">Nothing here yet. Your posts will appear here after you send them.</p>}
      <div className="adm-grid">
        {posts.map((post) => {
          const status = statusOf(post);
          return (
            <button type="button" key={post.id} className="adm-tile" onClick={() => setOpen(post)}>
              {post.coverUrl ? (
                <img src={post.coverUrl} alt="" loading="lazy" />
              ) : (
                <span className="adm-tile__blank">
                  <Icon name="image" size={30} />
                </span>
              )}
              {post.media?.length > 1 && <span className="adm-tile__count">{post.media.length}</span>}
              <span className="adm-tile__body">
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="adm-tile__title">{post.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="adm-sheet" role="dialog" aria-modal="true" aria-label={open.title}>
          <div className="adm-sheet__head">
            <button type="button" className="adm-link" onClick={() => setOpen(null)}>
              ← Back
            </button>
            <Badge tone={statusOf(open).tone}>{statusOf(open).label}</Badge>
          </div>
          <div className="adm-sheet__body">
            {open.reviewNote && (
              <div className="adm-note">
                <strong>What to change</strong>
                <p>{open.reviewNote}</p>
              </div>
            )}
            <PostMain post={open} preview />
          </div>
          <div className="adm-bar">
            {canEdit(open) ? (
              <>
                <button type="button" className="adm-btn adm-btn--ghost" onClick={() => withdraw(open)}>
                  {open.status === 'draft' ? 'Delete' : 'Withdraw'}
                </button>
                <Link to={`/admin/edit/${open.id}`} className="adm-btn">
                  {open.status === 'draft' ? 'Continue' : 'Edit'}
                </Link>
              </>
            ) : (
              statusOf(open).label === 'Live' && (
                <a href={`/blog/${open.slug}`} target="_blank" rel="noreferrer" className="adm-btn adm-btn--wide">
                  View on the website
                </a>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
