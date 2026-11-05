import { Link } from 'react-router-dom';
import { Badge, Card, ErrorNote, Icon, Loading, Stat, num } from '../../dashboard/ui.jsx';
import { WhHead, rupees, useLive, useWh, wh } from '../shared.jsx';

const TASKS = [
  ['new', 'To confirm', 'Waiting for someone to confirm them'],
  ['confirmed', 'To pack', 'Confirmed; packing not started'],
  ['packing', 'Being packed', ''],
  ['packed', 'To dispatch', 'Packed and ready to leave'],
  ['dispatched', 'On the way', 'Waiting to be marked delivered'],
];

export default function Today() {
  const { user, seesMoney } = useWh();
  const { data, error, reload } = useLive(() => wh.get('/summary'));

  return (
    <div className="dash-page">
      <WhHead
        title={`Hello, ${user.name.split(' ')[0]}`}
        intro="What needs doing in the warehouse."
        actions={
          <Link to="/warehouse/orders/new" className="dash-btn">
            <Icon name="plus" /> New order
          </Link>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="wh-tasks">
            {TASKS.map(([key, label, hint]) => (
              <Link key={key} to={`/warehouse/orders?step=${key}`} className={`wh-task${data.counts[key] ? ' has-work' : ''}`}>
                <strong>{num(data.counts[key] || 0)}</strong>
                <span>{label}</span>
                {hint && <small>{hint}</small>}
              </Link>
            ))}
          </div>
          {seesMoney && (
            <div className="dash-grid dash-grid--2 wh-gap">
              <Stat icon="star" label="Orders today" value={rupees(data.todaySalesPaise)} sub="Value of orders taken today" />
              <Stat icon="inbox" label="Money due" value={rupees(data.duePaise)} sub="Still to be paid on open orders" />
            </div>
          )}
          <Card title="Low stock" hint="Bags available, after what is reserved for orders, at or below the low level." className="wh-gap">
            {data.low.length ? (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Size</th>
                      <th>Available</th>
                      <th>Low level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.low.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.pack}</td>
                        <td>
                          <Badge tone={item.onHand - item.reserved <= 0 ? 'warn' : 'info'}>{num(item.onHand - item.reserved)}</Badge>
                        </td>
                        <td>{num(item.low)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="dash-muted">Nothing is low.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
