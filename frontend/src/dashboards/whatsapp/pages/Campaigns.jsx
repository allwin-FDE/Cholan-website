import { useEffect, useMemo, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, ago, downloadCsv, useLoad, when } from '../../shared/ui.jsx';
import { useUrl } from '../../shared/urlState.js';
import { showNumber, wa } from '../api.js';
import { CATEGORY, PhonePreview, ValueMapper, pct, previewValues, useWa } from '../shared.jsx';

// Campaigns: one approved template to an audience (by tags), with each
// person's details filled in, sent now or at a set time. Messages go out
// through the queue at a steady pace; delivery, reads, replies and failures
// come back from Meta.
const STATE = {
  draft: ['Draft', 'muted'],
  scheduled: ['Scheduled', 'info'],
  sending: ['Sending', 'warn'],
  paused: ['Paused', 'warn'],
  done: ['Sent', 'good'],
  cancelled: ['Cancelled', 'muted'],
};
const RECIPIENT = { queued: ['Waiting', 'muted'], sending: ['Sending', 'warn'], sent: ['Sent', 'info'], failed: ['Failed', 'bad'], skipped: ['Skipped', 'muted'], cancelled: ['Cancelled', 'muted'] };
const DELIVERY = { delivered: ['Delivered', 'good'], read: ['Read', 'good'], failed: ['Failed', 'bad'] };

export default function Campaigns() {
  const { allowed } = useDash();
  const { get, patch } = useUrl();
  const list = useLoad(() => wa.campaigns(), []);
  const rows = list.data?.campaigns || [];
  const live = rows.some((c) => c.status === 'sending');
  // While a campaign is sending, the numbers refresh every 10 seconds.
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(list.reload, 10_000);
    return () => clearInterval(t);
  }, [live, list.reload]);
  const total = (k) => rows.reduce((s, c) => s + (c.counts?.[k] || 0), 0);

  return (
    <div className="dash-page">
      <PageHead
        title="Campaigns"
        intro="Send an approved template to a group of contacts, now or at a set time. Each person’s name and details are filled in."
        range={false}
        actions={
          allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => patch({ new: 1, campaign: '' })}>
              <Icon name="plus" /> New campaign
            </button>
          )
        }
      />
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.data && rows.length > 0 && (
        <div className="dash-stats">
          <Stat label="Messages sent" value={String(total('sent') + total('failed'))} />
          <Stat label="Delivered" value={pct(total('delivered'), total('sent'))} sub={`${total('delivered')} messages`} />
          <Stat label="Read" value={pct(total('read'), total('delivered'))} sub="of those delivered" />
          <Stat label="Replied" value={String(total('replied'))} />
        </div>
      )}
      <Card>
        {list.loading && !list.data && <Loading />}
        {list.data &&
          (rows.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th className="dash-num">People</th>
                    <th>Progress</th>
                    <th className="dash-num">Read</th>
                    <th className="dash-num">Replied</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const n = c.counts || {};
                    const done = (n.sent || 0) + (n.failed || 0) + (n.skipped || 0);
                    return (
                      <tr key={c.id} className="dash-row-link" onClick={() => patch({ campaign: c.id })}>
                        <td>
                          <strong>{c.name}</strong>
                          <span className="dash-muted dash-block dash-small">
                            {c.template?.name} · {c.status === 'scheduled' ? `goes ${when(c.scheduleAt)}` : ago(c.startedAt || c.createdAt)}
                          </span>
                        </td>
                        <td>
                          <Badge tone={STATE[c.status]?.[1]}>{STATE[c.status]?.[0] || c.status}</Badge>
                        </td>
                        <td className="dash-num">{n.total || '—'}</td>
                        <td style={{ minWidth: 140 }}>
                          {n.total ? (
                            <>
                              <div className="wa-progress" title={`${done} of ${n.total} done`}>
                                <span style={{ width: `${(done / n.total) * 100}%` }} />
                              </div>
                              <span className="dash-small dash-muted">
                                {n.delivered || 0} delivered{n.failed ? ` · ${n.failed} failed` : ''}
                              </span>
                            </>
                          ) : (
                            <span className="dash-muted dash-small">—</span>
                          )}
                        </td>
                        <td className="dash-num">{n.delivered ? pct(n.read, n.delivered) : '—'}</td>
                        <td className="dash-num">{n.replied || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="bolt" title="No campaigns yet">
              Make a template first (Templates), add contacts, then start a campaign.
            </Empty>
          ))}
      </Card>
      {get('new') && (
        <NewCampaign
          copyOf={rows.find((c) => c.id === get('copy'))}
          onClose={() => patch({ new: '', copy: '' })}
          onSaved={(c) => {
            list.reload();
            patch({ new: '', copy: '', campaign: c.id }, { replace: true });
          }}
        />
      )}
      {get('campaign') && !get('new') && <CampaignDrawer id={get('campaign')} onClose={() => patch({ campaign: '' })} onChanged={list.reload} onCopy={() => patch({ new: 1, copy: get('campaign'), campaign: '' })} />}
    </div>
  );
}

function CampaignDrawer({ id, onClose, onChanged, onCopy }) {
  const { allowed } = useDash();
  const c = useLoad(() => wa.campaign(id), [id]);
  const [filter, setFilter] = useState('');
  const d = c.data;
  useEffect(() => {
    if (d?.status !== 'sending') return undefined;
    const t = setInterval(c.reload, 8000);
    return () => clearInterval(t);
  }, [d?.status, c.reload]);
  const act = async (action, body) => {
    try {
      c.setData(await wa.campaignAction(id, action, body));
      onChanged();
    } catch (e) {
      window.alert(e.message);
    }
  };
  const n = d?.counts || {};
  const recipients = (d?.recipients || []).filter((r) => !filter || (filter === 'failed' ? r.status === 'failed' || r.delivery === 'failed' : filter === 'read' ? r.delivery === 'read' : r.status === filter));
  return (
    <Drawer open onClose={onClose} title={d ? d.name : 'Campaign'} wide>
      {c.loading && !d && <Loading />}
      {c.error && <ErrorNote error={c.error} />}
      {d && (
        <>
          <div className="biz-order-head">
            <Badge tone={STATE[d.status]?.[1]}>{STATE[d.status]?.[0]}</Badge>
            <span className="dash-muted dash-small">
              {d.template?.name} ({CATEGORY[d.template?.category] || ''}) · to {d.audience?.tags?.length ? `${d.audience.match === 'all' ? 'all of' : 'any of'} ${d.audience.tags.join(', ')}` : 'everyone'}
              {d.audience?.excludeTags?.length ? `, not ${d.audience.excludeTags.join(', ')}` : ''} · by {d.createdBy}
            </span>
          </div>
          {d.error && <div className="dash-error">{d.error}</div>}
          <div className="wa-funnel">
            {[
              ['People', n.total],
              ['Sent', n.sent],
              ['Delivered', n.delivered],
              ['Read', n.read],
              ['Replied', n.replied],
              ['Failed', n.failed],
              ['Skipped', n.skipped],
            ].map(([label, v]) => (
              <div key={label} className={label === 'Failed' && v ? 'is-bad' : ''}>
                <strong>{v || 0}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="dash-row biz-actions">
            {allowed('editor') && ['draft', 'scheduled'].includes(d.status) && (
              <button type="button" className="dash-btn" onClick={() => window.confirm(`Send “${d.name}” now?`) && act('launch')}>
                <Icon name="bolt" /> Send now
              </button>
            )}
            {allowed('editor') && d.status === 'draft' && (
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={() => {
                  const v = window.prompt('Send at (YYYY-MM-DD HH:MM, India time):', new Date(Date.now() + 3600e3 + 5.5 * 3600e3).toISOString().slice(0, 16).replace('T', ' '));
                  if (v) act('schedule', { scheduleAt: `${v.replace(' ', 'T')}:00+05:30` });
                }}
              >
                <Icon name="clock" /> Schedule
              </button>
            )}
            {allowed('editor') && d.status === 'scheduled' && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => act('unschedule')}>
                Unschedule
              </button>
            )}
            {allowed('editor') && d.status === 'sending' && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => act('pause')}>
                Pause
              </button>
            )}
            {allowed('editor') && d.status === 'paused' && (
              <button type="button" className="dash-btn" onClick={() => act('resume')}>
                Resume
              </button>
            )}
            {allowed('editor') && ['draft', 'scheduled', 'sending', 'paused'].includes(d.status) && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => window.confirm('Cancel this campaign? Messages not sent yet won’t go.') && act('cancel')}>
                Cancel
              </button>
            )}
            {allowed('editor') && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={onCopy}>
                <Icon name="copy" /> Send again / copy
              </button>
            )}
          </div>
          {d.scheduleAt && d.status === 'scheduled' && <p className="dash-small">Goes out {when(d.scheduleAt)}.</p>}
          <section className="biz-section">
            <div className="biz-section__head">
              <h3>People ({d.recipients.length})</h3>
              <div className="dash-row">
                <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
                  <option value="">Everyone</option>
                  <option value="queued">Waiting</option>
                  <option value="sent">Sent</option>
                  <option value="read">Read</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                </select>
                {d.recipients.length > 0 && (
                  <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => downloadCsv(`campaign-${d.name}.csv`, [['Name', 'Phone', 'Status', 'Delivery', 'Problem'], ...d.recipients.map((r) => [r.name, `+${r.wa}`, r.status, r.delivery, r.error])])}>
                    <Icon name="download" /> Download
                  </button>
                )}
              </div>
            </div>
            {d.recipients.length ? (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <tbody>
                    {recipients.slice(0, 500).map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.name || 'No name'}
                          <span className="dash-muted dash-block dash-small">{showNumber(r.wa)}</span>
                        </td>
                        <td>
                          {DELIVERY[r.delivery] ? <Badge tone={DELIVERY[r.delivery][1]}>{DELIVERY[r.delivery][0]}</Badge> : <Badge tone={RECIPIENT[r.status]?.[1]}>{RECIPIENT[r.status]?.[0] || r.status}</Badge>}
                        </td>
                        <td className="dash-small wa-bad">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-muted">The list is made when the campaign is sent.</p>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

const STEPS = ['Template', 'Audience', 'Message', 'Send'];

function NewCampaign({ copyOf, onClose, onSaved }) {
  const { status } = useWa();
  const templates = useLoad(() => wa.templates(), []);
  const contacts = useLoad(() => wa.contacts(), []);
  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => ({
    name: copyOf ? `${copyOf.name} (again)` : '',
    template: copyOf?.template || null,
    audience: copyOf?.audience || { tags: [], excludeTags: [], match: 'any', includeNoConsent: false },
    mapping: copyOf?.mapping || {},
    send: 'now',
    scheduleAt: '',
  }));
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const approved = (templates.data?.templates || []).filter((t) => t.status === 'APPROVED');
  const template = approved.find((t) => t.name === f.template?.name && t.language === f.template?.language);
  const tags = useMemo(() => {
    const m = new Map();
    for (const c of contacts.data?.contacts || []) for (const t of c.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [contacts.data]);
  const details = useMemo(() => {
    const keys = new Set();
    for (const c of contacts.data?.contacts || []) for (const k of Object.keys(c.attributes || {})) keys.add(k);
    return Object.fromEntries([...keys].map((k) => [k, k.replace(/_/g, ' ')]));
  }, [contacts.data]);
  const marketing = template?.category === 'MARKETING';

  // How many people, re-counted when the audience changes.
  useEffect(() => {
    if (!template) return undefined;
    const t = setTimeout(() => {
      wa.previewCampaign({ name: f.name || 'x', template: f.template, audience: f.audience, mapping: f.mapping })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [template, f.template, f.audience, f.mapping, f.name]);

  const toggleTag = (key, t) => {
    const cur = f.audience[key] || [];
    set({ audience: { ...f.audience, [key]: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] } });
  };
  const can = [Boolean(f.name.trim() && template), Boolean(preview?.count), true, f.send !== 'schedule' || Boolean(f.scheduleAt)];
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await wa.createCampaign({ ...f, scheduleAt: f.send === 'schedule' ? new Date(f.scheduleAt).toISOString() : null }));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setTestMsg('');
    try {
      await wa.test({ to: testTo, template: f.template, mapping: f.mapping, name: 'Test' });
      setTestMsg('Test sent. Check that phone.');
    } catch (e) {
      setTestMsg(e.message);
    }
  };

  return (
    <Drawer open onClose={onClose} title="New campaign" wide>
      <ol className="wa-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>
            <button type="button" onClick={() => i <= step || can.slice(0, i).every(Boolean) ? setStep(i) : null}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>
      <div className="wa-split">
        <div>
          {step === 0 && (
            <>
              <label className="dash-field">
                <span className="dash-field__label">Campaign name (for you)</span>
                <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Diwali offer, Coimbatore hotels" autoFocus />
              </label>
              <section className="biz-section">
                <h3>Template</h3>
                {templates.loading && !templates.data && <Loading />}
                {templates.data && !approved.length && <p className="dash-muted">No approved templates yet. Make one under Templates; once Meta approves it, it shows here.</p>}
                <div className="wa-pick-list">
                  {approved.map((t) => (
                    <button key={t.id} type="button" className={`wa-pick${template?.id === t.id ? ' is-on' : ''}`} onClick={() => set({ template: { name: t.name, language: t.language }, mapping: {} })}>
                      <strong>{t.name}</strong>
                      <span className="dash-small dash-muted">
                        {CATEGORY[t.category]} · {status?.languages?.[t.language] || t.language}
                      </span>
                      <span className="dash-small wa-clip">{t.components?.find((c) => c.type === 'BODY')?.text}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {step === 1 && (
            <>
              <section className="biz-section">
                <h3>Send to</h3>
                <div className="dash-seg" role="group" aria-label="Match">
                  <button type="button" className={!f.audience.tags.length ? 'is-on' : ''} onClick={() => set({ audience: { ...f.audience, tags: [] } })}>
                    Everyone
                  </button>
                  <button type="button" className={f.audience.tags.length && f.audience.match === 'any' ? 'is-on' : ''} onClick={() => set({ audience: { ...f.audience, match: 'any' } })}>
                    Any of these tags
                  </button>
                  <button type="button" className={f.audience.tags.length && f.audience.match === 'all' ? 'is-on' : ''} onClick={() => set({ audience: { ...f.audience, match: 'all' } })}>
                    All of these tags
                  </button>
                </div>
                <div className="wa-chips">
                  {tags.map(([t, n]) => (
                    <button key={t} type="button" className={`wa-chip${f.audience.tags.includes(t) ? ' is-on' : ''}`} onClick={() => toggleTag('tags', t)}>
                      {t} <small>{n}</small>
                    </button>
                  ))}
                  {!tags.length && <span className="dash-muted dash-small">No tags yet: add them under Contacts.</span>}
                </div>
              </section>
              {tags.length > 0 && (
                <section className="biz-section">
                  <h3>But not</h3>
                  <div className="wa-chips">
                    {tags.map(([t]) => (
                      <button key={t} type="button" className={`wa-chip wa-chip--not${(f.audience.excludeTags || []).includes(t) ? ' is-on' : ''}`} onClick={() => toggleTag('excludeTags', t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {!marketing && (
                <label className="dash-check">
                  <input type="checkbox" checked={f.audience.includeNoConsent} onChange={(e) => set({ audience: { ...f.audience, includeNoConsent: e.target.checked } })} /> Include people who haven’t agreed to offers (this {CATEGORY[template?.category]?.toLowerCase()} message isn’t an offer)
                </label>
              )}
              {preview && (
                <div className="biz-box">
                  <strong className="wa-count">{preview.count}</strong> {preview.count === 1 ? 'person' : 'people'} will get it.
                  {(preview.skipped.optedOut > 0 || preview.skipped.noConsent > 0) && (
                    <span className="dash-block dash-small dash-muted">
                      Left out: {preview.skipped.optedOut} opted out{preview.skipped.noConsent ? `, ${preview.skipped.noConsent} without consent for offers` : ''}.
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          {step === 2 && template && (
            <>
              <section className="biz-section">
                <h3>Fill in the template</h3>
                <p className="dash-muted dash-small">Use each person’s details, or type one value for everyone. A fallback is used when a person has no such detail.</p>
                <ValueMapper template={template} mapping={f.mapping} onChange={(mapping) => set({ mapping })} extraFields={details} onUpload={async (file) => (await wa.uploadMedia(file)).url} />
              </section>
              {preview?.incomplete > 0 && <p className="dash-small biz-warn">{preview.incomplete} people are missing a value and will be skipped. Add a fallback to include them.</p>}
              <section className="biz-section">
                <h3>Send a test first</h3>
                <div className="dash-row">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Your WhatsApp number" aria-label="Test number" />
                  <button type="button" className="dash-btn dash-btn--ghost" onClick={test} disabled={!testTo}>
                    Send test
                  </button>
                </div>
                {testMsg && <p className="dash-small">{testMsg}</p>}
              </section>
            </>
          )}
          {step === 3 && (
            <>
              <section className="biz-section">
                <h3>When</h3>
                <div className="wa-cats">
                  {[
                    ['now', 'Send now', 'Starts straight away, at a steady pace.'],
                    ['schedule', 'Schedule', 'Goes out by itself at the time you choose.'],
                    ['draft', 'Save as draft', 'Send or schedule it later.'],
                  ].map(([k, l, help]) => (
                    <button key={k} type="button" className={`wa-cat${f.send === k ? ' is-on' : ''}`} onClick={() => set({ send: k })}>
                      <strong>{l}</strong>
                      <span>{help}</span>
                    </button>
                  ))}
                </div>
                {f.send === 'schedule' && (
                  <label className="dash-field" style={{ marginTop: 10 }}>
                    <span className="dash-field__label">Send at</span>
                    <input type="datetime-local" value={f.scheduleAt} onChange={(e) => set({ scheduleAt: e.target.value })} min={new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 16)} />
                  </label>
                )}
              </section>
              <div className="biz-box">
                <dl className="dash-facts">
                  <div>
                    <dt>Campaign</dt>
                    <dd>{f.name}</dd>
                  </div>
                  <div>
                    <dt>Template</dt>
                    <dd>
                      {template?.name} ({CATEGORY[template?.category]})
                    </dd>
                  </div>
                  <div>
                    <dt>People</dt>
                    <dd>
                      <strong>{preview?.count ?? '…'}</strong>
                      {preview?.incomplete ? ` (${preview.incomplete} skipped for a missing value)` : ''}
                    </dd>
                  </div>
                </dl>
                {marketing && <p className="dash-small dash-muted">Meta charges for each marketing message delivered, and may hold some back if people haven’t been reading your messages.</p>}
              </div>
            </>
          )}
          {problem && <div className="dash-error">{problem.message}</div>}
          <div className="dash-row biz-actions">
            {step > 0 && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            {step < 3 ? (
              <button type="button" className="dash-btn" disabled={!can[step]} onClick={() => setStep(step + 1)}>
                Next
              </button>
            ) : (
              <button type="button" className="dash-btn" disabled={busy || !can.every(Boolean)} onClick={save}>
                {busy ? 'Saving…' : f.send === 'now' ? `Send to ${preview?.count ?? ''} people` : f.send === 'schedule' ? 'Schedule' : 'Save draft'}
              </button>
            )}
          </div>
        </div>
        <div className="wa-sticky">
          {template ? (
            <>
              <PhonePreview components={template.components} values={previewValues(template, f.mapping, preview?.sample?.[0] || { name: 'Lakshmi Ramesh' })} />
              {preview?.sample?.[0] && <p className="dash-muted dash-small" style={{ textAlign: 'center' }}>As {preview.sample[0].name || showNumber(preview.sample[0].wa)} will see it</p>}
            </>
          ) : (
            <p className="dash-muted dash-small">Choose a template to see it here.</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
