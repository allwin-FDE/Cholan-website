import { useMemo, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, ago, downloadCsv, useLoad } from '../../shared/ui.jsx';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { showNumber, wa } from '../api.js';

// The people WhatsApp messages go to. Consent: WhatsApp's rules (and good
// sense) say offers only go to people who agreed to them; order updates and
// replies don't need it. Anyone who sends STOP is opted out automatically.
const SHOW = { '': 'Everyone', consent: 'Can get offers', none: 'No consent yet', out: 'Opted out' };
const SOURCE = { added: 'Added', import: 'Imported', enquiry: 'Enquiry', customer: 'Customer', whatsapp: 'Wrote to us', website_order: 'Website order', order_confirmed: 'Order', order_dispatched: 'Order', order_delivered: 'Order' };

export const ConsentBadge = ({ c }) => (c.optedOut ? <Badge tone="bad">Opted out</Badge> : c.consent ? <Badge tone="good">Offers OK</Badge> : <Badge tone="muted">No consent</Badge>);

export default function Contacts() {
  const { allowed } = useDash();
  const { get, patch } = useUrl();
  const list = useLoad(() => wa.contacts(), []);
  const [q, setQ, search] = useUrlSearch();
  const [picked, setPicked] = useState(() => new Set());
  const all = list.data?.contacts || [];
  const tag = get('tag');
  const show = get('show');
  const tags = useMemo(() => {
    const m = new Map();
    for (const c of all) for (const t of c.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return all.filter(
      (c) =>
        (!tag || (c.tags || []).includes(tag)) &&
        (!show || (show === 'consent' ? c.consent && !c.optedOut : show === 'none' ? !c.consent && !c.optedOut : c.optedOut)) &&
        (!s || `${c.name} ${c.wa} ${(c.tags || []).join(' ')}`.toLowerCase().includes(s)),
    );
  }, [all, tag, show, search]);
  const editing = get('new') ? {} : all.find((c) => c.id === get('contact'));
  const toggle = (id) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const bulk = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await wa.bulk({ was: [...picked], ...body });
      setPicked(new Set());
      list.reload();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="dash-page">
      <PageHead
        title="Contacts"
        intro="The people you message. Offers only go to people who agreed to get them; anyone who replies STOP is taken off automatically."
        range={false}
        actions={
          allowed('editor') && (
            <div className="dash-row biz-actions">
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => patch({ import: 1 })}>
                <Icon name="download" /> Import
              </button>
              <button type="button" className="dash-btn" onClick={() => patch({ new: 1, contact: '' })}>
                <Icon name="plus" /> Add contact
              </button>
            </div>
          )
        }
      />
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.data && (
        <div className="dash-stats">
          <Stat label="Contacts" value={String(all.length)} />
          <Stat label="Can get offers" value={String(all.filter((c) => c.consent && !c.optedOut).length)} />
          <Stat label="No consent yet" value={String(all.filter((c) => !c.consent && !c.optedOut).length)} sub="Order updates and replies only" />
          <Stat label="Opted out" value={String(all.filter((c) => c.optedOut).length)} />
        </div>
      )}
      <Card>
        <div className="dash-filters">
          <div className="dash-seg" role="group" aria-label="Show">
            {Object.entries(SHOW).map(([k, label]) => (
              <button key={k || 'all'} type="button" className={show === k ? 'is-on' : ''} onClick={() => patch({ show: k }, { replace: true })}>
                {label}
              </button>
            ))}
          </div>
          <select value={tag} onChange={(e) => patch({ tag: e.target.value }, { replace: true })} aria-label="Tag">
            <option value="">All tags</option>
            {tags.map(([t, n]) => (
              <option key={t} value={t}>
                {t} ({n})
              </option>
            ))}
          </select>
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Name, number, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {picked.size > 0 && allowed('editor') && (
          <div className="wa-bulk">
            <strong>{picked.size} selected</strong>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              onClick={() => {
                const t = window.prompt('Tag to add (e.g. vip, hotel, diwali-2026):');
                if (t) bulk({ addTags: [t] });
              }}
            >
              Add tag
            </button>
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              onClick={() => {
                const t = window.prompt('Tag to remove:');
                if (t) bulk({ removeTags: [t] });
              }}
            >
              Remove tag
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => bulk({ consent: true }, `Mark ${picked.size} as having agreed to get offers on WhatsApp? Only do this if they really did.`)}>
              Agreed to offers
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => bulk({ optedOut: true })}>
              Opt out
            </button>
            {allowed('admin') && (
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => bulk({ delete: true }, `Delete ${picked.size} contacts? Their message history stays.`)}>
                <Icon name="trash" /> Delete
              </button>
            )}
            <button type="button" className="dash-link" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>
        )}
        {list.loading && !list.data && <Loading />}
        {list.data &&
          (rows.length ? (
            <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                      </th>
                      <th>Contact</th>
                      <th>Tags</th>
                      <th>Offers</th>
                      <th>From</th>
                      <th>Last message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 500).map((c) => (
                      <tr key={c.id} className="dash-row-link" onClick={() => patch({ contact: c.id, new: '' })}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name || c.id}`} />
                        </td>
                        <td>
                          <strong>{c.name || 'No name'}</strong>
                          <span className="dash-muted dash-block dash-small">{showNumber(c.wa || c.id)}</span>
                        </td>
                        <td>
                          {(c.tags || []).slice(0, 4).map((t) => (
                            <span key={t} className="wa-tag">
                              {t}
                            </span>
                          ))}
                        </td>
                        <td>
                          <ConsentBadge c={c} />
                        </td>
                        <td className="dash-small dash-muted">{SOURCE[c.source] || c.source || ''}</td>
                        <td className="dash-small">
                          {c.lastMessageAt ? (
                            <>
                              {ago(c.lastMessageAt)}
                              <span className="dash-muted dash-block wa-clip">
                                {c.lastDirection === 'in' ? '← ' : '→ '}
                                {c.lastMessageText}
                              </span>
                            </>
                          ) : (
                            <span className="dash-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dash-row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <span className="dash-muted dash-small">
                  {rows.length > 500 ? `Showing 500 of ${rows.length}; search or filter to narrow.` : `${rows.length} shown`}
                </span>
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost dash-btn--sm"
                  onClick={() => downloadCsv('whatsapp-contacts.csv', [['Name', 'Phone', 'Tags', 'Offers', 'Opted out', 'From'], ...rows.map((c) => [c.name, `+${c.wa || c.id}`, (c.tags || []).join('|'), c.consent ? 'yes' : 'no', c.optedOut ? 'yes' : 'no', c.source || ''])])}
                >
                  <Icon name="download" /> Download
                </button>
              </div>
            </>
          ) : (
            <Empty icon="users" title={all.length ? 'No contact matches' : 'No contacts yet'}>
              {all.length ? 'Change the filters.' : 'Import a CSV, bring in website enquiries or customers, or add someone. People who write to your WhatsApp number are added by themselves.'}
            </Empty>
          ))}
      </Card>
      {editing && (
        <ContactDrawer
          c={editing}
          onClose={() => patch({ new: '', contact: '' })}
          onSaved={(saved) => {
            list.reload();
            patch({ new: '', contact: saved.id }, { replace: true });
          }}
          onDeleted={() => {
            list.reload();
            patch({ contact: '' });
          }}
        />
      )}
      {get('import') && (
        <ImportDrawer
          onClose={() => patch({ import: '' })}
          onDone={() => {
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function ContactDrawer({ c, onClose, onSaved, onDeleted }) {
  const { allowed } = useDash();
  const isNew = !c.id;
  const [f, setF] = useState({
    name: c.name || '',
    phone: c.wa ? `+${c.wa}` : '',
    tags: (c.tags || []).join(', '),
    details: Object.entries(c.attributes || {}).map(([k, v]) => `${k}=${v}`).join('\n'),
    consent: Boolean(c.consent),
    optedOut: Boolean(c.optedOut),
  });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const attributes = Object.fromEntries(
        f.details
          .split('\n')
          .map((l) => l.split('='))
          .filter(([k, v]) => k && v !== undefined)
          .map(([k, ...v]) => [k.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'), v.join('=').trim()]),
      );
      onSaved(await wa.saveContact({ id: c.id, phone: f.phone, name: f.name, tags: f.tags, attributes, consent: f.consent, optedOut: f.optedOut }));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={isNew ? 'Add a contact' : c.name || showNumber(c.wa)}>
      <form onSubmit={save}>
        <div className="biz-form">
          <label className="dash-field">
            <span className="dash-field__label">Name</span>
            <input value={f.name} onChange={set('name')} />
          </label>
          <label className="dash-field">
            <span className="dash-field__label">WhatsApp number</span>
            <input value={f.phone} onChange={set('phone')} placeholder="98765 43210" disabled={!isNew} required />
            {problem?.fields?.phone && <span className="dash-field-error">{problem.fields.phone}</span>}
          </label>
          <label className="dash-field biz-wide">
            <span className="dash-field__label">Tags (comma separated)</span>
            <input value={f.tags} onChange={set('tags')} placeholder="vip, hotel, coimbatore" />
          </label>
          <label className="dash-field biz-wide">
            <span className="dash-field__label">Details to use in messages (one per line: city=Coimbatore)</span>
            <textarea className="dash-textarea" rows={3} value={f.details} onChange={set('details')} placeholder={'city=Coimbatore\nfavourite=Ponni 26 kg'} />
          </label>
          <label className="dash-check biz-wide">
            <input type="checkbox" checked={f.consent} onChange={set('consent')} disabled={f.optedOut} /> They agreed to get offers on WhatsApp
          </label>
          <label className="dash-check biz-wide">
            <input type="checkbox" checked={f.optedOut} onChange={set('optedOut')} /> Opted out (send nothing but replies to their messages)
          </label>
        </div>
        {!isNew && (
          <dl className="dash-facts">
            <div>
              <dt>Added</dt>
              <dd>
                {ago(c.createdAt)} · {SOURCE[c.source] || c.source}
              </dd>
            </div>
            {c.optedOutAt && (
              <div>
                <dt>Opted out</dt>
                <dd>{ago(c.optedOutAt)}</dd>
              </div>
            )}
          </dl>
        )}
        {problem && <div className="dash-error">{problem.message}</div>}
        <div className="dash-row biz-actions">
          {allowed('editor') && (
            <button type="submit" className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
          {!isNew && (
            <a className="dash-btn dash-btn--ghost" href={`/whatsapp/inbox?chat=${c.id}`}>
              <Icon name="chat" /> Open chat
            </a>
          )}
          {!isNew && allowed('admin') && (
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              onClick={async () => {
                if (!window.confirm(`Delete ${c.name || c.wa}? Their message history stays.`)) return;
                await wa.deleteContact(c.id).catch((e) => window.alert(e.message));
                onDeleted();
              }}
            >
              <Icon name="trash" /> Delete
            </button>
          )}
        </div>
      </form>
    </Drawer>
  );
}

function ImportDrawer({ onClose, onDone }) {
  const [from, setFrom] = useState('csv');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [tags, setTags] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState(null);
  const run = async () => {
    setBusy(true);
    setProblem(null);
    setResult(null);
    try {
      const body = { tags, consent };
      const r = from === 'csv' ? await wa.importCsv({ ...body, csv }) : from === 'enquiries' ? await wa.importEnquiries(body) : await wa.importCustomers(body);
      setResult(r);
      onDone();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Import contacts" wide>
      <div className="dash-seg" role="group" aria-label="From">
        {[['csv', 'CSV file'], ['enquiries', 'Website enquiries'], ['customers', 'Business customers']].map(([k, l]) => (
          <button key={k} type="button" className={from === k ? 'is-on' : ''} onClick={() => setFrom(k)}>
            {l}
          </button>
        ))}
      </div>
      {from === 'csv' && (
        <section className="biz-section">
          <p className="dash-muted dash-small">
            A spreadsheet saved as CSV, with a header row. A column called <strong>phone</strong> (or mobile, number, whatsapp) is needed; <strong>name</strong> and <strong>tags</strong> (separated by |) are used if there; any other column (city, product…) is kept to use in messages.
          </p>
          <label className="dash-btn dash-btn--ghost" style={{ cursor: 'pointer' }}>
            <Icon name="file" /> {fileName || 'Choose a CSV file'}
            <input
              type="file"
              hidden
              accept=".csv,text/csv,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setCsv(await file.text());
              }}
            />
          </label>
          <p className="dash-muted dash-small">or paste it:</p>
          <textarea className="dash-textarea" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,phone,tags,city\nLakshmi,9876543210,vip|hotel,Coimbatore'} />
          {csv && <p className="dash-small">{Math.max(csv.trim().split(/\r?\n/).length - 1, 0)} rows</p>}
        </section>
      )}
      {from === 'enquiries' && <p className="dash-small biz-section">Everyone who sent the website’s enquiry form with a phone number, tagged <strong>enquiry</strong>. Their product goes in as a detail.</p>}
      {from === 'customers' && <p className="dash-small biz-section">Customers from the plant dashboard (orders and invoices) with a phone number, tagged <strong>customer</strong> and their type (retailer, hotel…), with their city.</p>}
      <div className="biz-form">
        <label className="dash-field biz-wide">
          <span className="dash-field__label">Also tag them (optional)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="diwali-2026, coimbatore" />
        </label>
        <label className="dash-check biz-wide">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> These people agreed to get offers from us on WhatsApp
        </label>
      </div>
      <p className="dash-muted dash-small">Without consent they can still get order updates and replies, but not offers. Anyone already opted out stays opted out.</p>
      {problem && <div className="dash-error">{problem.message}</div>}
      {result && (
        <div className="dash-flash dash-flash--good">
          {result.added} added, {result.updated} updated{result.badCount ? `, ${result.badCount} rows skipped (number not valid${result.bad?.length ? `: row ${result.bad.slice(0, 5).map((b) => b.row).join(', ')}` : ''})` : ''}.
        </div>
      )}
      <button type="button" className="dash-btn" disabled={busy || (from === 'csv' && !csv.trim())} onClick={run} style={{ marginTop: 12 }}>
        {busy ? 'Importing…' : 'Import'}
      </button>
    </Drawer>
  );
}
