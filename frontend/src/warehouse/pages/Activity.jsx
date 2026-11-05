import { Link } from 'react-router-dom';
import { Card, ErrorNote, Loading, when } from '../../dashboard/ui.jsx';
import { WhHead, useLive, wh } from '../shared.jsx';

export default function Activity() {
  const { data, error, reload } = useLive(() => wh.get('/activity'));
  return (
    <div className="dash-page">
      <WhHead title="Activity" intro="Everything done in the warehouse, and who did it." />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Order</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a) => (
                  <tr key={a.id}>
                    <td>{when(a.at)}</td>
                    <td>{a.by}</td>
                    <td>{a.action}</td>
                    <td>{a.orderId && <Link to={`/warehouse/orders/${a.orderId}`}>{a.orderNumber}</Link>}</td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.activity.length && <p className="dash-muted">Nothing yet.</p>}
        </Card>
      )}
    </div>
  );
}
