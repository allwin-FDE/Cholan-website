import { Empty, PageHead } from '../../shared/ui.jsx';

// Shown while the business database is not connected to this server.
export default function NotConnected({ title }) {
  return (
    <div className="dash-page">
      <PageHead title={title} range={false} />
      <Empty icon="box" title="The business database isn’t connected yet">
        These pages go live once the database is switched on for the website.
      </Empty>
    </div>
  );
}
