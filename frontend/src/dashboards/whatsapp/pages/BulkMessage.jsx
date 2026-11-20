import { useEffect, useMemo, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Icon, Loading, PageHead, useLoad } from '../../shared/ui.jsx';
import { useNavigate } from 'react-router-dom';
import { showNumber, wa } from '../api.js';
import { CATEGORY, PhonePreview, ValueMapper, previewValues, useWa } from '../shared.jsx';

// Bulk message: one approved template to a list of numbers pasted or
// uploaded here, without making a broadcast audience first. The numbers
// become contacts (tagged "bulk"); people who opted out are left out, and
// offers only go to people who agreed. Sent through the same queue as
// broadcasts, so the report shows under Broadcasts too.

// The pasted text as rows: a CSV with a header (phone, name, other columns),
// or one person a line ("98765 43210" or "Lakshmi, 98765 43210").
function parseList(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], columns: [] };
  const split = (l) => l.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const phoneCol = head.findIndex((h) => ['phone', 'mobile', 'number', 'whatsapp', 'phone number', 'mobile number'].includes(h));
  if (phoneCol !== -1) {
    const nameCol = head.findIndex((h) => ['name', 'full name', 'customer'].includes(h));
    const extra = head.map((h, i) => [h.replace(/[^a-z0-9_]/g, '_'), i]).filter(([, i]) => i !== phoneCol && i !== nameCol);
    return {
      columns: extra.map(([h]) => h),
      rows: lines.slice(1).map((l) => {
        const c = split(l);
        return { phone: c[phoneCol] || '', name: nameCol !== -1 ? c[nameCol] || '' : '', attributes: Object.fromEntries(extra.map(([h, i]) => [h, c[i] || ''])) };
      }),
    };
  }
  return {
    columns: [],
    rows: lines.map((l) => {
      const c = split(l);
      const phone = c.find((x) => (x.replace(/\D/g, '').length >= 10)) || '';
      return { phone, name: c.filter((x) => x !== phone).join(' ').trim(), attributes: {} };
    }),
  };
}
const valid = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return /^(0|91)?[6-9]\d{9}$/.test(d) || (String(p).trim().startsWith('+') && d.length >= 8 && d.length <= 15);
};

export default function BulkMessage() {
  const { allowed } = useDash();
  const { status } = useWa();
  const navigate = useNavigate();
  const templates = useLoad(() => wa.templates(), []);
  const [pick, setPick] = useState('');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [mapping, setMapping] = useState({});
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState('');
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const approved = (templates.data?.templates || []).filter((t) => t.status === 'APPROVED' && t.category !== 'AUTHENTICATION');
  const template = approved.find((t) => t.id === pick);
  const { rows, columns } = useMemo(() => parseList(text), [text]);
  const good = rows.filter((r) => valid(r.phone));
  const bad = rows.length - good.length;
  const marketing = template?.category === 'MARKETING';
  const list = good.map((r) => ({ phone: r.phone, name: r.name, attributes: r.attributes }));

  useEffect(() => {
    setPreview(null);
    if (!template || !good.length) return undefined;
    const t = setTimeout(() => {
      wa.previewCampaign({ name: 'bulk', template: { name: template.name, language: template.language }, audience: { list, consent }, mapping })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, text, consent, mapping]);

  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const stamp = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const c = await wa.createCampaign({
        name: `Bulk message, ${stamp}`,
        template: { name: template.name, language: template.language },
        audience: { list, consent },
        mapping,
        send: when === 'now' ? 'now' : 'schedule',
        scheduleAt: when === 'schedule' ? new Date(at).toISOString() : null,
      });
      navigate(`/whatsapp/campaigns?campaign=${c.id}`);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setTestMsg('');
    try {
      await wa.test({ to: testTo, template: { name: template.name, language: template.language }, mapping, name: good[0]?.name || 'Test' });
      setTestMsg('Test sent. Check that phone.');
    } catch (e) {
      setTestMsg(e.message);
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Bulk message" intro="Send an approved template to a list of numbers: paste them or upload a file. Each person’s name and columns can go into the message." range={false} />
      <div className="wa-split wa-bulk-page">
        <div className="wa-stack">
          <section className="dash-card">
            <h2>1. Template</h2>
            {templates.loading && !templates.data && <Loading />}
            {templates.data && !approved.length && <p className="dash-muted">No approved templates yet. Make one under Templates.</p>}
            <select value={pick} onChange={(e) => (setPick(e.target.value), setMapping({}))} aria-label="Template" style={{ width: '100%' }}>
              <option value="">Choose an approved template…</option>
              {approved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {CATEGORY[t.category]} · {status?.languages?.[t.language] || t.language}
                </option>
              ))}
            </select>
          </section>

          <section className="dash-card">
            <div className="biz-section__head">
              <h2>2. Numbers</h2>
              <label className="dash-btn dash-btn--ghost dash-btn--sm" style={{ cursor: 'pointer' }}>
                <Icon name="file" /> Upload CSV
                <input type="file" hidden accept=".csv,text/csv,text/plain" onChange={async (e) => e.target.files?.[0] && setText(await e.target.files[0].text())} />
              </label>
            </div>
            <textarea className="dash-textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'One per line:\n98765 43210\nLakshmi, 94455 12345\n\nor a CSV with a header row:\nname,phone,city\nRavi,9000012345,Erode'} />
            <p className="dash-small">
              <strong>{good.length}</strong> number{good.length === 1 ? '' : 's'}
              {bad > 0 && <span className="wa-bad"> · {bad} not valid (left out)</span>}
              {columns.length > 0 && <span className="dash-muted"> · columns to use: {columns.join(', ')}</span>}
            </p>
            {marketing && (
              <label className="dash-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> These people agreed to get offers from us on WhatsApp
              </label>
            )}
          </section>

          {template && (
            <section className="dash-card">
              <h2>3. Fill in the template</h2>
              <ValueMapper template={template} mapping={mapping} onChange={setMapping} extraFields={Object.fromEntries(columns.map((c) => [c, c.replace(/_/g, ' ')]))} onUpload={async (file) => (await wa.uploadMedia(file)).url} />
              <div className="dash-row" style={{ marginTop: 12 }}>
                <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Your number, for a test" aria-label="Test number" />
                <button type="button" className="dash-btn dash-btn--ghost" onClick={test} disabled={!testTo}>
                  Send test
                </button>
              </div>
              {testMsg && <p className="dash-small">{testMsg}</p>}
            </section>
          )}

          {template && good.length > 0 && (
            <section className="dash-card">
              <h2>4. Send</h2>
              <div className="dash-seg" role="group" aria-label="When">
                <button type="button" className={when === 'now' ? 'is-on' : ''} onClick={() => setWhen('now')}>
                  Send now
                </button>
                <button type="button" className={when === 'schedule' ? 'is-on' : ''} onClick={() => setWhen('schedule')}>
                  Schedule
                </button>
              </div>
              {when === 'schedule' && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ marginTop: 10 }} aria-label="Send at" />}
              {preview && (
                <p className="dash-small" style={{ marginTop: 10 }}>
                  <strong className="wa-count">{preview.count}</strong> will get it.
                  {(preview.skipped.optedOut > 0 || preview.skipped.noConsent > 0) && (
                    <span className="dash-muted">
                      {' '}
                      Left out: {preview.skipped.optedOut} opted out{preview.skipped.noConsent ? `, ${preview.skipped.noConsent} without consent for offers` : ''}.
                    </span>
                  )}
                  {preview.incomplete > 0 && <span className="wa-bad"> {preview.incomplete} missing a value (skipped).</span>}
                </p>
              )}
              {problem && <div className="dash-error">{problem.message}</div>}
              {allowed('editor') && (
                <button type="button" className="dash-btn" style={{ marginTop: 10 }} disabled={busy || !preview?.count || (when === 'schedule' && !at)} onClick={send}>
                  {busy ? 'Sending…' : when === 'now' ? `Send to ${preview?.count ?? good.length}` : 'Schedule'}
                </button>
              )}
            </section>
          )}
        </div>
        <div className="wa-sticky">
          {template ? (
            <>
              <PhonePreview components={template.components} values={previewValues(template, mapping, good[0] ? { name: good[0].name || 'Lakshmi', attributes: good[0].attributes } : undefined)} />
              {good[0] && <p className="dash-muted dash-small" style={{ textAlign: 'center' }}>As {good[0].name || showNumber(good[0].phone.replace(/\D/g, ''))} will see it</p>}
            </>
          ) : (
            <p className="dash-muted dash-small">Choose a template to see it here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
