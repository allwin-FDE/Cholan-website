import { useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, ago, useLoad } from '../../shared/ui.jsx';
import { useUrl } from '../../shared/urlState.js';
import { wa } from '../api.js';
import { CATEGORY, PhonePreview, ValueMapper, previewValues, useWa } from '../shared.jsx';

// Automations: messages that go by themselves. A keyword reply, a welcome
// for someone writing for the first time, and messages when a website
// enquiry comes in or an order is placed, confirmed, dispatched or delivered.
const ORDER_FIELDS = {
  order_number: 'Order number',
  total: 'Order total',
  items: 'Items ordered',
  bags: 'Number of bags',
  invoice_number: 'Invoice number',
  city: 'Delivery city',
  vehicle: 'Vehicle number',
  driver_name: 'Driver name',
  driver_phone: 'Driver phone',
  lr_number: 'LR number',
};
const FIELDS_FOR = {
  enquiry: { product: 'Product asked about', enquiry_type: 'Enquiry type' },
  website_order: ORDER_FIELDS,
  order_confirmed: ORDER_FIELDS,
  order_dispatched: ORDER_FIELDS,
  order_delivered: ORDER_FIELDS,
};
const REPLY_TRIGGERS = ['keyword', 'new_contact'];
const IDEAS = [
  { name: 'Price list on request', trigger: 'keyword', keywords: 'price, rate, cost', action: { type: 'text', text: 'Hi {name}! Our current prices are on www.cholanrice.in/products. Tell us the rice and pack size you need and we’ll confirm today’s rate.' } },
  { name: 'Welcome message', trigger: 'new_contact', action: { type: 'text', text: 'Hi {name}, thanks for writing to Cholan Rice! We reply between 9 am and 8 pm. Reply STOP any time to stop messages.' } },
  { name: 'Order dispatched', trigger: 'order_dispatched', action: { type: 'template' } },
];

export default function Automations() {
  const { allowed } = useDash();
  const { status } = useWa();
  const { get, patch } = useUrl();
  const list = useLoad(() => wa.automations(), []);
  const rows = list.data?.automations || [];
  const triggers = status?.triggers || {};
  const editing = get('new') ? (IDEAS[Number(get('idea'))] || {}) : rows.find((a) => a.id === get('rule'));
  const toggle = async (a) => {
    try {
      await wa.saveAutomation({ ...a, active: !a.active });
      list.reload();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="dash-page">
      <PageHead
        title="Automations"
        intro="Messages that go by themselves: keyword replies, a welcome, and updates when an order is placed, confirmed, dispatched or delivered."
        range={false}
        actions={
          allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => patch({ new: 1, idea: '', rule: '' })}>
              <Icon name="plus" /> New automation
            </button>
          )
        }
      />
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      <Card>
        {list.loading && !list.data && <Loading />}
        {list.data &&
          (rows.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Automation</th>
                    <th>When</th>
                    <th>Sends</th>
                    <th className="dash-num">Times sent</th>
                    <th>On</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className={`dash-row-link${a.active ? '' : ' is-off'}`} onClick={() => patch({ rule: a.id, new: '' })}>
                      <td>
                        <strong>{a.name}</strong>
                      </td>
                      <td className="dash-small">
                        {triggers[a.trigger] || a.trigger}
                        {a.trigger === 'keyword' && <span className="dash-muted dash-block">{a.keywords.join(', ')}</span>}
                      </td>
                      <td className="dash-small">{a.action.type === 'text' ? <span className="wa-clip">“{a.action.text}”</span> : `Template ${a.action.template?.name}`}</td>
                      <td className="dash-num">
                        {a.runs || 0}
                        {a.lastRunAt && <span className="dash-muted dash-block dash-small">{ago(a.lastRunAt)}</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <label className="wa-switch">
                          <input type="checkbox" checked={a.active} onChange={() => toggle(a)} disabled={!allowed('editor')} aria-label={`${a.name} on`} />
                          <span />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="route" title="No automations yet">
              Start from one of these, or make your own.
            </Empty>
          ))}
        {list.data && allowed('editor') && (
          <div className="wa-ideas">
            {IDEAS.map((idea, i) => (
              <button key={idea.name} type="button" className="wa-cat" onClick={() => patch({ new: 1, idea: i })}>
                <strong>{idea.name}</strong>
                <span>{triggers[idea.trigger]}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
      {editing && (
        <RuleDrawer
          rule={editing}
          onClose={() => patch({ new: '', idea: '', rule: '' })}
          onSaved={() => {
            list.reload();
            patch({ new: '', idea: '', rule: '' }, { replace: true });
          }}
        />
      )}
    </div>
  );
}

function RuleDrawer({ rule, onClose, onSaved }) {
  const { allowed } = useDash();
  const { status } = useWa();
  const templates = useLoad(() => wa.templates(), []);
  const [f, setF] = useState({
    id: rule.id,
    name: rule.name || '',
    trigger: rule.trigger || 'keyword',
    keywords: Array.isArray(rule.keywords) ? rule.keywords.join(', ') : rule.keywords || '',
    match: rule.match || 'contains',
    action: rule.action || { type: 'text', text: '' },
    active: rule.active !== false,
  });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const canText = REPLY_TRIGGERS.includes(f.trigger);
  const action = canText ? f.action : { ...f.action, type: 'template' };
  const approved = (templates.data?.templates || []).filter((t) => t.status === 'APPROVED' && t.category !== 'AUTHENTICATION');
  const template = approved.find((t) => t.name === action.template?.name && t.language === action.template?.language);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await wa.saveAutomation({ ...f, action });
      onSaved();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete “${f.name}”?`)) return;
    await wa.deleteAutomation(f.id).catch((e) => window.alert(e.message));
    onSaved();
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? f.name : 'New automation'} wide>
      <form onSubmit={save} className="wa-split">
        <div>
          <div className="biz-form">
            <label className="dash-field biz-wide">
              <span className="dash-field__label">Name</span>
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Order dispatched message" required />
              {err('name')}
            </label>
            <label className="dash-field biz-wide">
              <span className="dash-field__label">When</span>
              <select value={f.trigger} onChange={(e) => set({ trigger: e.target.value })}>
                {Object.entries(status?.triggers || {}).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {f.trigger === 'keyword' && (
              <>
                <label className="dash-field">
                  <span className="dash-field__label">Keywords (comma separated)</span>
                  <input value={f.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="price, rate, offer" />
                  {err('keywords')}
                </label>
                <label className="dash-field">
                  <span className="dash-field__label">Match</span>
                  <select value={f.match} onChange={(e) => set({ match: e.target.value })}>
                    <option value="contains">Message contains the word</option>
                    <option value="exact">Message is exactly the word</option>
                  </select>
                </label>
              </>
            )}
          </div>
          {!canText && <p className="dash-muted dash-small">The customer may not have written in the last 24 hours, so this sends a template (a Utility one is right for order updates). The customer’s phone comes from the order or enquiry.</p>}
          <section className="biz-section">
            <h3>It sends</h3>
            {canText && (
              <div className="dash-seg" role="group" aria-label="Sends">
                <button type="button" className={action.type === 'text' ? 'is-on' : ''} onClick={() => set({ action: { type: 'text', text: f.action.text || '' } })}>
                  A message
                </button>
                <button type="button" className={action.type === 'template' ? 'is-on' : ''} onClick={() => set({ action: { type: 'template', template: null, mapping: {} } })}>
                  A template
                </button>
              </div>
            )}
            {action.type === 'text' ? (
              <label className="dash-field" style={{ marginTop: 10 }}>
                <span className="dash-field__label">Message ({'{name}'} becomes their first name)</span>
                <textarea className="dash-textarea" rows={5} value={action.text || ''} onChange={(e) => set({ action: { ...action, text: e.target.value } })} />
                {err('text')}
              </label>
            ) : (
              <>
                <select
                  value={template?.id || ''}
                  onChange={(e) => {
                    const t = approved.find((x) => x.id === e.target.value);
                    set({ action: { type: 'template', template: t ? { name: t.name, language: t.language } : null, mapping: {} } });
                  }}
                  aria-label="Template"
                  style={{ marginTop: 10 }}
                >
                  <option value="">Choose an approved template…</option>
                  {approved.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({CATEGORY[t.category]}, {t.language})
                    </option>
                  ))}
                </select>
                {err('template')}
                {template && (
                  <div style={{ marginTop: 10 }}>
                    <ValueMapper template={template} mapping={action.mapping || {}} onChange={(mapping) => set({ action: { ...action, mapping } })} extraFields={FIELDS_FOR[f.trigger] || {}} onUpload={async (file) => (await wa.uploadMedia(file)).url} />
                  </div>
                )}
              </>
            )}
            {err('actionType')}
          </section>
          <label className="dash-check">
            <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> On
          </label>
          {problem && <div className="dash-error">{problem.message}</div>}
          {allowed('editor') && (
            <div className="dash-row biz-actions">
              <button type="submit" className="dash-btn" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              {f.id && (
                <button type="button" className="dash-btn dash-btn--ghost" onClick={remove}>
                  <Icon name="trash" /> Delete
                </button>
              )}
            </div>
          )}
          {rule.runs > 0 && (
            <p className="dash-muted dash-small">
              Sent {rule.runs} times, last {ago(rule.lastRunAt)}. <Badge tone={rule.active ? 'good' : 'muted'}>{rule.active ? 'On' : 'Off'}</Badge>
            </p>
          )}
        </div>
        <div className="wa-sticky">
          {action.type === 'text' ? (
            <PhonePreview components={[{ type: 'BODY', text: (action.text || '').replace(/\{name\}/g, 'Lakshmi') }]} />
          ) : template ? (
            <PhonePreview components={template.components} values={previewValues(template, action.mapping, { name: 'Lakshmi Ramesh', attributes: { order_number: 'CO-00012', total: '₹1,040', items: 'Moongil Ponni 26 kg × 2', bags: '2', vehicle: 'TN 37 AB 1234', driver_phone: '+91 98765 43210', product: 'Moongil Ponni' } })} />
          ) : (
            <p className="dash-muted dash-small">Choose a template to see it here.</p>
          )}
        </div>
      </form>
    </Drawer>
  );
}
