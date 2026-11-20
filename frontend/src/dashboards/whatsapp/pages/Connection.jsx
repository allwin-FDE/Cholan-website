import { useEffect, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Icon, Loading, PageHead } from '../../shared/ui.jsx';
import { wa } from '../api.js';
import { useWa } from '../shared.jsx';

// The connection to Meta's WhatsApp Cloud API: what's set up, how to finish
// it, the webhook Meta sends messages and delivery updates to, the replies to
// STOP and START, and a test message.
const Check = ({ ok, children, hint }) => (
  <li className={`wa-check${ok ? ' is-ok' : ''}`}>
    <span aria-hidden="true">{ok ? '✓' : '○'}</span>
    <span>
      {children}
      {hint && <small className="dash-muted dash-block">{hint}</small>}
    </span>
  </li>
);

export default function Connection() {
  const { allowed } = useDash();
  const { status, reloadStatus } = useWa();
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState('');
  const [test, setTest] = useState({ to: '', text: 'Hello from Cholan Rice! This is a test message.' });
  const [testMsg, setTestMsg] = useState('');
  useEffect(() => {
    if (status?.settings) setSettings(status.settings);
  }, [status?.settings]);
  if (!status) return <div className="dash-page"><Loading /></div>;
  if (status.error) return <div className="dash-page"><div className="dash-error">{status.error}</div></div>;
  const c = status.connection;
  const copy = (text) => navigator.clipboard?.writeText(text);
  const save = async (event) => {
    event.preventDefault();
    setSaved('');
    try {
      setSettings(await wa.saveSettings(settings));
      setSaved('Saved.');
      reloadStatus();
    } catch (e) {
      setSaved(e.message);
    }
  };
  const sendTest = async () => {
    setTestMsg('');
    try {
      await wa.test({ to: test.to, text: test.text });
      setTestMsg('Sent. Check that phone.');
    } catch (e) {
      setTestMsg(e.message);
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Connection" intro="Your WhatsApp Business number through Meta’s WhatsApp Cloud API." range={false} />
      <Card title="Status" action={<button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={reloadStatus}><Icon name="refresh" /> Check again</button>}>
        {c.fake && <p className="biz-warn dash-small">Test mode is on: Meta’s answers are simulated and nothing is sent.</p>}
        <ul className="wa-checks">
          <Check ok={c.ready} hint={c.missing.length ? `Missing: ${c.missing.join(', ')}` : ''}>
            Can send messages {c.ready && status.phone && <Badge tone="good">{status.phone.display_phone_number}</Badge>}
          </Check>
          <Check ok={status.webhookReady || c.webhookReady} hint="Needed to receive messages, delivery and read updates, and template approvals.">
            Receives messages and updates (webhook)
          </Check>
          <Check ok={c.canUploadMedia} hint="Needed only for templates with an image, video or document header.">
            Can upload samples for media templates (Meta app ID)
          </Check>
        </ul>
        {status.phoneError && <p className="dash-error">{status.phoneError}</p>}
        {status.phone && (
          <dl className="dash-facts">
            <div>
              <dt>Name shown to customers</dt>
              <dd>
                {status.phone.verified_name} {status.phone.name_status && <span className="dash-muted dash-small">({String(status.phone.name_status).toLowerCase().replace(/_/g, ' ')})</span>}
              </dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>{status.phone.quality_rating || '—'}</dd>
            </div>
            <div>
              <dt>Daily limit</dt>
              <dd>{status.phone.messaging_limit_tier ? String(status.phone.messaging_limit_tier).replace('TIER_', '') + ' new people a day' : '—'}</dd>
            </div>
          </dl>
        )}
      </Card>

      {!c.ready && (
        <Card title="How to connect (one time)">
          <ol className="wa-setup">
            <li>
              In <strong>business.facebook.com</strong>, open your business (or make one) and complete business verification.
            </li>
            <li>
              At <strong>developers.facebook.com</strong> → My apps → <em>Create app</em> → type <em>Business</em>, then add the <strong>WhatsApp</strong> product.
            </li>
            <li>
              In WhatsApp → API setup, <strong>add your phone number</strong> (one not already used on the WhatsApp app) and verify it by SMS or call. Note the <strong>Phone number ID</strong> and the <strong>WhatsApp Business Account ID</strong>.
            </li>
            <li>
              In Business settings → Users → <strong>System users</strong>, add an admin system user, give it the app and the WhatsApp account, and <em>Generate token</em> with <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code> (choose “never expires”).
            </li>
            <li>
              From the app’s Settings → Basic, note the <strong>App ID</strong> and <strong>App secret</strong>.
            </li>
            <li>Send those five values to your developer privately (not in a group chat); they go into Google Secret Manager, never into the website’s code.</li>
            <li>Then set up the webhook below at Meta, and add a payment method in WhatsApp Manager for marketing messages.</li>
          </ol>
        </Card>
      )}

      <Card title="Webhook (at Meta: WhatsApp → Configuration)">
        <dl className="dash-facts">
          <div>
            <dt>Callback URL</dt>
            <dd>
              <code className="wa-code">{status.webhookUrl}</code>{' '}
              <button type="button" className="dash-link" onClick={() => copy(status.webhookUrl)}>
                Copy
              </button>
            </dd>
          </div>
          <div>
            <dt>Verify token</dt>
            <dd>{status.verifyTokenSet ? 'Set on the server (your developer has it).' : 'Not set yet.'}</dd>
          </div>
          <div>
            <dt>Subscribe to</dt>
            <dd>
              <code>messages</code> and <code>message_template_status_update</code>
            </dd>
          </div>
        </dl>
      </Card>

      {settings && (
        <Card title="Replies and sending speed">
          <form onSubmit={save}>
            <div className="biz-form">
              <label className="dash-field biz-wide">
                <span className="dash-field__label">When someone sends STOP</span>
                <textarea className="dash-textarea" rows={2} value={settings.optOutReply} onChange={(e) => setSettings({ ...settings, optOutReply: e.target.value })} disabled={!allowed('admin')} />
              </label>
              <label className="dash-field biz-wide">
                <span className="dash-field__label">When someone sends START</span>
                <textarea className="dash-textarea" rows={2} value={settings.optInReply} onChange={(e) => setSettings({ ...settings, optInReply: e.target.value })} disabled={!allowed('admin')} />
              </label>
              <label className="dash-field">
                <span className="dash-field__label">Messages a minute (campaigns)</span>
                <input value={settings.perTick} onChange={(e) => setSettings({ ...settings, perTick: e.target.value })} inputMode="numeric" disabled={!allowed('admin')} />
              </label>
            </div>
            {allowed('admin') && (
              <button type="submit" className="dash-btn" style={{ marginTop: 10 }}>
                Save
              </button>
            )}
            {saved && <span className="dash-small" style={{ marginLeft: 10 }}>{saved}</span>}
          </form>
        </Card>
      )}

      {allowed('editor') && c.ready && (
        <Card title="Send a test message" hint="A plain message only reaches someone who wrote to your number in the last 24 hours. Otherwise send a template from a campaign’s test step.">
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">To</span>
              <input value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} placeholder="98765 43210" />
            </label>
            <label className="dash-field biz-wide">
              <span className="dash-field__label">Message</span>
              <input value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} />
            </label>
          </div>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={sendTest} disabled={!test.to} style={{ marginTop: 10 }}>
            Send test
          </button>
          {testMsg && <p className="dash-small">{testMsg}</p>}
        </Card>
      )}
    </div>
  );
}
