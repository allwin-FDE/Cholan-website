import { BarList, Card, ErrorNote, Icon, Loading, PageHead, Stat, downloadCsv, useLoad } from '../../shared/ui.jsx';
import { useUrl } from '../../shared/urlState.js';
import { wa } from '../api.js';
import { pct } from '../shared.jsx';

// Reports for any period: messages per day, how each template, broadcast and
// automation did, the bot, why messages failed, new contacts and opt-outs,
// and the hours people write. Each table downloads as a spreadsheet.
const ist = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
const PRESETS = [
  ['7 days', 6],
  ['30 days', 29],
  ['90 days', 89],
];

function Table({ title, rows, columns, file, empty = 'Nothing in this period.' }) {
  return (
    <Card
      title={title}
      action={
        rows.length > 0 && (
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => downloadCsv(file, [columns.map((c) => c[1]), ...rows.map((r) => columns.map((c) => (c[2] ? c[2](r) : r[c[0]] ?? '')))])}>
            <Icon name="download" /> CSV
          </button>
        )
      }
    >
      {rows.length ? (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th key={c[0]} className={i ? 'dash-num' : ''}>
                    {c[1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j}>
                  {columns.map((c, i) => (
                    <td key={c[0]} className={i ? 'dash-num' : ''}>
                      {c[2] ? c[2](r) : r[c[0]] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dash-muted">{empty}</p>
      )}
    </Card>
  );
}

const TALLY = [
  ['sent', 'Sent'],
  ['delivered', 'Delivered'],
  ['read', 'Read'],
  ['replied', 'Replied'],
  ['failed', 'Failed'],
  ['readRate', 'Read rate', (r) => pct(r.read, r.delivered)],
];

export default function Reports() {
  const { get, patch } = useUrl();
  const from = get('from', ist(29));
  const to = get('to', ist(0));
  const r = useLoad(() => wa.reports(from, to), [from, to]);
  const d = r.data;
  const everything = () =>
    downloadCsv(`whatsapp-report-${from}-to-${to}.csv`, [
      ['Section', 'Name', 'Sent', 'Delivered', 'Read', 'Replied', 'Failed', 'Received'],
      ...d.days.map((x) => ['Day', x.date, x.sent, x.delivered, x.read, x.replied, x.failed, x.received]),
      ...d.templates.map((x) => ['Template', x.name, x.sent, x.delivered, x.read, x.replied, x.failed, '']),
      ...d.campaigns.map((x) => [x.kind === 'bulk' ? 'Bulk message' : 'Broadcast', x.name, x.sent, x.delivered, x.read, x.replied, x.failed, '']),
      ...d.automations.map((x) => ['Automation', x.name, x.sent, x.delivered, x.read, x.replied, x.failed, '']),
      ['Bot', 'All bot messages', d.bot.sent, d.bot.delivered, d.bot.read, '', d.bot.failed, ''],
      ...d.errors.map((x) => ['Failure', x.name, '', '', '', '', x.value, '']),
    ]);
  const maxHour = Math.max(1, ...(d?.hours || []).map((h) => h.received));

  return (
    <div className="dash-page">
      <PageHead
        title="Reports"
        intro="How your WhatsApp messages did in any period, with spreadsheets to download."
        range={false}
        actions={
          <div className="dash-row biz-actions">
            <div className="dash-seg" role="group" aria-label="Period">
              {PRESETS.map(([label, n]) => (
                <button key={label} type="button" className={from === ist(n) && to === ist(0) ? 'is-on' : ''} onClick={() => patch({ from: ist(n), to: ist(0) }, { replace: true })}>
                  {label}
                </button>
              ))}
            </div>
            <input type="date" value={from} max={to} onChange={(e) => patch({ from: e.target.value }, { replace: true })} aria-label="From" />
            <input type="date" value={to} min={from} max={ist(0)} onChange={(e) => patch({ to: e.target.value }, { replace: true })} aria-label="To" />
            {d && (
              <button type="button" className="dash-btn" onClick={everything}>
                <Icon name="download" /> Download everything
              </button>
            )}
          </div>
        }
      />
      {r.error && <ErrorNote error={r.error} onRetry={r.reload} />}
      {r.loading && !d && <Loading />}
      {d && (
        <>
          <div className="dash-stats">
            <Stat label="Sent" value={String(d.totals.sent)} />
            <Stat label="Delivered" value={pct(d.totals.delivered, d.totals.sent)} sub={`${d.totals.delivered} messages`} />
            <Stat label="Read" value={pct(d.totals.read, d.totals.delivered)} sub="of those delivered" />
            <Stat label="Failed" value={String(d.totals.failed)} />
          </div>
          <div className="dash-stats">
            <Stat label="Messages received" value={String(d.totals.received)} sub={`from ${d.totals.people} people`} />
            <Stat label="Replies to broadcasts" value={String(d.totals.replied)} />
            <Stat label="New contacts" value={String(d.totals.newContacts)} />
            <Stat label="Opted out" value={String(d.totals.optedOut)} />
          </div>
          <Table title="Each day" file={`whatsapp-days-${from}-to-${to}.csv`} rows={d.days} columns={[['date', 'Day'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed'], ['received', 'Received']]} />
          <Table title="Templates" file={`whatsapp-templates-${from}-to-${to}.csv`} rows={d.templates} columns={[['name', 'Template'], ...TALLY]} />
          <Table
            title="Broadcasts and bulk messages"
            file={`whatsapp-broadcasts-${from}-to-${to}.csv`}
            rows={d.campaigns}
            columns={[['name', 'Name', (x) => `${x.name}${x.kind === 'bulk' ? ' (bulk)' : ''}`], ['total', 'People'], ...TALLY]}
          />
          <div className="plant-grid">
            <Table title="Automations" file={`whatsapp-automations-${from}-to-${to}.csv`} rows={d.automations} columns={[['name', 'Automation'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed']]} />
            <Card title="Bot">
              <dl className="dash-facts">
                <div>
                  <dt>Messages it sent</dt>
                  <dd>{d.bot.sent}</dd>
                </div>
                <div>
                  <dt>Delivered</dt>
                  <dd>{pct(d.bot.delivered, d.bot.sent)}</dd>
                </div>
                <div>
                  <dt>Read</dt>
                  <dd>{pct(d.bot.read, d.bot.delivered)}</dd>
                </div>
              </dl>
            </Card>
          </div>
          <div className="plant-grid">
            <Card title="Why messages failed">
              <BarList items={d.errors} empty="Nothing failed." />
            </Card>
            <Card title="When people write (India time)">
              <div className="wa-hours" role="img" aria-label="Messages received by hour">
                {d.hours.map((h) => (
                  <div key={h.hour} className="wa-hour" title={`${h.hour}:00: ${h.received}`}>
                    <span style={{ height: `${(h.received / maxHour) * 100}%` }} />
                    <small>{h.hour % 3 === 0 ? `${h.hour % 12 || 12}${h.hour < 12 ? 'a' : 'p'}` : ''}</small>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
