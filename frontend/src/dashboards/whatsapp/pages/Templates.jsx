import { useMemo, useRef, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, ago, useLoad } from '../../shared/ui.jsx';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { wa } from '../api.js';
import { CATEGORY, PhonePreview, TemplateStatus, componentsFromForm, useWa, variablesIn } from '../shared.jsx';
import { LIBRARY } from '../library.js';

// Message templates: every message a business starts on WhatsApp must use
// one, approved by Meta. Made here (with a live preview), sent to Meta, and
// kept in step with Meta by Sync and by Meta's notifications.
const BLANK = {
  name: '',
  language: 'en',
  category: 'MARKETING',
  header: { type: 'none', text: '', example: '', handle: '', previewUrl: '' },
  body: { text: '', examples: [] },
  footer: { text: '' },
  buttons: [],
  auth: { securityNote: true, expiresMinutes: 10, buttonText: 'Copy code' },
};
const BUTTON_KINDS = { quick_reply: 'Quick reply', url: 'Visit website', phone: 'Call phone number', copy_code: 'Copy offer code' };
const CATEGORY_HELP = {
  MARKETING: 'Offers, new products, festival greetings, announcements. Needs the person’s consent.',
  UTILITY: 'About something they asked for or bought: order confirmed, dispatched, delivered, payment received.',
  AUTHENTICATION: 'One-time login or verification codes. Meta writes the text.',
};

export default function Templates() {
  const { allowed } = useDash();
  const { status } = useWa();
  const { get, patch } = useUrl();
  const list = useLoad(() => wa.templates(), []);
  const [q, setQ, search] = useUrlSearch();
  const [syncing, setSyncing] = useState(false);
  const [problem, setProblem] = useState(null);
  const show = get('status');
  const rows = useMemo(
    () => (list.data?.templates || []).filter((t) => (!show ? t.status !== 'DELETED' : t.status === show) && (!search || `${t.name} ${t.category}`.toLowerCase().includes(search.toLowerCase()))),
    [list.data, show, search],
  );
  const open = (list.data?.templates || []).find((t) => t.id === get('template'));
  const sync = async () => {
    setSyncing(true);
    setProblem(null);
    try {
      list.setData(await wa.syncTemplates());
    } catch (e) {
      setProblem(e);
    } finally {
      setSyncing(false);
    }
  };
  const counts = (s) => (list.data?.templates || []).filter((t) => t.status === s).length;

  return (
    <div className="dash-page">
      <PageHead
        title="Templates"
        intro="Every message you start on WhatsApp uses a template approved by Meta. Make one here; Meta usually approves within minutes, sometimes a day."
        range={false}
        actions={
          <div className="dash-row biz-actions">
            {allowed('editor') && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={sync} disabled={syncing || !status?.connection?.ready}>
                <Icon name="refresh" /> {syncing ? 'Syncing…' : 'Sync from Meta'}
              </button>
            )}
            <button type="button" className="dash-btn dash-btn--ghost" onClick={() => patch({ library: 1, template: '' })}>
              <Icon name="layers" /> Ready-made templates
            </button>
            {allowed('editor') && (
              <button type="button" className="dash-btn" onClick={() => patch({ new: 1, template: '' })}>
                <Icon name="plus" /> New template
              </button>
            )}
          </div>
        }
      />
      {problem && <div className="dash-error">{problem.message}</div>}
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      <Card>
        <div className="dash-filters">
          <div className="dash-seg" role="group" aria-label="Show">
            {[['', 'All'], ['APPROVED', `Approved (${counts('APPROVED')})`], ['PENDING', `Waiting (${counts('PENDING')})`], ['REJECTED', `Rejected (${counts('REJECTED')})`]].map(([k, label]) => (
              <button key={k || 'all'} type="button" className={show === k ? 'is-on' : ''} onClick={() => patch({ status: k }, { replace: true })}>
                {label}
              </button>
            ))}
          </div>
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {list.loading && !list.data && <Loading />}
        {list.data &&
          (rows.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Kind</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="dash-row-link" onClick={() => patch({ template: t.id })}>
                      <td>
                        <strong>{t.name}</strong>
                        <span className="dash-muted dash-block dash-small wa-clip">{t.components?.find((c) => c.type === 'BODY')?.text || (t.category === 'AUTHENTICATION' ? 'Verification code' : '')}</span>
                      </td>
                      <td className="dash-small">{CATEGORY[t.category] || t.category}</td>
                      <td className="dash-small">{status?.languages?.[t.language] || t.language}</td>
                      <td>
                        <TemplateStatus status={t.status} />
                        {t.rejectedReason && <span className="dash-block dash-small wa-bad">{t.rejectedReason.replace(/_/g, ' ').toLowerCase()}</span>}
                      </td>
                      <td className="dash-small dash-muted">{ago(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="file" title={search || show ? 'No template matches' : 'No templates yet'}>
              {status?.connection?.ready ? 'Click “Sync from Meta” to bring in templates made in WhatsApp Manager, or make a new one.' : 'Make your first template; it goes to Meta once WhatsApp is connected.'}
            </Empty>
          ))}
      </Card>
      {get('new') && (
        <Builder
          start={get('copy') ? copyForm((list.data?.templates || []).find((t) => t.id === get('copy'))) : get('starter') !== '' && LIBRARY[Number(get('starter'))] ? structuredClone(LIBRARY[Number(get('starter'))].form) : null}
          onClose={() => patch({ new: '', copy: '', starter: '' })}
          onSaved={(t) => {
            list.reload();
            patch({ new: '', copy: '', starter: '', template: t.id }, { replace: true });
          }}
        />
      )}
      {get('library') && !get('new') && (
        <Library
          made={new Set((list.data?.templates || []).filter((t) => t.status !== 'DELETED').map((t) => t.name))}
          onUse={(i) => patch({ library: '', new: 1, starter: i })}
          onClose={() => patch({ library: '' })}
          onSent={list.reload}
        />
      )}
      {open && !get('new') && <TemplateDrawer t={open} onClose={() => patch({ template: '' })} onChanged={list.reload} onCopy={() => patch({ new: 1, copy: open.id, template: '' })} />}
    </div>
  );
}

// A stored template as a new form (for “Make a copy”).
function copyForm(t) {
  if (!t) return null;
  if (t.form) return { ...BLANK, ...t.form, name: `${t.form.name}_copy`.slice(0, 60), header: { ...BLANK.header, ...t.form.header, handle: '' } };
  const c = (type) => t.components?.find((x) => x.type === type);
  const h = c('HEADER');
  return {
    ...BLANK,
    name: `${t.name}_copy`,
    language: t.language,
    category: t.category,
    header: h ? (h.format === 'TEXT' ? { ...BLANK.header, type: 'text', text: h.text, example: h.example?.header_text?.[0] || '' } : { ...BLANK.header, type: h.format.toLowerCase() }) : BLANK.header,
    body: { text: c('BODY')?.text || '', examples: c('BODY')?.example?.body_text?.[0] || [] },
    footer: { text: c('FOOTER')?.text || '' },
    buttons: (c('BUTTONS')?.buttons || []).map((b) => ({ type: { QUICK_REPLY: 'quick_reply', URL: 'url', PHONE_NUMBER: 'phone', COPY_CODE: 'copy_code' }[b.type] || 'quick_reply', text: b.text, url: b.url, phone: b.phone_number, example: b.type === 'URL' ? '' : b.example })),
  };
}

function TemplateDrawer({ t, onClose, onChanged, onCopy }) {
  const { allowed } = useDash();
  const { status } = useWa();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!window.confirm(`Delete ${t.name} at Meta? Its name can’t be used again for 30 days.`)) return;
    setBusy(true);
    try {
      await wa.deleteTemplate(t.name, t.language);
      onChanged();
      onClose();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={t.name} wide>
      <div className="wa-split">
        <div>
          <dl className="dash-facts">
            <div>
              <dt>Status</dt>
              <dd>
                <TemplateStatus status={t.status} /> {t.quality && <Badge tone={t.quality === 'GREEN' ? 'good' : t.quality === 'RED' ? 'bad' : 'warn'}>Quality {t.quality.toLowerCase()}</Badge>}
                {t.rejectedReason && <span className="dash-block dash-small wa-bad">Rejected: {t.rejectedReason.replace(/_/g, ' ').toLowerCase()}. Make a copy, change it and send it again.</span>}
              </dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>
                {CATEGORY[t.category]} · {status?.languages?.[t.language] || t.language}
              </dd>
            </div>
            <div>
              <dt>Needs filling in</dt>
              <dd>{variablesIn(JSON.stringify(t.components)).length ? `${new Set(variablesIn(t.components?.find((c) => c.type === 'BODY')?.text)).size} message variable(s)` : 'Nothing: it goes as written'}</dd>
            </div>
            {t.createdBy && (
              <div>
                <dt>Made</dt>
                <dd>
                  {ago(t.createdAt)} by {t.createdBy}
                </dd>
              </div>
            )}
          </dl>
          <div className="dash-row biz-actions">
            {allowed('editor') && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={onCopy}>
                <Icon name="copy" /> Make a copy
              </button>
            )}
            {allowed('admin') && t.status !== 'DELETED' && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={remove} disabled={busy}>
                <Icon name="trash" /> Delete
              </button>
            )}
          </div>
        </div>
        <PhonePreview components={t.components} />
      </div>
    </Drawer>
  );
}

function Builder({ start, onClose, onSaved }) {
  const { status } = useWa();
  const [f, setF] = useState(start || BLANK);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef(null);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const bodyVars = [...new Set(variablesIn(f.body.text))].sort((a, b) => a - b);
  const auth = f.category === 'AUTHENTICATION';

  const insert = (before, after = before) => {
    const el = bodyRef.current;
    const text = f.body.text;
    const [s, e] = el ? [el.selectionStart, el.selectionEnd] : [text.length, text.length];
    const next = text.slice(0, s) + before + text.slice(s, e) + after + text.slice(e);
    set({ body: { ...f.body, text: next } });
    requestAnimationFrame(() => el?.focus());
  };
  const addVariable = () => {
    const n = (bodyVars.at(-1) || 0) + 1;
    insert(`{{${n}}}`, '');
  };
  const setButton = (i, patch) => set({ buttons: f.buttons.map((b, x) => (x === i ? { ...b, ...patch } : b)) });
  const upload = async (file) => {
    setUploading(true);
    setProblem(null);
    try {
      const { handle } = await wa.uploadSample(file);
      set({ header: { ...f.header, handle, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' } });
    } catch (e) {
      setProblem(e);
    } finally {
      setUploading(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await wa.createTemplate(f));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title="New template" wide>
      <form onSubmit={save} className="wa-split">
        <div>
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">Name</span>
              <input value={f.name} onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_ ]/g, '').replace(/ /g, '_') })} placeholder="order_dispatched" required />
              {err('name')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Language</span>
              <select value={f.language} onChange={(e) => set({ language: e.target.value })}>
                {Object.entries(status?.languages || { en: 'English' }).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="wa-cats" role="radiogroup" aria-label="Kind">
            {Object.entries(CATEGORY).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={f.category === k} className={`wa-cat${f.category === k ? ' is-on' : ''}`} onClick={() => set({ category: k })}>
                <strong>{label}</strong>
                <span>{CATEGORY_HELP[k]}</span>
              </button>
            ))}
          </div>
          {err('category')}

          {auth ? (
            <section className="biz-section">
              <h3>Verification code</h3>
              <p className="dash-muted dash-small">Meta writes the message: “123456 is your verification code.” You choose these:</p>
              <div className="biz-form">
                <label className="dash-check biz-wide">
                  <input type="checkbox" checked={f.auth.securityNote !== false} onChange={(e) => set({ auth: { ...f.auth, securityNote: e.target.checked } })} /> Add “For your security, do not share this code.”
                </label>
                <label className="dash-field">
                  <span className="dash-field__label">Code lasts (minutes)</span>
                  <input value={f.auth.expiresMinutes} onChange={(e) => set({ auth: { ...f.auth, expiresMinutes: e.target.value } })} inputMode="numeric" />
                  {err('expiresMinutes')}
                </label>
                <label className="dash-field">
                  <span className="dash-field__label">Button text</span>
                  <input value={f.auth.buttonText} maxLength={25} onChange={(e) => set({ auth: { ...f.auth, buttonText: e.target.value } })} />
                </label>
              </div>
            </section>
          ) : (
            <>
              <section className="biz-section">
                <h3>Header (optional)</h3>
                <div className="dash-seg" role="group" aria-label="Header">
                  {[['none', 'None'], ['text', 'Text'], ['image', 'Image'], ['video', 'Video'], ['document', 'Document']].map(([k, label]) => (
                    <button key={k} type="button" className={f.header.type === k ? 'is-on' : ''} onClick={() => set({ header: { ...BLANK.header, type: k } })}>
                      {label}
                    </button>
                  ))}
                </div>
                {f.header.type === 'text' && (
                  <div className="biz-form" style={{ marginTop: 10 }}>
                    <label className="dash-field">
                      <span className="dash-field__label">Header text ({f.header.text.length}/60)</span>
                      <input value={f.header.text} maxLength={60} onChange={(e) => set({ header: { ...f.header, text: e.target.value } })} placeholder="Your order is on its way" />
                      {err('headerText')}
                    </label>
                    {variablesIn(f.header.text).length > 0 && (
                      <label className="dash-field">
                        <span className="dash-field__label">Example for {'{{1}}'}</span>
                        <input value={f.header.example} onChange={(e) => set({ header: { ...f.header, example: e.target.value } })} />
                        {err('headerExample')}
                      </label>
                    )}
                  </div>
                )}
                {['image', 'video', 'document'].includes(f.header.type) && (
                  <div style={{ marginTop: 10 }}>
                    <p className="dash-muted dash-small">Meta needs a sample to check. When sending, you choose the real {f.header.type} for each campaign.</p>
                    <label className="dash-btn dash-btn--ghost dash-btn--sm" style={{ cursor: 'pointer' }}>
                      <Icon name="image" /> {uploading ? 'Uploading…' : f.header.handle ? 'Sample added: change' : `Upload a sample ${f.header.type}`}
                      <input type="file" hidden accept={f.header.type === 'image' ? 'image/jpeg,image/png' : f.header.type === 'video' ? 'video/mp4' : 'application/pdf'} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={uploading} />
                    </label>
                    {err('headerMedia')}
                  </div>
                )}
              </section>

              <section className="biz-section">
                <div className="biz-section__head">
                  <h3>Message</h3>
                  <span className="dash-muted dash-small">{f.body.text.length}/1024</span>
                </div>
                <div className="wa-toolbar" role="toolbar" aria-label="Formatting">
                  <button type="button" onClick={() => insert('*')} title="Bold">
                    <strong>B</strong>
                  </button>
                  <button type="button" onClick={() => insert('_')} title="Italic">
                    <em>I</em>
                  </button>
                  <button type="button" onClick={() => insert('~')} title="Strikethrough">
                    <s>S</s>
                  </button>
                  <button type="button" onClick={() => insert('```')} title="Monospace">
                    <code>M</code>
                  </button>
                  <button type="button" onClick={addVariable} className="wa-toolbar__var">
                    + Variable
                  </button>
                </div>
                <textarea
                  ref={bodyRef}
                  className="dash-textarea"
                  rows={6}
                  maxLength={1024}
                  value={f.body.text}
                  onChange={(e) => set({ body: { ...f.body, text: e.target.value } })}
                  placeholder={'Hi {{1}}, your order {{2}} has been dispatched and will reach you by tomorrow. Thank you for choosing Cholan Rice!'}
                  required
                />
                {err('body')}
                {bodyVars.length > 0 && (
                  <>
                    <p className="dash-muted dash-small">Examples, so Meta understands each variable (not sent to customers):</p>
                    <div className="biz-form">
                      {bodyVars.map((n) => (
                        <label key={n} className="dash-field">
                          <span className="dash-field__label">{`{{${n}}}`}</span>
                          <input
                            value={f.body.examples[n - 1] || ''}
                            onChange={(e) => {
                              const examples = [...f.body.examples];
                              examples[n - 1] = e.target.value;
                              set({ body: { ...f.body, examples } });
                            }}
                            placeholder={n === 1 ? 'Lakshmi' : n === 2 ? 'CO-00012' : 'example'}
                          />
                        </label>
                      ))}
                    </div>
                    {err('bodyExamples')}
                  </>
                )}
              </section>

              <section className="biz-section">
                <label className="dash-field">
                  <span className="dash-field__label">Footer (optional, {f.footer.text.length}/60)</span>
                  <input value={f.footer.text} maxLength={60} onChange={(e) => set({ footer: { text: e.target.value } })} placeholder="Reply STOP to stop offers" />
                  {err('footer')}
                </label>
              </section>

              <section className="biz-section">
                <div className="biz-section__head">
                  <h3>Buttons (optional)</h3>
                  <span className="dash-muted dash-small">{f.buttons.length}/10</span>
                </div>
                {f.buttons.map((b, i) => (
                  <div key={i} className="wa-button-row">
                    <select value={b.type} onChange={(e) => setButton(i, { type: e.target.value })} aria-label={`Button ${i + 1} kind`}>
                      {Object.entries(BUTTON_KINDS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {b.type !== 'copy_code' && <input value={b.text || ''} maxLength={25} onChange={(e) => setButton(i, { text: e.target.value })} placeholder="Button text" aria-label="Button text" />}
                    {b.type === 'url' && <input value={b.url || ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://www.cholanrice.in/products/{{1}}" aria-label="Link" className="wa-grow" />}
                    {b.type === 'url' && variablesIn(b.url).length > 0 && <input value={b.example || ''} onChange={(e) => setButton(i, { example: e.target.value })} placeholder="Example end of link" aria-label="Example" />}
                    {b.type === 'phone' && <input value={b.phone || ''} onChange={(e) => setButton(i, { phone: e.target.value })} placeholder="+919092266667" aria-label="Phone number" />}
                    {b.type === 'copy_code' && <input value={b.example || ''} maxLength={15} onChange={(e) => setButton(i, { example: e.target.value })} placeholder="Example code, e.g. DIWALI10" aria-label="Example code" />}
                    <button type="button" className="dash-icon-btn" aria-label="Remove button" onClick={() => set({ buttons: f.buttons.filter((_, x) => x !== i) })}>
                      <Icon name="close" />
                    </button>
                    {err(`button${i}`)}
                  </div>
                ))}
                {err('buttons')}
                {f.buttons.length < 10 && (
                  <div className="dash-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(BUTTON_KINDS).map(([k, l]) => (
                      <button key={k} type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => set({ buttons: [...f.buttons, { type: k, text: k === 'quick_reply' ? 'Yes, interested' : k === 'url' ? 'Order now' : k === 'phone' ? 'Call us' : '', url: '', phone: k === 'phone' ? '+919092266667' : '' }] })}>
                        + {l}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          {problem && <div className="dash-error">{problem.message}</div>}
          <button type="submit" className="dash-btn" disabled={busy} style={{ marginTop: 12 }}>
            {busy ? 'Sending to Meta…' : 'Send to Meta for approval'}
          </button>
        </div>
        <div className="wa-sticky">
          <PhonePreview components={componentsFromForm(f)} values={{ header: f.header.example, body: f.body.examples }} />
          <p className="dash-muted dash-small" style={{ textAlign: 'center' }}>
            Preview with your examples
          </p>
        </div>
      </form>
    </Drawer>
  );
}

// The ready-made templates: open one in the builder to check and send it, or
// send them all to Meta at once (those not made yet; the photo one needs a
// sample photo, so it is opened instead).
function Library({ made, onUse, onClose, onSent }) {
  const { allowed } = useDash();
  const { status } = useWa();
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const shown = LIBRARY.map((item, i) => ({ ...item, i })).filter((x) => !kind || x.form.category === kind);
  const ready = LIBRARY.filter((x) => !made.has(x.form.name) && x.form.header.type !== 'image');
  const sendAll = async () => {
    if (!window.confirm(`Send ${ready.length} templates to Meta for approval? You can delete any you don’t want later.`)) return;
    setBusy(true);
    const done = [];
    const failed = [];
    for (const item of ready) {
      try {
        await wa.createTemplate(item.form);
        done.push(item.form.name);
      } catch (e) {
        failed.push(`${item.form.name}: ${e.message}`);
      }
    }
    setBusy(false);
    setResult({ done, failed });
    onSent();
  };
  return (
    <Drawer open onClose={onClose} title="Ready-made templates" wide>
      <p className="dash-muted dash-small">
        Written for Cholan Rice and checked against Meta’s rules. Open one to change the words, then send it to Meta. Utility templates are for orders and payments; Marketing ones (offers) go only to people who agreed.
      </p>
      <div className="dash-row biz-actions">
        <div className="dash-seg" role="group" aria-label="Kind">
          {[['', 'All'], ['UTILITY', 'Orders and payments'], ['MARKETING', 'Offers'], ['AUTHENTICATION', 'Codes']].map(([k, l]) => (
            <button key={k || 'all'} type="button" className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        {allowed('editor') && ready.length > 0 && (
          <button type="button" className="dash-btn" onClick={sendAll} disabled={busy || !status?.connection?.ready} title={status?.connection?.ready ? '' : 'Connect WhatsApp first'}>
            {busy ? 'Sending…' : `Send all ${ready.length} to Meta`}
          </button>
        )}
      </div>
      {result && (
        <div className={`dash-flash dash-flash--${result.failed.length ? 'bad' : 'good'}`}>
          {result.done.length} sent to Meta for approval.{result.failed.length ? ` Not sent: ${result.failed.join('; ')}` : ''}
        </div>
      )}
      <div className="wa-library">
        {shown.map(({ form, use, i }) => (
          <article key={form.name} className="wa-lib">
            <div className="wa-lib__head">
              <strong>{form.name}</strong>
              <span className="dash-small dash-muted">
                {CATEGORY[form.category]} · {status?.languages?.[form.language] || form.language}
              </span>
            </div>
            <p className="dash-small">{use}</p>
            <div className="wa-lib__preview">
              <PhonePreview components={componentsFromForm(form)} values={{ header: form.header.example, body: form.body.examples }} />
            </div>
            <div className="dash-row">
              {made.has(form.name) ? (
                <Badge tone="good">Already made</Badge>
              ) : (
                allowed('editor') && (
                  <button type="button" className="dash-btn dash-btn--sm" onClick={() => onUse(i)}>
                    Use this
                  </button>
                )
              )}
            </div>
          </article>
        ))}
      </div>
    </Drawer>
  );
}
