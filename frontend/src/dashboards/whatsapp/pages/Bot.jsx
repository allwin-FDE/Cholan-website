import { useEffect, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Icon, Loading, PageHead, useLoad } from '../../shared/ui.jsx';
import { wa } from '../api.js';
import { useWa } from '../shared.jsx';

// The bot: when someone says hi (or writes for the first time) it answers
// with a menu, as buttons (up to 3) or a list (up to 10). Each choice sends a
// message, today's prices from the plant, their latest order's status, or
// hands the chat to a person (the bot then stays quiet with them for a while).
const ACTION_HELP = {
  reply: 'Sends the message you type.',
  catalogue: 'Sends the catalogue: every product with its pack sizes and prices, as on the website, and your contact details.',
  prices: 'Sends today’s website prices for every pack, from the plant’s price list.',
  order_status: 'Finds their latest orders by their number and sends where each one is.',
  handoff: 'Sends your message, marks the chat “needs a person” in the Inbox, and the bot stays quiet with them.',
};

function MenuPreview({ bot }) {
  const welcome = (bot.welcome || '').replace(/\{name\}/g, 'Lakshmi');
  const buttons = bot.options.length <= 3;
  return (
    <div className="wa-phone" aria-label="Preview">
      <div className="wa-phone__bar">
        <span className="wa-phone__avatar">
          <img src="/images/cholan-logo.png" alt="" />
        </span>
        <span>
          <strong>Cholan Rice</strong>
          <small>Business account</small>
        </span>
      </div>
      <div className="wa-phone__chat">
        <div className="wa-bubble wa-bubble--in-demo">
          <p className="wa-bubble__body">Hi</p>
        </div>
        {(bot.showCatalogue || String(bot.contact || '').trim()) && (
          <div className="wa-bubble">
            <p className="wa-bubble__body">
              {bot.showCatalogue && (
                <>
                  🌾 <strong>Cholan Rice: our catalogue</strong>
                  <br />
                  1. Chennai Pattanam Ponni · 1 kg ₹110 · 5 kg ₹520…
                  <br />
                  2. Karikalan · 5 kg ₹510…
                  <br />…
                  <br />
                </>
              )}
              <span style={{ whiteSpace: 'pre-line' }}>{bot.contact}</span>
            </p>
            <span className="wa-bubble__time">10:24</span>
          </div>
        )}
        <div className="wa-bubble">
          <p className="wa-bubble__body">{welcome || 'Your welcome message'}</p>
          <span className="wa-bubble__time">10:24</span>
        </div>
        {buttons ? (
          bot.options.map((o) => (
            <div key={o.id} className="wa-bubble__button">
              ↩ {o.title || 'Option'}
            </div>
          ))
        ) : (
          <>
            <div className="wa-bubble__button">☰ {bot.button || 'Choose'}</div>
            <div className="wa-list-demo">
              {bot.options.map((o, i) => (
                <div key={o.id}>
                  <strong>
                    {i + 1}. {o.title || 'Option'}
                  </strong>
                  {o.description && <small>{o.description}</small>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Bot() {
  const { allowed } = useDash();
  const { status } = useWa();
  const saved = useLoad(() => wa.bot(), []);
  const [bot, setBot] = useState(null);
  const [problem, setProblem] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (saved.data && !bot) setBot({ ...saved.data, triggerWords: (saved.data.triggerWords || []).join(', ') });
  }, [saved.data, bot]);
  if (!bot) return <div className="dash-page">{saved.error ? <div className="dash-error">{saved.error.message}</div> : <Loading />}</div>;
  const set = (patch) => {
    setBot((b) => ({ ...b, ...patch }));
    setNote('');
  };
  const setOpt = (i, patch) => set({ options: bot.options.map((o, x) => (x === i ? { ...o, ...patch } : o)) });
  const move = (i, d) => {
    const next = [...bot.options];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ options: next });
  };
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const b = await wa.saveBot(bot);
      setBot({ ...b, triggerWords: b.triggerWords.join(', ') });
      setNote(b.enabled ? 'Saved. The bot is on.' : 'Saved. The bot is off: switch it on to start answering.');
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const runs = bot.runs || {};
  const editor = allowed('editor');

  return (
    <div className="dash-page">
      <PageHead
        title="Bot"
        intro="Answers by itself when someone says hi: your catalogue and contact number, then a menu: the catalogue, today’s prices, their order’s status, or a hand-over to your team."
        range={false}
        actions={
          <label className="wa-switch-row">
            <span>{bot.enabled ? 'Bot is on' : 'Bot is off'}</span>
            <span className="wa-switch">
              <input type="checkbox" checked={bot.enabled} onChange={(e) => set({ enabled: e.target.checked })} disabled={!editor} aria-label="Bot on" />
              <span />
            </span>
          </label>
        }
      />
      <div className="wa-split">
        <div className="wa-stack">
          <section className="dash-card">
            <h2>When it starts</h2>
            <div className="biz-form">
              <label className="dash-field biz-wide">
                <span className="dash-field__label">Words that show the menu (comma separated)</span>
                <input value={bot.triggerWords} onChange={(e) => set({ triggerWords: e.target.value })} disabled={!editor} placeholder="hi, hello, menu" />
              </label>
              <label className="dash-check biz-wide">
                <input type="checkbox" checked={bot.onFirstMessage} onChange={(e) => set({ onFirstMessage: e.target.checked })} disabled={!editor} /> Also when someone writes for the first time
              </label>
              <label className="dash-check biz-wide">
                <input type="checkbox" checked={bot.showCatalogue !== false} onChange={(e) => set({ showCatalogue: e.target.checked })} disabled={!editor} /> First send our catalogue (every product with pack sizes and prices, as on the website)
              </label>
              <label className="dash-field biz-wide">
                <span className="dash-field__label">Contact details (sent with the catalogue, before the menu)</span>
                <textarea className="dash-textarea" rows={3} value={bot.contact || ''} onChange={(e) => set({ contact: e.target.value })} disabled={!editor} placeholder={'📞 Call us: +91 90922 66667'} />
              </label>
              <label className="dash-field biz-wide">
                <span className="dash-field__label">Welcome message ({'{name}'} becomes their first name)</span>
                <textarea className="dash-textarea" rows={3} value={bot.welcome} onChange={(e) => set({ welcome: e.target.value })} disabled={!editor} />
                {problem?.fields?.welcome && <span className="dash-field-error">{problem.fields.welcome}</span>}
              </label>
              {bot.options.length > 3 && (
                <label className="dash-field">
                  <span className="dash-field__label">List button text</span>
                  <input value={bot.button} maxLength={20} onChange={(e) => set({ button: e.target.value })} disabled={!editor} />
                </label>
              )}
            </div>
          </section>

          <section className="dash-card">
            <div className="biz-section__head">
              <h2>Options ({bot.options.length}/10)</h2>
              <span className="dash-muted dash-small">{bot.options.length <= 3 ? 'Shown as buttons (titles up to 20 letters)' : 'Shown as a list (titles up to 24 letters)'}</span>
            </div>
            {problem?.fields?.options && <div className="dash-error">{problem.fields.options}</div>}
            <ol className="wa-bot-options">
              {bot.options.map((o, i) => (
                <li key={o.id + i} className="wa-bot-option">
                  <div className="wa-bot-option__row">
                    <span className="wa-bot-option__n">{i + 1}</span>
                    <input value={o.title} maxLength={bot.options.length <= 3 ? 20 : 24} onChange={(e) => setOpt(i, { title: e.target.value })} placeholder="Title, e.g. Today’s prices" aria-label="Title" disabled={!editor} />
                    <select value={o.action} onChange={(e) => setOpt(i, { action: e.target.value })} aria-label="What it does" disabled={!editor}>
                      {Object.entries(status?.botActions || { reply: 'Send a message' }).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                    {editor && (
                      <span className="wa-bot-option__tools">
                        <button type="button" className="dash-icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          ↑
                        </button>
                        <button type="button" className="dash-icon-btn" disabled={i === bot.options.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          ↓
                        </button>
                        <button type="button" className="dash-icon-btn" onClick={() => set({ options: bot.options.filter((_, x) => x !== i) })} aria-label="Remove option">
                          <Icon name="close" />
                        </button>
                      </span>
                    )}
                  </div>
                  {bot.options.length > 3 && <input value={o.description || ''} maxLength={72} onChange={(e) => setOpt(i, { description: e.target.value })} placeholder="A line under it (optional)" aria-label="Description" disabled={!editor} />}
                  <textarea
                    className="dash-textarea"
                    rows={2}
                    value={o.reply}
                    onChange={(e) => setOpt(i, { reply: e.target.value })}
                    disabled={!editor}
                    placeholder={o.action === 'reply' ? 'The message it sends' : o.action === 'handoff' ? 'What it says before a person takes over' : 'Sent if the plant’s data can’t be reached (optional)'}
                    aria-label="Message"
                  />
                  <span className="dash-field__hint">
                    {ACTION_HELP[o.action]} {runs[o.id] ? `Chosen ${runs[o.id]} times.` : ''}
                  </span>
                </li>
              ))}
            </ol>
            {editor && bot.options.length < 10 && (
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => set({ options: [...bot.options, { id: `opt${Date.now().toString(36)}`, title: '', description: '', action: 'reply', reply: '' }] })}>
                <Icon name="plus" /> Add an option
              </button>
            )}
          </section>

          <section className="dash-card">
            <h2>Anything else</h2>
            <div className="biz-form">
              <label className="dash-field biz-wide">
                <span className="dash-field__label">If they reply with something else just after the menu</span>
                <input value={bot.fallback} onChange={(e) => set({ fallback: e.target.value })} disabled={!editor} />
              </label>
              <label className="dash-field">
                <span className="dash-field__label">After a hand-over, stay quiet for (hours)</span>
                <input value={bot.pauseHours} onChange={(e) => set({ pauseHours: e.target.value })} inputMode="numeric" disabled={!editor} />
              </label>
            </div>
            <p className="dash-muted dash-small">Keyword automations still answer other messages. The bot only works within WhatsApp’s 24 hours after the person wrote, which is always the case when it’s answering them.</p>
          </section>

          {problem && !problem.fields && <div className="dash-error">{problem.message}</div>}
          {note && <div className="dash-flash dash-flash--good">{note}</div>}
          {editor && (
            <button type="button" className="dash-btn" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save bot'}
            </button>
          )}
          {runs.menu > 0 && <p className="dash-muted dash-small">Menu shown {runs.menu} times.</p>}
        </div>
        <div className="wa-sticky">
          <MenuPreview bot={bot} />
        </div>
      </div>
    </div>
  );
}
