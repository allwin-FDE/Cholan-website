import { useEffect, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Icon, Loading, PageHead, useLoad } from '../../shared/ui.jsx';
import { wa } from '../api.js';
import { useWa } from '../shared.jsx';

// The bot: when someone says hi (or writes for the first time) it answers
// with a menu, as buttons (up to 3) or a list (up to 10). Each choice sends a
// message, today's prices from the plant, their latest order's status, or
// hands the chat to a person (the bot then stays quiet with them for a while).
// First it asks for the language, Tamil or English (owner, 2026-11-25): each
// text has a Tamil box beside it, and an empty Tamil box sends the English.
const ACTION_HELP = {
  reply: 'Sends the message you type.',
  catalogue: 'Sends the list of products with their pack sizes (no prices); in Tamil, with the Tamil names.',
  prices: 'Sends today’s website prices for every pack, from the plant’s price list.',
  order_status: 'Finds their latest orders by their number and sends where each one is.',
  handoff: 'Sends your message, marks the chat “needs a person” in the Inbox, and the bot stays quiet with them.',
  stores: 'The website’s store finder in chat: asks them to share their location (or type a pincode or area) and sends the 3 nearest shops with directions. One search per mobile number, shared with the website; their WhatsApp name is used (the bot asks if it isn’t a real name). They go to Sales Daddy tagged Store. No message needed here.',
};

const pick = (ta, en, tamil) => (tamil && String(ta || '').trim() ? ta : en);

function MenuPreview({ bot, tamil }) {
  const welcome = pick(bot.welcomeTa, bot.welcome, tamil).replace(/\{name\}/g, 'Lakshmi');
  const buttons = bot.options.length <= 3;
  const title = (o) => pick(o.titleTa, o.title, tamil);
  const description = (o) => pick(o.descriptionTa, o.description, tamil);
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
        {bot.askLanguage !== false && (
          <>
            <div className="wa-bubble">
              <p className="wa-bubble__body" style={{ whiteSpace: 'pre-line' }}>
                {bot.languageText}
              </p>
              <span className="wa-bubble__time">10:24</span>
            </div>
            <div className="wa-bubble__button">↩ தமிழ்</div>
            <div className="wa-bubble__button">↩ English</div>
            <div className="wa-bubble wa-bubble--in-demo">
              <p className="wa-bubble__body">{tamil ? 'தமிழ்' : 'English'}</p>
            </div>
          </>
        )}
        {bot.showCatalogue && (
          <div className="wa-bubble">
            <p className="wa-bubble__body">
              {bot.showCatalogue && (
                <>
                  🌾 <strong>{tamil ? 'சோழன் அரிசி: எங்கள் பொருட்கள்' : 'Cholan Rice: our products'}</strong>
                  <br />
                  {tamil ? '1. சென்னைப்பட்டினம் பொன்னி · 1 கிலோ · 5 கிலோ…' : '1. Chennai Pattanam Ponni · 1 kg · 5 kg · 10 kg…'}
                  <br />
                  {tamil ? '2. கரிகாலன் · 5 கிலோ…' : '2. Karikalan · 5 kg…'}
                  <br />…
                  <br />
                </>
              )}
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
              ↩ {title(o) || 'Option'}
            </div>
          ))
        ) : (
          <>
            <div className="wa-bubble__button">☰ {pick(bot.buttonTa, bot.button, tamil) || 'Choose'}</div>
            <div className="wa-list-demo">
              {bot.options.map((o, i) => (
                <div key={o.id}>
                  <strong>
                    {i + 1}. {title(o) || 'Option'}
                  </strong>
                  {description(o) && <small>{description(o)}</small>}
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
  const [tamil, setTamil] = useState(false);
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
        intro="Answers by itself when someone says hi: first Tamil or English, then a menu in that language: the catalogue, today’s prices, their order’s status, or a hand-over to your team."
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
                <input type="checkbox" checked={bot.askLanguage !== false} onChange={(e) => set({ askLanguage: e.target.checked })} disabled={!editor} /> First ask for the language: தமிழ் or English (buttons)
              </label>
              {bot.askLanguage !== false && (
                <label className="dash-field biz-wide">
                  <span className="dash-field__label">The language question</span>
                  <textarea className="dash-textarea" rows={2} value={bot.languageText || ''} onChange={(e) => set({ languageText: e.target.value })} disabled={!editor} />
                </label>
              )}
              <label className="dash-check biz-wide">
                <input type="checkbox" checked={bot.showCatalogue !== false} onChange={(e) => set({ showCatalogue: e.target.checked })} disabled={!editor} /> Send our products list before the menu (every product with its pack sizes)
              </label>
              <label className="dash-field">
                <span className="dash-field__label">Welcome message ({'{name}'} becomes their first name)</span>
                <textarea className="dash-textarea" rows={3} value={bot.welcome} onChange={(e) => set({ welcome: e.target.value })} disabled={!editor} />
                {problem?.fields?.welcome && <span className="dash-field-error">{problem.fields.welcome}</span>}
              </label>
              <label className="dash-field">
                <span className="dash-field__label">Welcome message in Tamil</span>
                <textarea className="dash-textarea" rows={3} value={bot.welcomeTa || ''} onChange={(e) => set({ welcomeTa: e.target.value })} disabled={!editor} lang="ta" />
              </label>
              {bot.options.length > 3 && (
                <>
                  <label className="dash-field">
                    <span className="dash-field__label">List button text</span>
                    <input value={bot.button} maxLength={20} onChange={(e) => set({ button: e.target.value })} disabled={!editor} />
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">List button text in Tamil</span>
                    <input value={bot.buttonTa || ''} maxLength={20} onChange={(e) => set({ buttonTa: e.target.value })} disabled={!editor} lang="ta" />
                  </label>
                </>
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
                  <input value={o.titleTa || ''} maxLength={bot.options.length <= 3 ? 20 : 24} onChange={(e) => setOpt(i, { titleTa: e.target.value })} placeholder="Title in Tamil, e.g. பொருட்கள்" aria-label="Title in Tamil" disabled={!editor} lang="ta" />
                  {bot.options.length > 3 && <input value={o.description || ''} maxLength={72} onChange={(e) => setOpt(i, { description: e.target.value })} placeholder="A line under it (optional)" aria-label="Description" disabled={!editor} />}
                  {bot.options.length > 3 && <input value={o.descriptionTa || ''} maxLength={72} onChange={(e) => setOpt(i, { descriptionTa: e.target.value })} placeholder="The line under it in Tamil (optional)" aria-label="Description in Tamil" disabled={!editor} lang="ta" />}
                  {o.action !== 'stores' && <textarea
                    className="dash-textarea"
                    rows={2}
                    value={o.reply}
                    onChange={(e) => setOpt(i, { reply: e.target.value })}
                    disabled={!editor}
                    placeholder={o.action === 'reply' ? 'The message it sends' : o.action === 'handoff' ? 'What it says before a person takes over' : 'Sent if the plant’s data can’t be reached (optional)'}
                    aria-label="Message"
                  />
                  {['reply', 'handoff'].includes(o.action) && (
                    <textarea className="dash-textarea" rows={2} value={o.replyTa || ''} onChange={(e) => setOpt(i, { replyTa: e.target.value })} disabled={!editor} placeholder="The same message in Tamil" aria-label="Message in Tamil" lang="ta" />
                  )}}
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
              <label className="dash-field biz-wide">
                <span className="dash-field__label">The same in Tamil</span>
                <input value={bot.fallbackTa || ''} onChange={(e) => set({ fallbackTa: e.target.value })} disabled={!editor} lang="ta" />
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
          <div className="wa-lang-toggle" role="group" aria-label="Preview language">
            <button type="button" className={`dash-btn dash-btn--sm ${tamil ? 'dash-btn--ghost' : ''}`} onClick={() => setTamil(false)} aria-pressed={!tamil}>
              English
            </button>
            <button type="button" className={`dash-btn dash-btn--sm ${tamil ? '' : 'dash-btn--ghost'}`} onClick={() => setTamil(true)} aria-pressed={tamil}>
              தமிழ்
            </button>
          </div>
          <MenuPreview bot={bot} tamil={tamil} />
        </div>
      </div>
    </div>
  );
}
