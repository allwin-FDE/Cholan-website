import { Link } from 'react-router-dom';
import { BarList, Card, ErrorNote, Loading, PageHead, Stat, useLoad } from '../../shared/ui.jsx';
import { useUrl } from '../../shared/urlState.js';
import { wa } from '../api.js';
import { pct, useWa } from '../shared.jsx';

// The WhatsApp overview: messages sent and how many arrived and were read,
// replies, failures and why, the contact list, and the number's health.
const QUALITY = { GREEN: ['High', 'good'], YELLOW: ['Medium', 'warn'], RED: ['Low', 'bad'], UNKNOWN: ['Not rated yet', 'muted'] };
const TIER = { TIER_50: '50', TIER_250: '250', TIER_1K: '1,000', TIER_10K: '10,000', TIER_100K: '100,000', TIER_UNLIMITED: 'Unlimited' };

function DayBars({ days }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.sent, d.received)));
  if (!days.length) return <p className="dash-muted">No messages in this period.</p>;
  return (
    <div className="wa-days" role="img" aria-label="Messages per day">
      {days.map((d) => (
        <div key={d.date} className="wa-day" title={`${d.date}: ${d.sent} sent, ${d.received} received`}>
          <span className="wa-day__bar wa-day__bar--out" style={{ height: `${(d.sent / max) * 100}%` }} />
          <span className="wa-day__bar wa-day__bar--in" style={{ height: `${(d.received / max) * 100}%` }} />
          <small>{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { status } = useWa();
  const { get, patch } = useUrl();
  const days = Number(get('days', '30')) || 30;
  const o = useLoad(() => wa.overview(days), [days]);
  const d = o.data;
  const phone = status?.phone;
  const q = QUALITY[phone?.quality_rating] || null;

  return (
    <div className="dash-page">
      <PageHead
        title="WhatsApp"
        intro="How your WhatsApp messages are doing: sent, delivered, read and replied."
        range={false}
        actions={
          <div className="dash-seg" role="group" aria-label="Period">
            {[7, 30, 90].map((n) => (
              <button key={n} type="button" className={days === n ? 'is-on' : ''} onClick={() => patch({ days: n === 30 ? '' : n }, { replace: true })}>
                {n} days
              </button>
            ))}
          </div>
        }
      />
      {phone && (
        <div className="wa-number">
          <strong>{phone.verified_name}</strong> <span className="dash-muted">{phone.display_phone_number}</span>
          {q && (
            <span className={`dash-badge dash-badge--${q[1]}`} title="Meta’s rating, from how people react to your messages">
              Quality: {q[0]}
            </span>
          )}
          {phone.messaging_limit_tier && <span className="dash-muted dash-small">Up to {TIER[phone.messaging_limit_tier] || phone.messaging_limit_tier} new people a day</span>}
        </div>
      )}
      {o.error && <ErrorNote error={o.error} onRetry={o.reload} />}
      {o.loading && !d && <Loading />}
      {d && (
        <>
          <div className="dash-stats">
            <Stat label="Sent" value={String(d.sent)} sub={`last ${d.days} days`} />
            <Stat label="Delivered" value={pct(d.delivered, d.sent)} sub={`${d.delivered} messages`} />
            <Stat label="Read" value={pct(d.read, d.delivered)} sub="of those delivered" />
            <Stat label="Failed" value={String(d.failed)} sub={d.failed ? pct(d.failed, d.sent) : ''} />
          </div>
          <div className="dash-stats">
            <Stat label="Messages received" value={String(d.received)} />
            <Stat label="People who wrote" value={String(d.conversations)} />
            <Stat label="Contacts" value={String(d.contacts.total)} sub={`${d.contacts.consent} can get offers`} />
            <Stat label="Unread chats" value={String(d.contacts.unread)} sub={d.contacts.unread ? <Link to="/whatsapp/inbox">Open the inbox</Link> : ''} />
          </div>
          <Card title="Messages per day" hint="Green: sent. Grey: received.">
            <DayBars days={d.perDay} />
          </Card>
          <div className="plant-grid">
            <Card title="Why messages failed">
              <BarList items={d.errors} empty="Nothing failed." />
            </Card>
            <Card title="Get started">
              <ol className="wa-start">
                <li className={status?.connection?.ready ? 'is-done' : ''}>
                  <Link to="/whatsapp/connection">Connect your WhatsApp number</Link>
                </li>
                <li className={d.contacts.total ? 'is-done' : ''}>
                  <Link to="/whatsapp/contacts?import=1">Add or import contacts</Link>
                </li>
                <li>
                  <Link to="/whatsapp/templates?new=1">Make a template and get it approved</Link>
                </li>
                <li className={d.sent ? 'is-done' : ''}>
                  <Link to="/whatsapp/campaigns?new=1">Send your first campaign</Link>
                </li>
                <li>
                  <Link to="/whatsapp/automations">Set up order updates and keyword replies</Link>
                </li>
              </ol>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
