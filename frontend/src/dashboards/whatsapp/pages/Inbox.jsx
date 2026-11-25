import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDash } from '../../shared/context.js';
import { Badge, Empty, ErrorNote, Icon, Loading, PageHead, ago, useLoad } from '../../shared/ui.jsx';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { showNumber, wa } from '../api.js';
import { ValueMapper, slotsOf } from '../shared.jsx';
import { ConsentBadge } from './Contacts.jsx';

// The inbox: messages people send to the WhatsApp number, and the replies.
// WhatsApp allows free replies for 24 hours after a person's last message;
// after that only a template can be sent. Refreshes every 15 seconds.
const TICKS = { sent: '✓', delivered: '✓✓', read: '✓✓', failed: '!' };
const VIEWS = [
  ['', 'All chats'],
  ['broadcast', 'Broadcasts'],
  ['bulk', 'Bulk messages'],
];
// How one broadcast or bulk message did for one person.
function CampaignMark({ c }) {
  if (!c) return null;
  if (c.replied) return <Badge tone="good">Replied</Badge>;
  if (c.delivery === 'failed' || c.status === 'failed') return <Badge tone="bad">Failed</Badge>;
  if (c.delivery === 'read') return <Badge tone="info">Read</Badge>;
  if (c.delivery === 'delivered') return <Badge tone="neutral">Delivered</Badge>;
  if (c.status === 'skipped') return <Badge tone="muted">Skipped</Badge>;
  if (['queued', 'sending'].includes(c.status)) return <Badge tone="warn">Waiting</Badge>;
  if (c.status === 'cancelled') return <Badge tone="muted">Cancelled</Badge>;
  return <Badge tone="neutral">Sent</Badge>;
}
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const IST = { timeZone: 'Asia/Kolkata' };
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', IST);
// "Today", "Yesterday", or the date, for the line between days.
function dayLabel(iso) {
  const key = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-IN', { ...IST, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' });
// Who sent a message, as a label and a colour: the customer, or on our side the
// bot, an automatic reply, a broadcast or bulk message, an automation, or a person.
function senderOf(m, contactName) {
  if (m.direction === 'in') return { label: contactName || 'Customer', tone: 'customer' };
  if (m.by === 'bot') return { label: 'Bot', tone: 'bot' };
  if (m.by === 'auto') return { label: 'Auto reply', tone: 'auto' };
  if (m.campaignId) return { label: 'Broadcast', tone: 'auto' };
  if (m.automationId) return { label: 'Automation', tone: 'auto' };
  if (m.by && String(m.by).includes('@')) return { label: String(m.by).split('@')[0], tone: 'staff' };
  return { label: 'You', tone: 'staff' };
}

export default function Inbox() {
  const { get, patch } = useUrl();
  // The toggle: all chats, or only the people one broadcast or bulk message went to.
  const view = VIEWS.some(([k]) => k && k === get('view')) ? get('view') : '';
  const campaigns = useLoad(() => (view ? wa.campaigns() : Promise.resolve(null)), [view]);
  const ofKind = (campaigns.data?.campaigns || []).filter((c) => (c.kind || 'broadcast') === view && !['draft', 'scheduled'].includes(c.status));
  const campaignId = view ? get('campaign') || ofKind[0]?.id || '' : '';
  const campaign = ofKind.find((c) => c.id === campaignId);
  const repliedOnly = Boolean(get('replied'));
  const list = useLoad(() => (view && !campaignId ? Promise.resolve({ conversations: [] }) : wa.inbox(campaignId)), [view, campaignId]);
  const [q, setQ, search] = useUrlSearch();
  const chat = get('chat');
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && list.reload(), 15_000);
    return () => clearInterval(t);
  }, [list.reload]);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (list.data?.conversations || []).filter((c) => (!repliedOnly || c.campaign?.replied) && (!s || `${c.name} ${c.id} ${c.lastMessageText}`.toLowerCase().includes(s)));
  }, [list.data, search, repliedOnly]);

  return (
    <div className="dash-page wa-inbox-page">
      <PageHead title="Inbox" intro="Messages people send to your WhatsApp number. Reply freely within 24 hours of their last message; after that, send a template." range={false} />
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      <div className="wa-inbox-bar">
        <div className="dash-seg" role="group" aria-label="Show">
          {VIEWS.map(([k, label]) => (
            <button key={k || 'all'} type="button" className={view === k ? 'is-on' : ''} onClick={() => patch({ view: k, campaign: '', chat: '', replied: '' })}>
              {label}
            </button>
          ))}
        </div>
        {view && ofKind.length > 0 && (
          <>
            <select value={campaignId} onChange={(e) => patch({ campaign: e.target.value, chat: '' })} aria-label={view === 'bulk' ? 'Bulk message' : 'Broadcast'} className="wa-inbox-bar__pick">
              {ofKind.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {shortDate(c.startedAt || c.createdAt)} · {c.counts?.total || 0} people
                </option>
              ))}
            </select>
            <label className="dash-check">
              <input type="checkbox" checked={repliedOnly} onChange={(e) => patch({ replied: e.target.checked ? 1 : '' }, { replace: true })} /> Replied only
            </label>
          </>
        )}
      </div>
      {view && campaigns.data && !ofKind.length && <p className="dash-muted">{view === 'bulk' ? 'No bulk messages sent yet.' : 'No broadcasts sent yet.'}</p>}
      {campaign && (
        <div className="wa-inbox-summary">
          <strong>{campaign.name}</strong>
          <span>{campaign.template?.name}</span>
          <span>{campaign.counts?.total || 0} people</span>
          <span>{campaign.counts?.delivered || 0} delivered</span>
          <span>{campaign.counts?.read || 0} read</span>
          <span className="is-good">{campaign.counts?.replied || 0} replied</span>
          {campaign.counts?.failed > 0 && <span className="is-bad">{campaign.counts.failed} failed</span>}
          <Link to={`/whatsapp/campaigns?campaign=${campaign.id}`} className="dash-link">
            Full report
          </Link>
        </div>
      )}
      <div className={`wa-inbox${chat ? ' has-chat' : ''}`}>
        <aside className="wa-convos">
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Search chats…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {list.loading && !list.data && <Loading />}
          {list.data && !rows.length && <p className="dash-muted dash-small">{search ? 'No chat matches.' : repliedOnly ? 'Nobody has replied to this one yet.' : view ? 'Choose a broadcast or bulk message above.' : 'No messages yet. When someone writes to your WhatsApp number, it shows here.'}</p>}
          <ul>
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" className={`wa-convo${chat === c.id ? ' is-on' : ''}${c.unread ? ' is-unread' : ''}`} onClick={() => patch({ chat: c.id })}>
                  <span className="wa-convo__avatar">{(c.name || '#')[0].toUpperCase()}</span>
                  <span className="wa-convo__text">
                    <strong>
                      {c.name || showNumber(c.id)} {c.needsHuman && <span className="wa-human">Needs a person</span>}
                    </strong>
                    <span className="wa-clip">
                      {c.lastDirection === 'out' ? 'Reply: ' : ''}
                      {c.lastMessageText}
                    </span>
                  </span>
                  <span className="wa-convo__meta">
                    {c.campaign ? <CampaignMark c={c.campaign} /> : null}
                    <small>{ago(c.lastMessageAt)}</small>
                    {c.unread > 0 && <span className="dash-nav__count">{c.unread}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="wa-thread">
          {chat ? (
            <Thread key={chat} id={chat} onBack={() => patch({ chat: '' })} onChanged={list.reload} />
          ) : (
            <Empty icon="chat" title="Choose a chat">
              Messages and replies show here.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({ id, onBack, onChanged }) {
  const { allowed } = useDash();
  const c = useLoad(() => wa.conversation(id), [id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [useTemplate, setUseTemplate] = useState(false);
  const body = useRef(null);
  const d = c.data;
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && c.reload(), 15_000);
    return () => clearInterval(t);
  }, [c.reload]);
  useEffect(() => {
    if (d?.contact?.unread && allowed('editor')) wa.markRead(id).then(onChanged).catch(() => {});
  }, [d?.contact?.unread, id, allowed, onChanged]);
  // The newest message in view when the chat opens or a message arrives. Only the
  // message area scrolls (scrollIntoView would scroll the page and the chat list too).
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [d?.messages?.length]);

  const send = async (body) => {
    setBusy(true);
    setProblem(null);
    try {
      await wa.reply(id, body);
      setText('');
      setUseTemplate(false);
      c.reload();
      onChanged();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  if (!d) return c.error ? <ErrorNote error={c.error} /> : <Loading />;
  const contact = d.contact;
  const open = d.windowOpen;
  return (
    <>
      <header className="wa-thread__head">
        <button type="button" className="dash-icon-btn wa-back" onClick={onBack} aria-label="Back to chats">
          <Icon name="back" />
        </button>
        <span className="wa-convo__avatar">{(contact.name || '#')[0].toUpperCase()}</span>
        <span>
          <strong>{contact.name || showNumber(id)}</strong>
          <small className="dash-muted dash-block">
            {showNumber(id)} · <ConsentBadge c={contact} /> {contact.needsHuman && <span className="wa-human">Asked for a person</span>}
          </small>
        </span>
        <Link className="dash-link" to={`/whatsapp/contacts?contact=${id}`} style={{ marginLeft: 'auto' }}>
          Contact
        </Link>
      </header>
      <div className="wa-thread__legend" aria-hidden="true">
        {[
          ['customer', 'Customer (left)'],
          ['bot', 'Bot'],
          ['staff', 'Staff reply'],
          ['auto', 'Automatic / broadcast'],
        ].map(([tone, label]) => (
          <span key={tone}>
            <i className={`wa-dot wa-dot--${tone}`} /> {label}
          </span>
        ))}
      </div>
      <div className="wa-thread__body" ref={body}>
        {!d.messages.length && <p className="wa-thread__none">No messages in this chat yet.</p>}
        {d.messages.map((m, i) => {
          const prev = d.messages[i - 1];
          const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
          const who = senderOf(m, contact.name);
          const prevWho = prev && senderOf(prev, contact.name);
          // The sender's name on the first message of each run from them.
          const showWho = newDay || !prevWho || prevWho.label !== who.label || prev.direction !== m.direction;
          return (
            <div key={m.id} className="wa-msg-row-wrap">
              {newDay && (
                <div className="wa-day" role="separator">
                  <span>{dayLabel(m.at)}</span>
                </div>
              )}
              <div className={`wa-msg-row wa-msg-row--${m.direction}${showWho ? ' is-first' : ''}`}>
                <div className={`wa-msg wa-msg--${m.direction} wa-msg--${who.tone}`}>
                  {showWho && <span className={`wa-msg__who wa-msg__who--${who.tone}`}>{who.label}</span>}
                  {m.kind === 'template' && <span className="wa-msg__tag">Template: {m.template?.name}</span>}
                  {m.kind === 'menu' && <span className="wa-msg__tag">Menu with buttons</span>}
                  {m.kind === 'interactive' && m.direction === 'in' && <span className="wa-msg__tag">Tapped a button</span>}
                  {m.media && <span className="wa-msg__tag">[{m.media.kind}{m.media.filename ? `: ${m.media.filename}` : ''}]</span>}
                  <p>{m.text || (m.media ? '' : `[${m.kind}]`)}</p>
                  <span className="wa-msg__meta">
                    {clock(m.at)}
                    {m.direction === 'out' && <span className={`wa-tick wa-tick--${m.status}`} title={m.status}> {TICKS[m.status] || ''}</span>}
                  </span>
                  {m.status === 'failed' && <span className="wa-msg__error">{m.error}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {allowed('editor') && (
        <footer className="wa-thread__compose">
          {open && !useTemplate ? (
            <form
              className="wa-compose"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) send({ text });
              }}
            >
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a reply"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim()) send({ text });
                  }
                }}
                aria-label="Reply"
              />
              <button type="submit" className="dash-btn" disabled={busy || !text.trim()}>
                {busy ? '…' : 'Send'}
              </button>
              <button type="button" className="dash-link dash-small" onClick={() => setUseTemplate(true)}>
                Use a template
              </button>
            </form>
          ) : (
            <TemplateReply onSend={send} busy={busy} closed={!open} onCancel={open ? () => setUseTemplate(false) : null} contact={contact} />
          )}
          {open && d.windowEndsAt && <p className="dash-muted dash-small">Free replies until {new Date(d.windowEndsAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</p>}
          {problem && <div className="dash-error">{problem.message}</div>}
        </footer>
      )}
    </>
  );
}

function TemplateReply({ onSend, busy, closed, onCancel, contact }) {
  const templates = useLoad(() => wa.templates(), []);
  const [pick, setPick] = useState('');
  const [mapping, setMapping] = useState({});
  const approved = (templates.data?.templates || []).filter((t) => t.status === 'APPROVED' && t.category !== 'AUTHENTICATION');
  const t = approved.find((x) => x.id === pick);
  return (
    <div className="wa-template-reply">
      {closed && <p className="dash-small biz-warn">It’s been more than 24 hours since {contact.name || 'they'} last wrote, so WhatsApp only allows a template.</p>}
      <div className="dash-row">
        <select value={pick} onChange={(e) => (setPick(e.target.value), setMapping({}))} aria-label="Template">
          <option value="">Choose a template…</option>
          {approved.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.language})
            </option>
          ))}
        </select>
        <button type="button" className="dash-btn" disabled={busy || !t} onClick={() => onSend({ template: { name: t.name, language: t.language }, mapping })}>
          {busy ? 'Sending…' : 'Send template'}
        </button>
        {onCancel && (
          <button type="button" className="dash-link dash-small" onClick={onCancel}>
            Type instead
          </button>
        )}
      </div>
      {t && (slotsOf(t).body > 0 || slotsOf(t).header || slotsOf(t).buttons.length > 0) && <ValueMapper template={t} mapping={mapping} onChange={setMapping} />}
    </div>
  );
}
