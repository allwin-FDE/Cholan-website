import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';
import { hasBackend, streamChat } from '../../lib/api.js';
import { track } from '../../lib/analytics.js';

// Starter questions, shown as tiles before the first message.
const STARTERS = [
  { icon: 'bowl', label: 'Best rice for idli?', ask: 'Which rice is best for idli?' },
  { icon: 'bag', label: 'Pack sizes', ask: 'What pack sizes do you sell?' },
  { icon: 'truck', label: 'Delivery', ask: 'Where do you deliver, and how long does it take?' },
  { icon: 'box', label: 'Bulk orders', ask: 'How do I place a bulk order?' },
];

// The greeting bubble beside the button: shown once per visit, a few seconds
// after the page settles, until the visitor opens the chat or dismisses it.
const NUDGE_DELAY_MS = 4000;
const NUDGE_KEY = 'cholan-chat-nudged';

const ICONS = {
  bowl: 'M4 11h16a8 8 0 0 1-16 0ZM8 7c0-1 1-1.5 1-2.5M12 7c0-1 1-1.5 1-2.5M16 7c0-1 1-1.5 1-2.5',
  bag: 'M6 7h12l1 13H5L6 7Zm3 0V6a3 3 0 0 1 6 0v1',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  send: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  phone: 'M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  chat: 'M4 5h16v10H9l-5 4V5Z',
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={ICONS[name]} />
  </svg>
);

// Renders an answer: paragraphs, "- " bullet lists and **bold**. Nothing else
// is interpreted, so text from the model can never become markup.
function Answer({ text }) {
  const inline = (line) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  const bullet = /^\s*[-•*]\s+/;
  // Within a paragraph, a run of "- " lines becomes a list and the lines
  // around it stay text ("It comes in:" followed by the sizes).
  return text.split(/\n{2,}/).flatMap((block, i) => {
    const groups = [];
    for (const line of block.split('\n').filter((l) => l.trim())) {
      const isItem = bullet.test(line);
      const last = groups[groups.length - 1];
      if (last && last.list === isItem) last.lines.push(line);
      else groups.push({ list: isItem, lines: [line] });
    }
    return groups.map((g, j) =>
      g.list ? (
        <ul key={`${i}-${j}`}>
          {g.lines.map((l, k) => (
            <li key={k}>{inline(l.replace(bullet, ''))}</li>
          ))}
        </ul>
      ) : (
        <p key={`${i}-${j}`}>
          {g.lines.map((l, k) => (
            <Fragment key={k}>
              {k > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>
      ),
    );
  });
}

const Avatar = ({ size = 'sm' }) => (
  <span className={`chatx-avatar chatx-avatar--${size}`} aria-hidden="true">
    <img src="/favicon.png" alt="" />
  </span>
);

// The website assistant: a medallion button in the corner with a greeting
// bubble, opening a chat panel. Answers come from the backend (POST
// /api/chat), drawn only from the site's own content, and stream in as they
// are written. Not shown when the site has no backend to talk to.
export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [messages, setMessages] = useState([]); // { role, content, sources?, error? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // The greeting bubble, once per visit.
  useEffect(() => {
    if (!hasBackend) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(NUDGE_KEY) === '1';
    } catch {
      /* storage blocked: show it anyway */
    }
    if (seen) return;
    const t = setTimeout(() => setNudge(true), NUDGE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const dismissNudge = () => {
    setNudge(false);
    try {
      sessionStorage.setItem(NUDGE_KEY, '1');
    } catch {
      /* fine: it just may show again next page load */
    }
  };

  // Keep the newest text in view as it streams.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!hasBackend) return null;

  const openChat = () => {
    dismissNudge();
    setOpen(true);
    track('chat_open');
  };

  const updateLast = (patch) =>
    setMessages((current) => {
      const next = current.slice();
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) };
      return next;
    });

  const ask = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setBusy(true);
    // That a question was asked, not what it said.
    track('chat_message', { starter: STARTERS.some((s) => s.ask === question) });

    // The conversation sent to the server: earlier answers that failed are left out.
    const history = [...messages.filter((m) => !m.error), { role: 'user', content: question }].map(
      ({ role, content }) => ({ role, content }),
    );
    setMessages((current) => [
      ...current,
      { role: 'user', content: question },
      { role: 'assistant', content: '', sources: [] },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(history, {
        signal: controller.signal,
        onSources: (sources) => updateLast({ sources }),
        onText: (piece) => updateLast((last) => ({ content: last.content + piece })),
      });
    } catch (error) {
      if (error.name !== 'AbortError') updateLast({ content: error.message, error: true, sources: [] });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className={`chatx${open ? ' chatx--open' : ''}`}>
      {open && (
        <section className="chatx-panel" role="dialog" aria-label="Chat with Cholan">
          <header className="chatx-head">
            <Avatar size="lg" />
            <div className="chatx-head__title">
              <strong>Cholan Assistant</strong>
            </div>
            <a
              className="chatx-head__btn"
              href={`tel:${site.phoneRaw}`}
              aria-label={`Call ${site.phone}`}
              title={`Call ${site.phone}`}
            >
              <Icon name="phone" />
            </a>
            <button type="button" className="chatx-head__btn" onClick={() => setOpen(false)} aria-label="Close chat">
              <Icon name="close" />
            </button>
          </header>

          <div className="chatx-body" ref={listRef} aria-live="polite">
            <div className="chatx-hello">
              <span className="chatx-hello__tamil" lang="ta">
                வணக்கம்!
              </span>
              <h3>How can we help you today?</h3>
              <p>Ask about our rice, pack sizes, delivery or bulk orders.</p>
            </div>

            {messages.length === 0 && (
              <div className="chatx-starters">
                {STARTERS.map((s) => (
                  <button key={s.label} type="button" onClick={() => ask(s.ask)}>
                    <span className="chatx-starters__icon">
                      <Icon name={s.icon} />
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="chatx-row chatx-row--user">
                  <div className="chatx-bubble chatx-bubble--user">
                    <p>{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="chatx-row">
                  <Avatar />
                  <div className={`chatx-bubble${m.error ? ' chatx-bubble--error' : ''}`}>
                    {m.content ? (
                      <Answer text={m.content} />
                    ) : (
                      <span className="chatx-typing" aria-label="Writing an answer">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {m.content && !busy && m.sources?.length > 0 && (
                      <div className="chatx-sources">
                        {m.sources.map((s) => (
                          <Link key={s.url} to={s.url} onClick={() => setOpen(false)}>
                            {s.title} <span aria-hidden="true">→</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>

          <form className="chatx-form" onSubmit={onSubmit}>
            <label className="visually-hidden" htmlFor="chatx-input">
              Your question
            </label>
            <input
              id="chatx-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask in English or தமிழ்…"
              maxLength={1000}
              autoComplete="off"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <Icon name="send" />
            </button>
          </form>
          <p className="chatx-foot">Answers from our website</p>
        </section>
      )}

      {nudge && !open && (
        <div className="chatx-nudge" role="status">
          <button type="button" className="chatx-nudge__close" onClick={dismissNudge} aria-label="Dismiss">
            <Icon name="close" />
          </button>
          <button type="button" className="chatx-nudge__body" onClick={openChat}>
            <span className="chatx-nudge__wave" aria-hidden="true">
              👋
            </span>
            <span>
              <strong>Chat with us!</strong>
              <span>Not sure which rice to pick? Ask me anything.</span>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className="chatx-launch"
        onClick={() => (open ? setOpen(false) : openChat())}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Chat with us'}
      >
        {open ? (
          <Icon name="close" />
        ) : (
          <>
            <img src="/favicon.png" alt="" />
            <span className="chatx-launch__badge" aria-hidden="true">
              <Icon name="chat" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}
