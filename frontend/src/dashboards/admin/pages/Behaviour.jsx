import { api } from '../../shared/api.js';
import { useDash } from '../../shared/context.js';
import { BarList, Card, Empty, ErrorNote, HourChart, Loading, PageHead, Stat, num, pageName, useLoad } from '../../shared/ui.jsx';

// How people use the site: when they come, how long they stay, how many pages
// they open, what they press, and where they arrive and leave.
export default function Behaviour() {
  const { days } = useDash();
  const { data, loading, error, reload } = useLoad(() => api.behaviour(days), [days]);
  const t = data?.totals;
  const pct = (n) => (t?.visits ? `${Math.round((n / t.visits) * 100)}% of visits` : '');

  return (
    <div className="dash-page">
      <PageHead title="Behaviour" intro="When people visit, how long they stay and what they do" />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && !t.visits && <Empty icon="bolt" title="No visits in this period">Pick a longer period.</Empty>}
      {data && t.visits > 0 && (
        <>
          <div className="dash-stats">
            <Stat label="Visits" value={num(t.visits)} icon="users" />
            <Stat label="New" value={num(t.newVisits)} sub={pct(t.newVisits)} icon="user" />
            <Stat label="Returning" value={num(t.returningVisits)} sub={pct(t.returningVisits)} icon="refresh" />
            <Stat label="Contacted the shop" value={num(t.contacted)} sub={pct(t.contacted)} icon="phone" />
            <Stat label="Clicks" value={num(t.clicks)} sub={`${(t.clicks / t.visits).toFixed(1)} per visit`} icon="click" />
          </div>
          <div className="dash-grid dash-grid--2">
            <Card title="Time of day" hint="Visits by the hour they started, India time">
              <HourChart hours={data.hours} />
            </Card>
            <Card title="Day of the week">
              <BarList items={data.weekdays} max={7} />
            </Card>
            <Card title="Time on site">
              <BarList items={data.timeOnSite} max={6} />
            </Card>
            <Card title="Pages per visit">
              <BarList items={data.pagesPerVisit} max={5} />
            </Card>
            <Card title="What they pressed" hint="Calls, WhatsApp, enquiries, chat and more">
              <BarList items={data.actions} labelOf={(a) => a.label} empty="No actions in this period." />
            </Card>
            <Card title="Most clicked" hint="Buttons and links, across the site">
              <BarList items={data.clicked} empty="No clicks in this period." />
            </Card>
            <Card title="Where they arrive">
              <BarList items={data.entries} labelOf={(i) => pageName(i.name)} />
            </Card>
            <Card title="Where they leave">
              <BarList items={data.exits} labelOf={(i) => pageName(i.name)} />
            </Card>
            <Card title="Devices">
              <BarList items={data.devices} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
