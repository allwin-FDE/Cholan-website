import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useDash } from '../context.js';
import { BarList, Card, Empty, ErrorNote, Icon, Loading, PageHead, num, pageName, useLoad } from '../ui.jsx';

// The page is shown live in a frame at a typical screen size, with the
// clicks painted over it. A click is stored as a share of the screen width
// and a position down the page, so it lands in the right place here even if
// the visitor's screen was a different size.
const FRAMES = {
  Desktop: { width: 1366, height: 860, label: 'Desktop', icon: 'desktop' },
  Mobile: { width: 390, height: 780, label: 'Mobile', icon: 'mobile' },
};
const MODES = [
  { key: 'heat', label: 'Heat', hint: 'Warmer = more clicks' },
  { key: 'dots', label: 'Each click' },
  { key: 'scroll', label: 'Scroll depth' },
];

// One hue family, light to dark: few clicks pale yellow, most deep red.
const RAMP = [
  [255, 236, 160],
  [255, 196, 70],
  [245, 140, 30],
  [222, 74, 22],
  [168, 18, 18],
];

function rampColor(t) {
  const pos = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(i + 1, RAMP.length - 1)];
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}

export default function Heatmaps() {
  const { days } = useDash();
  const [params, setParams] = useSearchParams();
  const path = params.get('path') || '/';
  const [device, setDevice] = useState('Desktop');
  const [mode, setMode] = useState('heat');
  const pagesLoad = useLoad(() => api.pages(days), [days]);
  const { data, loading, error, reload } = useLoad(() => api.heatmap(days, path, device), [days, path, device]);

  const pages = pagesLoad.data?.pages || [];
  const options = pages.some((p) => p.path === path) ? pages : [{ path, title: '' }, ...pages];

  return (
    <div className="dash-page">
      <PageHead title="Heatmaps" intro="Where people click and how far they scroll, drawn over the real page." />
      <div className="dash-filters">
        <select value={path} onChange={(e) => setParams({ path: e.target.value })} aria-label="Page" className="dash-select-wide">
          {options.map((p) => (
            <option key={p.path} value={p.path}>
              {pageName(p.path, p.title)} {p.views ? `— ${num(p.views)} views` : ''}
            </option>
          ))}
        </select>
        <div className="dash-seg" role="group" aria-label="Device">
          {Object.values(FRAMES).map((f) => (
            <button key={f.label} type="button" className={device === f.label ? 'is-on' : ''} onClick={() => setDevice(f.label)}>
              <Icon name={f.icon} /> {f.label}
            </button>
          ))}
        </div>
        <div className="dash-seg" role="group" aria-label="View">
          {MODES.map((m) => (
            <button key={m.key} type="button" className={mode === m.key ? 'is-on' : ''} onClick={() => setMode(m.key)} title={m.hint}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      <div className="dash-heat">
        <div className="dash-heat__stage">
          <HeatFrame path={path} frame={FRAMES[device]} data={data} mode={mode} />
          {mode === 'heat' && (
            <div className="dash-heat__legend" aria-hidden="true">
              <span>Fewer clicks</span>
              <i />
              <span>More clicks</span>
            </div>
          )}
        </div>
        <aside className="dash-heat__side">
          {loading && !data && <Loading />}
          {data && (
            <>
              <div className="dash-heat__nums">
                <div>
                  <strong>{num(data.views)}</strong>
                  <span>views</span>
                </div>
                <div>
                  <strong>{num(data.clicks.length)}</strong>
                  <span>clicks</span>
                </div>
              </div>
              {!data.views && (
                <Empty icon="flame" title={`No ${device.toLowerCase()} visits to this page yet`}>
                  Pick another page, device or a longer period.
                </Empty>
              )}
              {data.views > 0 && (
                <>
                  <Card title="Most clicked" hint="Buttons, links and areas, most first.">
                    <BarList items={data.elements} max={10} empty="No clicks yet." />
                  </Card>
                  <Card title="How far people scroll" hint="Share of visitors who saw at least this much of the page.">
                    <div className="dash-reach">
                      {data.reach.map((r) => (
                        <div key={r.depth} className="dash-reach__row">
                          <span>{r.depth}%</span>
                          <span className="dash-reach__bar">
                            <i style={{ width: `${r.share}%` }} />
                          </span>
                          <b>{r.share}%</b>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function HeatFrame({ path, frame, data, mode }) {
  const wrapRef = useRef(null);
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [docHeight, setDocHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [ready, setReady] = useState(false);

  // Fit the frame to the space available.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / frame.width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame.width]);

  // Follow the page inside the frame: its full height and where it is scrolled.
  useEffect(() => {
    setReady(false);
    setScrollY(0);
    const iframe = frameRef.current;
    if (!iframe) return undefined;
    let timer;
    let win;
    const measure = () => {
      try {
        const doc = iframe.contentDocument?.documentElement;
        if (doc) setDocHeight(Math.min(doc.scrollHeight, 30000));
      } catch {
        /* not ready */
      }
    };
    const onScroll = () => setScrollY(win.scrollY);
    const onLoad = () => {
      win = iframe.contentWindow;
      win.addEventListener('scroll', onScroll, { passive: true });
      measure();
      setReady(true);
      // Images and fonts settle after load.
      timer = setInterval(measure, 1500);
    };
    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      win?.removeEventListener('scroll', onScroll);
      clearInterval(timer);
    };
  }, [path, frame.width]);

  // Paint the clicks for the whole page once; scrolling only moves the canvas.
  const points = useMemo(() => {
    if (!data || !docHeight) return [];
    return data.clicks
      .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y))
      .map((c) => ({ x: c.x * frame.width, y: c.dh ? (c.y / c.dh) * docHeight : c.y }));
  }, [data, docHeight, frame.width]);

  const res = docHeight > 16000 ? 16000 / docHeight : 1; // canvas size limit

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !docHeight) return;
    const w = Math.round(frame.width * res);
    const h = Math.round(docHeight * res);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (mode === 'heat' && points.length) {
      // Pass 1: build up density in the alpha channel.
      const radius = (frame.width < 600 ? 22 : 30) * res;
      for (const p of points) {
        const g = ctx.createRadialGradient(p.x * res, p.y * res, 0, p.x * res, p.y * res, radius);
        g.addColorStop(0, 'rgba(0,0,0,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(p.x * res - radius, p.y * res - radius, radius * 2, radius * 2);
      }
      // Pass 2: colour by density, relative to the busiest spot.
      const img = ctx.getImageData(0, 0, w, h);
      let max = 0;
      for (let i = 3; i < img.data.length; i += 4) max = Math.max(max, img.data[i]);
      for (let i = 0; i < img.data.length; i += 4) {
        const a = img.data[i + 3];
        if (!a) continue;
        const t = a / max;
        const [r, g, b] = rampColor(t);
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = Math.round(70 + t * 160);
      }
      ctx.putImageData(img, 0, 0);
    } else if (mode === 'dots') {
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x * res, p.y * res, 6 * res, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(214, 64, 20, 0.75)';
        ctx.fill();
        ctx.lineWidth = 2 * res;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    } else if (mode === 'scroll' && data) {
      // Darken the page below where most people stopped, with a line at each step.
      const shareAt = (depth) => {
        const steps = data.reach;
        let share = 100;
        for (const s of steps) if (s.depth <= depth) share = s.share;
        return share;
      };
      for (let y = 0; y < h; y += 4) {
        // Depth is measured at the bottom of the visitor's screen.
        const depth = (y / res / docHeight) * 100;
        const share = depth <= 10 ? 100 : shareAt(depth);
        ctx.fillStyle = `rgba(20, 30, 25, ${((100 - share) / 100) * 0.55})`;
        ctx.fillRect(0, y, w, 4);
      }
      ctx.font = `${Math.round(13 * res * (frame.width < 600 ? 1 : 1.1))}px system-ui, sans-serif`;
      for (const r of data.reach.filter((s) => s.depth >= 25 && s.depth < 100)) {
        const y = Math.min((r.depth / 100) * docHeight, docHeight - 40) * res;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(0, y - 1, w, 2);
        const text = `${r.share}% of visitors scrolled this far`;
        ctx.fillStyle = 'rgba(17, 41, 28, 0.9)';
        const tw = ctx.measureText(text).width + 16 * res;
        ctx.fillRect(8 * res, y + 6 * res, tw, 24 * res);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 16 * res, y + 23 * res);
      }
    }
  }, [points, mode, docHeight, frame.width, frame.height, res, data]);

  const src = `${path}${path.includes('?') ? '&' : '?'}heatmap=1`;

  return (
    <div className="dash-heat__wrap" ref={wrapRef} style={{ height: frame.height * scale }}>
      <div className="dash-heat__scaler" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}>
        <iframe key={`${path}-${frame.width}`} ref={frameRef} src={src} title={`Preview of ${path}`} width={frame.width} height={frame.height} />
        <div className="dash-heat__overlay">
          <canvas
            ref={canvasRef}
            style={{ width: frame.width, height: docHeight || frame.height, transform: `translateY(${-scrollY}px)` }}
          />
        </div>
        {!ready && (
          <div className="dash-heat__cover">
            <Loading label="Loading the page…" />
          </div>
        )}
      </div>
      <p className="dash-heat__tip">Scroll inside the page to see clicks further down.</p>
    </div>
  );
}
