import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { Badge, Card, Empty, ErrorNote, Icon, Loading, PageHead, ago, useLoad, when } from '../ui.jsx';

const STATUS = {
  pending: { label: 'Waiting', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'muted' },
};

// Visitors' comments and star ratings on blog posts. Nothing shows on the
// website until it is approved here.
export default function Comments() {
  const { data, loading, error, reload, setData } = useLoad(() => api.comments(), []);
  const [tab, setTab] = useState('pending');
  const all = useMemo(() => data?.comments || [], [data]);
  const list = all.filter((c) => c.status === tab);
  const countOf = (s) => all.filter((c) => c.status === s).length;

  const refreshMenu = () => window.dispatchEvent(new Event('cholan:review'));
  const setStatus = async (id, status) => {
    try {
      await api.setComment(id, status);
      setData({ comments: all.map((c) => (c.id === id ? { ...c, status } : c)) });
      refreshMenu();
    } catch (e) {
      window.alert(e.message);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this comment for good?')) return;
    try {
      await api.deleteComment(id);
      setData({ comments: all.filter((c) => c.id !== id) });
      refreshMenu();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Comments" intro="What visitors write under your blog posts. Nothing appears on the website until you approve it." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="dash-filters">
            <div className="dash-seg" role="group" aria-label="Status">
              {Object.entries(STATUS).map(([key, s]) => (
                <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                  {s.label} ({countOf(key)})
                </button>
              ))}
            </div>
          </div>
          {!list.length ? (
            <Empty icon="chat" title={tab === 'pending' ? 'No comments waiting' : `No ${STATUS[tab].label.toLowerCase()} comments`}>
              New comments from the blog appear here first.
            </Empty>
          ) : (
            <div className="dash-comments">
              {list.map((c) => (
                <Card key={c.id}>
                  <div className="dash-comment">
                    <div className="dash-comment__top">
                      <strong>{c.name}</strong>
                      <a className="dash-link" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                      {c.rating && <span className="dash-comment__stars" aria-label={`${c.rating} out of 5`}>{'★'.repeat(c.rating)}</span>}
                      <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                      <span className="dash-muted dash-small" title={when(c.createdAt)}>
                        {ago(c.createdAt)}
                      </span>
                    </div>
                    <p className="dash-comment__text">{c.text}</p>
                    <a className="dash-link dash-small" href={`/blog/${c.postSlug}#comments`} target="_blank" rel="noreferrer">
                      On: {c.postTitle} <Icon name="external" size={13} />
                    </a>
                    <div className="dash-review__row">
                      {c.status !== 'approved' && (
                        <button type="button" className="dash-btn dash-btn--sm" onClick={() => setStatus(c.id, 'approved')}>
                          Approve
                        </button>
                      )}
                      {c.status !== 'rejected' && (
                        <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setStatus(c.id, 'rejected')}>
                          {c.status === 'approved' ? 'Take down' : 'Reject'}
                        </button>
                      )}
                      <button type="button" className="dash-btn dash-btn--danger dash-btn--sm" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
