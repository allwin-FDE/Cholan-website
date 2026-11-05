import { useState } from 'react';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, dateOnly, useLoad } from '../../dashboard/ui.jsx';
import { Field, WhHead, wh } from '../shared.jsx';

const LEVELS = {
  staff: { label: 'Staff', can: 'Orders, packing and receiving stock. No prices, payments or invoices.' },
  manager: { label: 'Manager', can: 'Everything staff can do, plus prices, payments, invoices, reports, cancelling orders and correcting stock.' },
};

export default function Team() {
  const { data, error, reload } = useLoad(() => wh.get('/team'), []);
  const [panel, setPanel] = useState(null); // 'add' | { password: worker }
  const [problem, setProblem] = useState('');

  const changeLevel = async (worker, level) => {
    setProblem('');
    try {
      await wh.patch(`/team/${encodeURIComponent(worker.email)}`, { level });
      reload();
    } catch (e) {
      setProblem(e.message);
    }
  };
  const remove = async (worker) => {
    if (!window.confirm(`Remove ${worker.name}? They will be signed out and cannot sign in again. Their name stays on what they did.`)) return;
    setProblem('');
    try {
      await wh.del(`/team/${encodeURIComponent(worker.email)}`);
      reload();
    } catch (e) {
      setProblem(e.message);
    }
  };

  return (
    <div className="dash-page">
      <WhHead
        title="Team"
        intro="Each person has their own login, so every action shows who did it."
        actions={
          <button type="button" className="dash-btn" onClick={() => setPanel('add')}>
            <Icon name="plus" /> Add worker
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {problem && (
        <div className="dash-flash dash-flash--bad" role="alert">
          {problem}
        </div>
      )}
      {!data && !error && <Loading />}
      {data && !data.team.length && (
        <Empty icon="users" title="No workers yet">
          Add the people who work in the warehouse. Dashboard admins already have access.
        </Empty>
      )}
      {data && data.team.length > 0 && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Level</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.team.map((worker) => (
                  <tr key={worker.email}>
                    <td>{worker.name}</td>
                    <td>
                      <Badge tone="neutral">{worker.username}</Badge>
                    </td>
                    <td>
                      <select aria-label={`Level for ${worker.name}`} value={worker.level} onChange={(e) => changeLevel(worker, e.target.value)}>
                        {Object.entries(LEVELS).map(([key, l]) => (
                          <option key={key} value={key}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{dateOnly(worker.addedAt)}</td>
                    <td className="wh-stock__do">
                      <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setPanel({ password: worker })}>
                        Reset password
                      </button>
                      <button type="button" className="dash-btn dash-btn--danger dash-btn--sm" onClick={() => remove(worker)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title="What each level can do" className="wh-gap">
        {Object.values(LEVELS).map((l) => (
          <p key={l.label}>
            <strong>{l.label}:</strong> {l.can}
          </p>
        ))}
        <p>
          <strong>Admin:</strong> dashboard admins and owners. Everything, plus adding and removing workers.
        </p>
      </Card>
      {panel === 'add' && (
        <AddWorker
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            reload();
          }}
        />
      )}
      {panel?.password && (
        <ResetPassword
          worker={panel.password}
          onClose={() => setPanel(null)}
          onDone={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function AddWorker({ onClose, onDone }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', level: 'staff' });
  const [fields, setFields] = useState({});
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    setFields({});
    try {
      await wh.post('/team', form);
      onDone();
    } catch (error) {
      setProblem(error.fields ? '' : error.message);
      setFields(error.fields || {});
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Add a worker">
      <form className="wh-drawer-form" onSubmit={submit} autoComplete="off">
        <Field label="Name" error={fields.name}>
          <input id="wh-new-name" autoComplete="off" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Username" hint="What they type to sign in, such as ravi. Small letters and numbers." error={fields.username}>
          <input id="wh-new-username" autoCapitalize="none" autoComplete="off" value={form.username} onChange={set('username')} />
        </Field>
        <Field label="Password" hint="At least 8 characters. Tell them in person." error={fields.password}>
          <input id="wh-new-password" type="text" autoComplete="off" value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Level" hint={LEVELS[form.level].can}>
          <select id="wh-new-level" value={form.level} onChange={set('level')}>
            {Object.entries(LEVELS).map(([key, l]) => (
              <option key={key} value={key}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        {problem && (
          <p className="dash-field-error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--wide" disabled={busy}>
          {busy ? 'Adding…' : 'Add worker'}
        </button>
      </form>
    </Drawer>
  );
}

function ResetPassword({ worker, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await wh.patch(`/team/${encodeURIComponent(worker.email)}`, { password });
      onDone();
    } catch (error) {
      setProblem(error.message);
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={`New password for ${worker.name}`}>
      <form className="wh-drawer-form" onSubmit={submit} autoComplete="off">
        <p className="dash-muted">This also signs them out on their devices.</p>
        <Field label="New password" hint="At least 8 characters.">
          <input id="wh-reset-password" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {problem && (
          <p className="dash-field-error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--wide" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </Drawer>
  );
}
