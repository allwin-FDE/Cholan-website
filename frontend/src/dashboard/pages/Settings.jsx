import { useState } from 'react';
import { api } from '../api.js';
import { useDash } from '../context.js';
import { Badge, Card, ErrorNote, Icon, Loading, PageHead, ago, useLoad } from '../ui.jsx';
import { GA_ID } from '../../config/analytics.js';

const ROLES = {
  viewer: { label: 'Viewer', can: 'Sees the reports: overview, visitors, pages and heatmaps.' },
  editor: { label: 'Editor', can: 'Everything a viewer sees, plus enquiries (with phone numbers) and writing blog posts.' },
  admin: { label: 'Admin', can: 'Everything, including this Settings page: adding and removing people.' },
};

export default function Settings() {
  const { user } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.access(), []);
  const [form, setForm] = useState({ email: '', role: 'viewer', note: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const add = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const entry = await api.setAccess(form.email.trim().toLowerCase(), form.role, form.note);
      setData({ ...data, people: [...data.people.filter((p) => p.email !== entry.email), entry].sort((a, b) => a.email.localeCompare(b.email)) });
      setMessage({
        tone: 'good',
        text: `${entry.email} can now sign in at cholanrice.in/admin with Google. Let them know.`,
      });
      setForm({ email: '', role: 'viewer', note: '' });
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (person, role) => {
    try {
      const entry = await api.setAccess(person.email, role);
      setData({ ...data, people: data.people.map((p) => (p.email === person.email ? { ...p, ...entry } : p)) });
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    }
  };

  const remove = async (person) => {
    if (!window.confirm(`Remove ${person.email}? They will lose access straight away.`)) return;
    try {
      await api.removeAccess(person.email);
      setData({ ...data, people: data.people.filter((p) => p.email !== person.email) });
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Settings" intro="Who can open the admin, and what each person can do." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <Card title="Give someone access" hint="They sign in at cholanrice.in/admin with “Continue with Google”, so this must be a Google account (Gmail or Google Workspace). No password to share.">
            <form className="dash-access-form" onSubmit={add}>
              <label className="dash-field">
                <span className="dash-field__label">Email address</span>
                <input type="email" required placeholder="name@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="dash-field">
                <span className="dash-field__label">Access</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {Object.entries(ROLES).map(([key, r]) => (
                    <option key={key} value={key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dash-field">
                <span className="dash-field__label">Note (optional)</span>
                <input placeholder="e.g. Sales team, marketing agency" value={form.note} maxLength={120} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </label>
              <button type="submit" className="dash-btn" disabled={busy}>
                <Icon name="plus" /> {busy ? 'Adding…' : 'Give access'}
              </button>
            </form>
            <p className="dash-muted dash-small">{ROLES[form.role].can}</p>
            {message && <div className={`dash-flash dash-flash--${message.tone}`}>{message.text}</div>}
          </Card>

          <Card title="People with access">
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Access</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.owners.map((email) => (
                    <tr key={email}>
                      <td>
                        <strong>{email}</strong>
                        {email === user.email && <span className="dash-muted"> (you)</span>}
                      </td>
                      <td>
                        <Badge tone="good">Owner</Badge>
                      </td>
                      <td className="dash-muted">Built in</td>
                      <td className="dash-muted dash-small">Always has full access</td>
                    </tr>
                  ))}
                  {data.people.map((p) => (
                    <tr key={p.email}>
                      <td>
                        <strong>{p.email}</strong>
                        {p.email === user.email && <span className="dash-muted"> (you)</span>}
                        {p.note && <span className="dash-muted dash-block">{p.note}</span>}
                      </td>
                      <td>
                        {ROLES[p.role] ? (
                          <select value={p.role} onChange={(e) => changeRole(p, e.target.value)} aria-label={`Access for ${p.email}`} disabled={p.email === user.email}>
                            {Object.entries(ROLES).map(([key, r]) => (
                              <option key={key} value={key}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          // Left from the old shared posting login, which no longer opens anything.
                          <Badge tone="muted">No access</Badge>
                        )}
                      </td>
                      <td className="dash-muted dash-small">
                        {ago(p.addedAt)}
                        {p.addedBy && <span className="dash-block">by {p.addedBy}</span>}
                      </td>
                      <td>
                        {p.email !== user.email && (
                          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => remove(p)}>
                            <Icon name="trash" /> Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.people.length && <p className="dash-muted">Nobody else has access yet. Add people above.</p>}
          </Card>

          <Card title="What each access level can do">
            <div className="dash-roles">
              {Object.entries(ROLES).map(([key, r]) => (
                <div key={key}>
                  <strong>{r.label}</strong>
                  <p>{r.can}</p>
                </div>
              ))}
              <div>
                <strong>Owner</strong>
                <p>Like Admin, and can never be removed: {data.owners.join(', ')}. To change owners, ask your developer.</p>
              </div>
            </div>
          </Card>

          <Card title="Tracking">
            <dl className="dash-facts">
              <div>
                <dt>Website visitor tracking</dt>
                <dd>On — only for visitors who click “Accept” on the cookie banner.</dd>
              </div>
              <div>
                <dt>Google Analytics</dt>
                <dd>{GA_ID ? `Connected (${GA_ID}) — open analytics.google.com for city-level location and more.` : 'Not connected'}</dd>
              </div>
              <div>
                <dt>How long visit data is kept</dt>
                <dd>About 13 months, then deleted automatically.</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
