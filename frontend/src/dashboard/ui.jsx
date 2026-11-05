import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RANGES, useDash } from './context.js';

// Shared pieces of the dashboard: icons, page header with the date range,
// stat tiles, bar lists, the daily chart, the side drawer, and formatters.

const PATHS = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 9a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M21 20a5 5 0 0 0-4-4.9',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 2 1.5 3 2.5 3C11 9 11 6 12 3Z',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6h-5l-1 2h-4l-1-2H4Z',
  pen: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  close: 'M6 6l12 12M18 6 6 18',
  phone: 'M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  click: 'M9 9l11 4-5 2-2 5-4-11ZM5 3v3M3 5h3M3.5 9.5l2-2M9.5 3.5l-2 2',
  page: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  check: 'M5 12l5 5 9-10',
  desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  mobile: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM11 18h2',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
};

export function Icon({ name, size }) {
  return (
    <svg className="dash-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={size ? { width: size, height: size } : undefined}>
      <path d={PATHS[name] || PATHS.grid} />
    </svg>
  );
}

// ---- Formatting ----
export const fmt = new Intl.NumberFormat('en-IN');
export const num = (n) => fmt.format(Math.round(n || 0));

export function duration(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const when = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—';

export const dateOnly = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function ago(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} days ago` : dateOnly(value);
}

// ---- Data loading ----
export function useLoad(load, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

// ---- Layout pieces ----
export function PageHead({ title, intro, range = true, actions }) {
  const { days, setDays } = useDash();
  return (
    <header className="dash-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      <div className="dash-head__tools">
        {actions}
        {range && (
          <div className="dash-seg" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <button key={r.days} type="button" className={r.days === days ? 'is-on' : ''} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

export function Card({ title, hint, children, className = '', action }) {
  return (
    <section className={`dash-card ${className}`}>
      {(title || action) && (
        <div className="dash-card__head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <p>{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, icon }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat__label">
        {icon && <Icon name={icon} />}
        {label}
      </span>
      <span className="dash-stat__value">{value}</span>
      {sub && <span className="dash-stat__sub">{sub}</span>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="dash-loading">
      <div className="dash-spinner" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  return (
    <div className="dash-error" role="alert">
      <strong>Couldn’t load this.</strong> {error?.message}
      {onRetry && (
        <button type="button" className="dash-link" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ icon = 'grid', title, children }) {
  return (
    <div className="dash-empty">
      <Icon name={icon} />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

// Horizontal bars: a ranked list where the bar is the value. One colour, the
// label and number in ink beside it.
export function BarList({ items, max = 8, format = num, empty = 'No data yet.', onPick, labelOf = (i) => i.name }) {
  const [all, setAll] = useState(false);
  if (!items?.length) return <p className="dash-muted">{empty}</p>;
  const top = Math.max(...items.map((i) => i.value), 1);
  const shown = all ? items : items.slice(0, max);
  return (
    <div className="dash-bars">
      {shown.map((item) => (
        <div
          key={item.name}
          className={`dash-bar${onPick ? ' dash-bar--pick' : ''}`}
          onClick={onPick ? () => onPick(item) : undefined}
          title={`${labelOf(item)}: ${format(item.value)}`}
        >
          <span className="dash-bar__fill" style={{ width: `${(item.value / top) * 100}%` }} />
          <span className="dash-bar__label">{labelOf(item)}</span>
          <span className="dash-bar__value">{format(item.value)}</span>
        </div>
      ))}
      {items.length > max && (
        <button type="button" className="dash-link" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const niceMax = (value) => {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / pow) * pow;
};

// Visits per day: an area with a crosshair and tooltip on hover.
export function DailyChart({ data, height = 240 }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { top: 16, right: 12, bottom: 28, left: 40 };
  const w = Math.max(width, 200);
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.visits), 0));
  const x = (i) => pad.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.visits)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / Math.max(2, Math.floor(innerW / 70)));
  const label = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left - pad.left;
    const i = Math.round((px / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <div className="dash-chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label="Visits per day" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} className="dash-gridline" />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="dash-axis">
              {num(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 || i === data.length - 1 ? (
            <text key={d.day} x={x(i)} y={height - 8} textAnchor="middle" className="dash-axis">
              {label(d.day)}
            </text>
          ) : null,
        )}
        <path d={area} className="dash-area" />
        <path d={line} className="dash-line" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} className="dash-cross" />
            <circle cx={x(hover)} cy={y(data[hover].visits)} r="5" className="dash-dot" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="dash-tip" style={{ left: Math.min(x(hover) + 12, w - 170), top: 8 }}>
          <strong>{label(data[hover].day)}</strong>
          <span>
            Visits <b>{num(data[hover].visits)}</b>
          </span>
          <span>
            Visitors <b>{num(data[hover].visitors)}</b>
          </span>
          <span>
            Page views <b>{num(data[hover].pageviews)}</b>
          </span>
          <span>
            Calls, WhatsApp & enquiries <b>{num(data[hover].leads)}</b>
          </span>
        </div>
      )}
    </div>
  );
}

// Visits by hour of the day (India time): columns with a tooltip.
export function HourChart({ hours }) {
  const max = Math.max(...hours.map((h) => h.value), 1);
  const label = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;
  return (
    <div className="dash-hours">
      <div className="dash-hours__cols">
        {hours.map((h) => (
          <div key={h.hour} className="dash-hours__col" title={`${label(h.hour)}: ${num(h.value)} visits`}>
            <span style={{ height: `${Math.max((h.value / max) * 100, h.value ? 4 : 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="dash-hours__axis">
        <span>12 am</span>
        <span>6 am</span>
        <span>12 pm</span>
        <span>6 pm</span>
        <span>11 pm</span>
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dash-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dash-drawer__scrim" onClick={onClose} />
      <div className={`dash-drawer__panel${wide ? ' dash-drawer__panel--wide' : ''}`}>
        <div className="dash-drawer__head">
          <h2>{title}</h2>
          <button type="button" className="dash-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="dash-drawer__body">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`dash-badge dash-badge--${tone}`}>{children}</span>;
}

// Saves rows as a CSV file Excel opens directly.
export function downloadCsv(filename, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = `﻿${rows.map((r) => r.map(escape).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const pageName = (path, title) => (path === '/' ? 'Home' : title || path);
