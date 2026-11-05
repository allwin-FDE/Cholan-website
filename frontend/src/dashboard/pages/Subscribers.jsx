import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useDash } from '../context.js';
import { Card, Empty, ErrorNote, Icon, Loading, PageHead, Stat, ago, downloadCsv, num, pageName, useLoad, when } from '../ui.jsx';

// How a subscriber found the site, in words.
const howFound = (s) => {
  if (s.utmSource) return `${s.utmSource}${s.utmCampaign ? ` · ${s.utmCampaign}` : ''}`;
  if (!s.referrer) return 'Direct';
  try {
    return new URL(s.referrer).hostname.replace(/^www\./, '');
  } catch {
    return s.referrer;
  }
};

// Everyone who signed up with the footer's "Subscribe to Updates" box.
export default function Subscribers() {
  const { days } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.subscribers(), []);
  const [q, setQ] = useState('');

  const all = data?.subscribers || [];
  const since = Date.now() - days * 86_400_000;
  const recent = all.filter((s) => Date.parse(s.createdAt) >= since).length;
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? all.filter((s) => s.email.includes(query)) : all;
  }, [all, q]);

  const remove = async (email) => {
    if (!window.confirm(`Remove ${email} from the subscriber list?`)) return;
    try {
      await api.removeSubscriber(email);
      setData({ ...data, subscribers: data.subscribers.filter((s) => s.email !== email) });
    } catch (err) {
      window.alert(err.message);
    }
  };

  const exportCsv = () =>
    downloadCsv('cholan-subscribers.csv', [
      ['Email', 'Subscribed', 'Signed up on page', 'How they found us'],
      ...list.map((s) => [s.email, s.createdAt, s.page ? pageName(s.page) : '', howFound(s)]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Subscribers"
        intro="Everyone who signed up for updates with the email box at the bottom of every page. Export the list to send offers and news."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export to Excel
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="dash-stats">
            <Stat icon="mail" label="Subscribers" value={num(all.length)} sub="in total" />
            <Stat icon="star" label="New" value={num(recent)} sub="in this period" />
          </div>
          {all.length > 0 && (
            <div className="dash-filters">
              <label className="dash-search">
                <Icon name="search" />
                <input placeholder="Search email…" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
          )}
          {!list.length ? (
            <Empty icon="mail" title={all.length ? 'No subscribers match' : 'No subscribers yet'}>
              {all.length ? 'Clear the search to see them all.' : 'People who enter their email in the website footer appear here straight away.'}
            </Empty>
          ) : (
            <Card>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Subscribed</th>
                      <th>Signed up on</th>
                      <th>How they found us</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.email}>
                        <td>
                          <a className="dash-link" href={`mailto:${s.email}`}>
                            {s.email}
                          </a>
                        </td>
                        <td className="dash-nowrap" title={when(s.createdAt)}>
                          {ago(s.createdAt)}
                        </td>
                        <td>{s.page ? pageName(s.page) : '—'}</td>
                        <td>{howFound(s)}</td>
                        <td>
                          <button type="button" className="dash-link" onClick={() => remove(s.email)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
