import { useEffect, useMemo, useRef, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Drawer, ErrorNote, Icon, Loading, PageHead, ago, useLoad } from '../../shared/ui.jsx';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { wa } from '../api.js';
import { CATEGORY, PhonePreview, TemplateStatus, componentsFromForm, useWa, variablesIn } from '../shared.jsx';
import { LIBRARY } from '../library.js';

// Message templates, in three panes: the list (with Drafts, In review,
// Approved and Rejected), the editor, and the phone preview. A template can
// be kept as a draft and finished later; sending it asks Meta to approve it.
// A rejected one can be changed and sent again under the same name.
const BLANK = {
  name: '',
  language: 'en',
  category: 'MARKETING',
  description: '',
  header: { type: 'none', text: '', example: '', handle: '', mediaUrl: '', previewUrl: '' },
  body: { text: '', examples: [] },
  footer: { text: '' },
  buttons: [],
  auth: { securityNote: true, expiresMinutes: 10, buttonText: 'Copy code' },
};
const TABS = [
  ['', 'All', () => true],
  ['drafts', 'Drafts', (t) => t.status === 'DRAFT'],
  ['review', 'In review', (t) => ['PENDING', 'IN_APPEAL'].includes(t.status)],
  ['approved', 'Approved', (t) => t.status === 'APPROVED'],
  ['rejected', 'Rejected', (t) => ['REJECTED', 'PAUSED', 'DISABLED'].includes(t.status)],
];
const BUTTON_KINDS = { quick_reply: 'Quick reply', url: 'Visit website', phone: 'Call phone number', copy_code: 'Copy offer code' };
const KIND_ICON = { MARKETING: 'bolt', UTILITY: 'check', AUTHENTICATION: 'lock' };
const EMOJI = ['🛒', '🍚', '🌾', '🎉', '🎁', '🔥', '✅', '📦', '🚚', '⏰', '💰', '💳', '📞', '👋', '🙏', '😊', '❤️', '⭐', '🪔', '🎊', '👍', '📍', '🆕', '💯', '⚡', '🌟', '🥳', '😋', '🍛', '🏷️'];
const EDITABLE = ['DRAFT', 'REJECTED', 'PAUSED'];

// A stored template as a form, for editing or copying.
function formOf(t) {
  if (!t) return null;
  if (t.form) return { ...BLANK, ...t.form, header: { ...BLANK.header, ...t.form.header, handle: '' }, description: t.description ?? t.form.description ?? '' };
  const c = (type) => t.components?.find((x) => x.type === type);
  const h = c('HEADER');
  return {
    ...BLANK,
    name: t.name,
    language: t.language,
    category: t.category,
    description: t.description || '',
    header: h ? (h.format === 'TEXT' ? { ...BLANK.header, type: 'text', text: h.text, example: h.example?.header_text?.[0] || '' } : { ...BLANK.header, type: h.format.toLowerCase() }) : BLANK.header,
    body: { text: c('BODY')?.text || '', examples: c('BODY')?.example?.body_text?.[0] || [] },
    footer: { text: c('FOOTER')?.text || '' },
    buttons: (c('BUTTONS')?.buttons || []).map((b) => ({ type: { QUICK_REPLY: 'quick_reply', URL: 'url', PHONE_NUMBER: 'phone', COPY_CODE: 'copy_code' }[b.type] || 'quick_reply', text: b.text, url: b.url, phone: b.phone_number, example: b.type === 'URL' ? '' : b.example })),
  };
}

export default function Templates() {
  const { allowed } = useDash();
  const { status } = useWa();
  const { get, patch } = useUrl();
  const list = useLoad(() => wa.templates(), []);
  const [q, setQ, search] = useUrlSearch();
  const [syncing, setSyncing] = useState(false);
  const [problem, setProblem] = useState(null);
  const all = useMemo(() => (list.data?.templates || []).filter((t) => t.status !== 'DELETED'), [list.data]);
  const tab = TABS.find(([k]) => k === get('show')) || TABS[0];
  const rows = all.filter((t) => tab[2](t) && (!search || `${t.name} ${t.description || ''} ${t.category}`.toLowerCase().includes(search.toLowerCase())));
  const selected = all.find((t) => t.id === get('template')) || (!get('new') && rows[0]) || null;
  const copyOf = all.find((t) => t.id === get('copy'));
  const starting = get('new') ? (copyOf ? { ...formOf(copyOf), name: `${copyOf.name}_copy` } : get('starter') !== '' && LIBRARY[Number(get('starter'))] ? structuredClone(LIBRARY[Number(get('starter'))].form) : { ...BLANK }) : null;

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
  const open = (id) => patch({ template: id, new: '', copy: '', starter: '' });
  const saved = (t) => {
    list.reload();
    patch({ template: t.id, new: '', copy: '', starter: '' }, { replace: true });
  };

  return (
    <div className="dash-page wa-templates-page">
      <PageHead
        title="Templates"
        intro="Every message you start on WhatsApp uses a template approved by Meta. Keep drafts here, send them for approval when ready."
        range={false}
        actions={
          <div className="dash-row biz-actions">
            {allowed('editor') && (
              <button type="button" className="dash-icon-btn wa-round" onClick={sync} disabled={syncing || !status?.connection?.ready} title="Sync from Meta" aria-label="Sync from Meta">
                <Icon name="refresh" />
              </button>
            )}
            <button type="button" className="dash-btn dash-btn--ghost" onClick={() => patch({ library: 1 })}>
              <Icon name="layers" /> Ready-made
            </button>
            {allowed('editor') && (
              <button type="button" className="dash-btn" onClick={() => patch({ new: 1, template: '', copy: '', starter: '' })}>
                <Icon name="plus" /> Create a template
              </button>
            )}
          </div>
        }
      />
      {problem && <div className="dash-error">{problem.message}</div>}
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      <div className="wa-tpl-bar">
        <div className="wa-tabs" role="tablist" aria-label="Show">
          {TABS.map(([k, label, test]) => (
            <button key={k || 'all'} type="button" role="tab" aria-selected={tab[0] === k} className={tab[0] === k ? 'is-on' : ''} onClick={() => patch({ show: k, template: '' }, { replace: true })}>
              {label} {k && <span className="wa-tabs__n">{all.filter(test).length}</span>}
            </button>
          ))}
        </div>
        <label className="dash-search">
          <Icon name="search" />
          <input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <div className="wa-tpl">
          <aside className="wa-tpl__list" aria-label="Templates">
            {!rows.length && <p className="dash-muted dash-small wa-tpl__none">{search ? 'No template matches.' : tab[0] === 'drafts' ? 'No drafts. Create a template and save it as a draft.' : 'Nothing here yet.'}</p>}
            {rows.map((t) => (
              <button key={t.id} type="button" className={`wa-tpl__item${selected?.id === t.id && !get('new') ? ' is-on' : ''}`} onClick={() => open(t.id)}>
                <span className={`wa-tpl__icon wa-tpl__icon--${(t.category || '').toLowerCase()}`}>
                  <Icon name={KIND_ICON[t.category] || 'file'} />
                </span>
                <span className="wa-tpl__text">
                  <strong># {t.name}</strong>
                  <span className="wa-clip">{t.description || t.components?.find((c) => c.type === 'BODY')?.text || (t.category === 'AUTHENTICATION' ? 'Verification code' : '')}</span>
                </span>
                <TemplateStatus status={t.status} />
              </button>
            ))}
          </aside>
          {get('new') ? (
            <Editor key={`new-${get('copy')}-${get('starter')}`} start={starting} onSaved={saved} onCancel={() => patch({ new: '', copy: '', starter: '' })} />
          ) : selected && EDITABLE.includes(selected.status) && allowed('editor') ? (
            <Editor key={selected.id} record={selected} start={formOf(selected)} onSaved={saved} onDeleted={() => (list.reload(), patch({ template: '' }))} />
          ) : selected ? (
            <Details key={selected.id} t={selected} onChanged={list.reload} onCopy={() => patch({ new: 1, copy: selected.id, template: '' })} />
          ) : (
            <div className="wa-tpl__pane wa-tpl__empty">
              <Icon name="file" />
              <p>Choose a template, or create one.</p>
            </div>
          )}
        </div>
      )}
      {get('library') && (
        <Library
          made={new Set(all.map((t) => t.name))}
          onUse={(i) => patch({ library: '', new: 1, starter: i, template: '' })}
          onClose={() => patch({ library: '' })}
          onSent={list.reload}
        />
      )}
    </div>
  );
}

// A template sent to Meta: what it is, and what can be done with it.
function Details({ t, onChanged, onCopy }) {
  const { allowed } = useDash();
  const { status } = useWa();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!window.confirm(`Delete ${t.name} at Meta? Its name can’t be used again for 30 days.`)) return;
    setBusy(true);
    try {
      await wa.deleteTemplate(t.name, t.language);
      onChanged();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="wa-tpl__pane">
        <div className="wa-tpl__head">
          <div>
            <span className="wa-tpl__eyebrow">Template</span>
            <h2># {t.name}</h2>
          </div>
          <TemplateStatus status={t.status} />
        </div>
        {t.description && <p className="wa-tpl__desc">{t.description}</p>}
        <dl className="dash-facts">
          <div>
            <dt>Kind</dt>
            <dd>
              {CATEGORY[t.category]} · {status?.languages?.[t.language] || t.language}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {t.status === 'APPROVED' ? 'Approved by Meta: ready to send.' : ['PENDING', 'IN_APPEAL'].includes(t.status) ? 'Meta is checking it. This usually takes minutes, sometimes a day.' : String(t.status).toLowerCase()}
              {t.quality && <Badge tone={t.quality === 'GREEN' ? 'good' : t.quality === 'RED' ? 'bad' : 'warn'}>Quality {t.quality.toLowerCase()}</Badge>}
            </dd>
          </div>
          <div>
            <dt>Variables</dt>
            <dd>{new Set(variablesIn(t.components?.find((c) => c.type === 'BODY')?.text)).size || 'None: it goes as written'}</dd>
          </div>
          {(t.submittedBy || t.createdBy) && (
            <div>
              <dt>Sent to Meta</dt>
              <dd>
                {ago(t.submittedAt || t.createdAt)} by {t.submittedBy || t.createdBy}
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
          {allowed('admin') && (
            <button type="button" className="dash-btn dash-btn--ghost" onClick={remove} disabled={busy}>
              <Icon name="trash" /> Delete
            </button>
          )}
        </div>
      </section>
      <div className="wa-tpl__phone">
        <PhonePreview components={t.components} values={{ header: t.form?.header?.example, headerLink: t.form?.header?.mediaUrl, body: t.form?.body?.examples }} />
      </div>
    </>
  );
}

// The editor (middle) and its live preview (right).
function Editor({ start, record, onSaved, onDeleted, onCancel }) {
  const { status } = useWa();
  const [f, setF] = useState(() => ({ ...BLANK, ...start, header: { ...BLANK.header, ...(start?.header || {}) }, body: { ...BLANK.body, ...(start?.body || {}) }, footer: { ...BLANK.footer, ...(start?.footer || {}) }, auth: { ...BLANK.auth, ...(start?.auth || {}) } }));
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [note, setNote] = useState('');
  const bodyRef = useRef(null);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const bodyVars = [...new Set(variablesIn(f.body.text))].sort((a, b) => a - b);
  const auth = f.category === 'AUTHENTICATION';
  const rejected = record && record.status !== 'DRAFT';
  useEffect(() => setNote(''), [f]);

  const insert = (before, after = before) => {
    const el = bodyRef.current;
    const text = f.body.text;
    const [s, e] = el ? [el.selectionStart, el.selectionEnd] : [text.length, text.length];
    set({ body: { ...f.body, text: text.slice(0, s) + before + text.slice(s, e) + after + text.slice(e) } });
    requestAnimationFrame(() => el?.focus());
  };
  const setButton = (i, patch) => set({ buttons: f.buttons.map((b, x) => (x === i ? { ...b, ...patch } : b)) });
  const upload = async (file) => {
    setUploading(true);
    setProblem(null);
    try {
      const { url } = await wa.uploadMedia(file);
      set({ header: { ...f.header, mediaUrl: url, previewUrl: url, handle: '' } });
    } catch (e) {
      setProblem(e);
    } finally {
      setUploading(false);
    }
  };
  const act = async (what) => {
    setBusy(what);
    setProblem(null);
    try {
      if (what === 'draft') {
        const d = await wa.saveDraft(record?.status === 'DRAFT' ? record.id : null, f);
        setNote('Draft saved.');
        onSaved(d);
      } else if (record) onSaved(await wa.submitTemplate(record.id, f));
      else onSaved(await wa.createTemplate(f));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy('');
    }
  };
  const removeDraft = async () => {
    if (!window.confirm(`Delete the draft ${record.name}?`)) return;
    try {
      await wa.deleteDraft(record.id);
      onDeleted();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <>
      <section className="wa-tpl__pane wa-tpl__editor">
        <div className="wa-tpl__head">
          <div>
            <span className="wa-tpl__eyebrow">{record ? 'Template' : 'New template'}</span>
            <h2># {f.name || 'untitled'}</h2>
          </div>
          {record ? <TemplateStatus status={record.status} /> : <Badge tone="muted">Not saved</Badge>}
        </div>
        {rejected && record.rejectedReason && (
          <p className="biz-warn dash-small">
            Meta rejected it: {record.rejectedReason.replace(/_/g, ' ').toLowerCase()}. Change it below and send it again.
          </p>
        )}
        <div className="biz-form">
          <label className="dash-field">
            <span className="dash-field__label">Name</span>
            <input value={f.name} onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_ ]/g, '').replace(/ /g, '_') })} placeholder="cart_reminder" disabled={rejected} />
            {err('name')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Language</span>
            <select value={f.language} onChange={(e) => set({ language: e.target.value })} disabled={rejected}>
              {Object.entries(status?.languages || { en: 'English' }).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="dash-field biz-wide">
            <span className="dash-field__label">Category</span>
            <div className="dash-seg" role="radiogroup" aria-label="Category">
              {Object.entries(CATEGORY).map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={f.category === k} className={f.category === k ? 'is-on' : ''} onClick={() => set({ category: k })}>
                  {label}
                </button>
              ))}
            </div>
            <span className="dash-field__hint">
              {f.category === 'MARKETING' ? 'Offers, new arrivals, greetings. Only to people who agreed.' : f.category === 'UTILITY' ? 'About an order or payment they made.' : 'A one-time code. Meta writes the words.'}
            </span>
            {err('category')}
          </div>
          <label className="dash-field biz-wide">
            <span className="dash-field__label">What it is for (only you see this)</span>
            <input value={f.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} placeholder="Cart reminder: items left in the cart, 2 hours after the reminder email" />
          </label>
        </div>

        {auth ? (
          <section className="biz-section">
            <h3>Verification code</h3>
            <p className="dash-muted dash-small">Meta writes the message: “123456 is your verification code.”</p>
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
              <span className="dash-field__label">
                Header <span className="dash-muted">(optional)</span>
              </span>
              <div className="dash-seg" role="group" aria-label="Header" style={{ marginTop: 6 }}>
                {[['none', 'None'], ['text', 'Text'], ['image', 'Picture'], ['video', 'Video'], ['document', 'PDF']].map(([k, label]) => (
                  <button key={k} type="button" className={f.header.type === k ? 'is-on' : ''} onClick={() => set({ header: { ...BLANK.header, type: k } })}>
                    {label}
                  </button>
                ))}
              </div>
              {f.header.type === 'text' && (
                <div className="biz-form" style={{ marginTop: 10 }}>
                  <label className="dash-field">
                    <span className="dash-field__label">Header text ({f.header.text.length}/60)</span>
                    <input value={f.header.text} maxLength={60} onChange={(e) => set({ header: { ...f.header, text: e.target.value } })} placeholder="Your cart is waiting" />
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
                  <label className={`wa-upload${f.header.mediaUrl ? ' is-done' : ''}`}>
                    <Icon name="download" /> {uploading ? 'Uploading…' : f.header.mediaUrl ? 'Sample uploaded ✓ (change)' : `Upload a sample ${f.header.type === 'document' ? 'PDF' : f.header.type === 'image' ? 'picture' : 'video'}`}
                    <input type="file" hidden accept={f.header.type === 'image' ? 'image/jpeg,image/png' : f.header.type === 'video' ? 'video/mp4' : 'application/pdf'} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={uploading} />
                  </label>
                  <span className="dash-field__hint" style={{ display: 'block', marginTop: 6 }}>
                    Meta checks the sample. Each broadcast can use its own {f.header.type === 'document' ? 'PDF' : f.header.type}.
                  </span>
                  {err('headerMedia')}
                </div>
              )}
            </section>

            <section className="biz-section">
              <div className="biz-section__head">
                <span className="dash-field__label">
                  Message <span className="dash-muted">{f.body.text.length} / 1024 · *bold* _italic_</span>
                </span>
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
                <span className="wa-emoji">
                  <button type="button" onClick={() => setEmoji((v) => !v)} title="Emoji" aria-expanded={emoji}>
                    😊
                  </button>
                  {emoji && (
                    <span className="wa-emoji__pop" role="listbox" aria-label="Emoji">
                      {EMOJI.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            insert(e, '');
                            setEmoji(false);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                <button type="button" onClick={() => insert(`{{${(bodyVars.at(-1) || 0) + 1}}}`, '')} className="wa-toolbar__var">
                  + Variable
                </button>
              </div>
              <textarea ref={bodyRef} className="dash-textarea" rows={6} maxLength={1024} value={f.body.text} onChange={(e) => set({ body: { ...f.body, text: e.target.value } })} placeholder={'Hi {{1}}, you left *{{2}}* in your cart. 🛒\n\nYour items are saved. Complete your order in one tap before they sell out.'} />
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
                          placeholder={n === 1 ? 'Ravi' : n === 2 ? 'Kitchadi Ponni 26 kg and 1 more' : 'example'}
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
                <input value={f.footer.text} maxLength={60} onChange={(e) => set({ footer: { text: e.target.value } })} placeholder="Reply STOP to opt out" />
                {err('footer')}
              </label>
            </section>

            <section className="biz-section">
              <div className="biz-section__head">
                <span className="dash-field__label">Buttons (optional)</span>
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
                  {b.type === 'url' && <input value={b.url || ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="https://www.cholanrice.in/checkout" aria-label="Link" className="wa-grow" />}
                  {b.type === 'url' && variablesIn(b.url).length > 0 && <input value={b.example || ''} onChange={(e) => setButton(i, { example: e.target.value })} placeholder="Example end of link" aria-label="Example" />}
                  {b.type === 'phone' && <input value={b.phone || ''} onChange={(e) => setButton(i, { phone: e.target.value })} placeholder="+919092266667" aria-label="Phone number" />}
                  {b.type === 'copy_code' && <input value={b.example || ''} maxLength={15} onChange={(e) => setButton(i, { example: e.target.value })} placeholder="Example code, e.g. RICE10" aria-label="Example code" />}
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
                    <button key={k} type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => set({ buttons: [...f.buttons, { type: k, text: k === 'quick_reply' ? 'Yes, interested' : k === 'url' ? 'Complete my order' : k === 'phone' ? 'Call us' : '', url: '', phone: k === 'phone' ? '+919092266667' : '' }] })}>
                      + {l}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {problem && <div className="dash-error">{problem.message}</div>}
        {note && <div className="dash-flash dash-flash--good">{note}</div>}
        <div className="wa-tpl__actions">
          {!rejected && (
            <button type="button" className="dash-btn dash-btn--ghost" disabled={Boolean(busy)} onClick={() => act('draft')}>
              {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
          )}
          <button type="button" className="dash-btn" disabled={Boolean(busy) || !status?.connection?.ready} onClick={() => act('submit')} title={status?.connection?.ready ? '' : 'Connect WhatsApp first; you can save it as a draft meanwhile.'}>
            {busy === 'submit' ? 'Sending…' : rejected ? 'Send to Meta again' : 'Send to Meta for approval'}
          </button>
          {record?.status === 'DRAFT' && (
            <button type="button" className="dash-link" onClick={removeDraft}>
              Delete draft
            </button>
          )}
          {onCancel && (
            <button type="button" className="dash-link" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </section>
      <div className="wa-tpl__phone">
        <PhonePreview components={componentsFromForm(f)} values={{ header: f.header.example, headerLink: f.header.previewUrl || f.header.mediaUrl, body: f.body.examples }} />
        <p className="dash-muted dash-small" style={{ textAlign: 'center' }}>
          Live preview with your examples
        </p>
      </div>
    </>
  );
}

// The ready-made templates: open one in the editor, or send all to Meta.
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
      <p className="dash-muted dash-small">Written for Cholan Rice and checked against Meta’s rules. Open one to change the words, then save it as a draft or send it to Meta.</p>
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
