import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from '../../lib/gsap.js';
import { products } from '../../data/products.js';
import { createDust } from './hallDust.js';

// The visitor stands in the middle of a round hall and turns to face each bag.
// The hall is one picture wrapped around them (scripts/build-rice-hall.py), so
// its strip is a slot of 120 degrees per bag, with the bag's courtyard centred.
const STOPS = [
  { id: 'chennai-pattanam-rice', bag: '/images/stage-chennai-pattanam.webp' },
  { id: 'moongil-ponni', bag: '/images/stage-moongil-poompuhar.webp' },
  { id: 'karikalan-rice', bag: '/images/stage-karikalan.webp' },
].map((stop) => ({ ...stop, product: products.find((p) => p.id === stop.id) }));

const TURN = (Math.PI * 2) / STOPS.length;
const FIRST = TURN / 2; // the first courtyard's centre, along the strip
const STRIP_W = 6144;
const STRIP_H = 1672;
const WALL_H = (STRIP_H / STRIP_W) * Math.PI * 2; // the wall's height, for a radius of 1
const VISIBLE = 0.85; // how much of that height fills the screen
const TAN_V = (VISIBLE * WALL_H) / 2;
const BAG_FLOOR = 0.655; // where the stand's top is, down the strip
const BAG_H = 0.31; // the bag's height, as a share of the strip
const BAG_ASPECT = 0.69;

const VERTEX = `#version 300 es
in vec2 corner;
out vec2 p;
void main() { p = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

// Follows each pixel's line of sight until it meets the round wall.
const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D wall;
uniform vec2 tanFov;
uniform float yaw;
uniform float wallH;
in vec2 p;
out vec4 color;
void main() {
  vec2 ray = p * tanFov;
  float around = yaw + atan(ray.x);
  float up = ray.y / sqrt(ray.x * ray.x + 1.0);
  color = texture(wall, vec2(around / 6.28318530718, 0.5 - up / wallH));
}`;

function startGl(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return null;
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const corner = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, 'wallH'), WALL_H);
  return {
    gl,
    tanFov: gl.getUniformLocation(program, 'tanFov'),
    yaw: gl.getUniformLocation(program, 'yaw'),
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

export default function RiceHall() {
  const hallRef = useRef(null);
  const canvasRef = useRef(null);
  const dustRef = useRef(null);
  const bagsRef = useRef([]);
  const view = useRef({ yaw: FIRST, look: 0, pitch: 0 });
  const stepRef = useRef(0); // keeps counting past the last bag, so Next always turns the same way
  const drawRef = useRef(() => {});
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hall = hallRef.current;
    const canvas = canvasRef.current;
    const scene = startGl(canvas);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bagFloor = (BAG_FLOOR - 0.5) * WALL_H;
    const dust = createDust(dustRef.current, {
      stops: STOPS.map((_, i) => FIRST + i * TURN),
      floor: -bagFloor,
      top: BAG_H * WALL_H - bagFloor,
      halfWidth: (BAG_H * WALL_H * BAG_ASPECT) / 2,
    });
    let width = 0;
    let height = 0;
    let loaded = false;

    const draw = () => {
      if (!width) return;
      const yaw = view.current.yaw + view.current.look;
      const tanH = (TAN_V * width) / height;
      if (scene && loaded) {
        scene.gl.uniform2f(scene.tanFov, tanH, TAN_V);
        scene.gl.uniform1f(scene.yaw, yaw);
        scene.gl.drawArrays(scene.gl.TRIANGLES, 0, 3);
      }
      // Each bag is pinned to its stand, so it moves with the wall.
      STOPS.forEach((_, i) => {
        const el = bagsRef.current[i];
        if (!el) return;
        const off = wrapAngle(FIRST + i * TURN - yaw);
        const near = Math.cos(off);
        const shown = 1 - smooth((Math.abs(off) - 0.12) / 0.5);
        if (near < 0.2 || shown <= 0) {
          el.style.visibility = 'hidden';
          return;
        }
        const toPx = height / 2 / TAN_V;
        const bagH = BAG_H * WALL_H * toPx;
        // Nearer than the wall: it runs a little ahead of it, and turns to face the visitor.
        const x = width / 2 + (Math.sin(off) / near) * toPx * 1.12 - view.current.look * toPx * 0.2;
        const y = height / 2 + (bagFloor / near) * toPx;
        const faceY = -(off * 34 + view.current.look * 120);
        const faceX = -view.current.pitch * 90;
        el.style.visibility = 'visible';
        el.style.height = `${bagH}px`;
        el.style.width = `${bagH * BAG_ASPECT}px`;
        el.style.opacity = shown;
        el.style.transform = `translate3d(${x - (bagH * BAG_ASPECT) / 2}px, ${y - bagH}px, 0) perspective(${bagH * 3}px) rotateX(${faceX}deg) rotateY(${faceY}deg) scale(${1 / near})`;
      });
      if (still) dust.render(view.current, 0);
    };
    drawRef.current = draw;

    const resize = () => {
      width = hall.clientWidth;
      height = hall.clientHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      scene?.gl.viewport(0, 0, canvas.width, canvas.height);
      dust.resize(width, height, scale, height / 2 / TAN_V);
      draw();
    };
    const sizes = new ResizeObserver(resize);
    sizes.observe(hall);
    resize();

    // The wall is the heaviest picture on the page: fetched only as it nears the screen.
    let image = null;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || !scene) return;
        watch.disconnect();
        const { gl } = scene;
        const big = window.innerWidth > 900 && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= STRIP_W;
        image = new Image();
        image.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          loaded = true;
          draw();
          setReady(true);
        };
        image.src = big ? '/images/rice-hall.webp' : '/images/rice-hall-sm.webp';
      },
      { rootMargin: '600px' },
    );
    watch.observe(hall);

    // The dust keeps moving, but only while the hall is on screen.
    const moveDust = (time) => dust.render(view.current, time);
    const onScreen = new IntersectionObserver(([entry]) => {
      if (still) return;
      if (entry.isIntersecting) gsap.ticker.add(moveDust);
      else gsap.ticker.remove(moveDust);
    });
    onScreen.observe(hall);

    return () => {
      sizes.disconnect();
      watch.disconnect();
      onScreen.disconnect();
      gsap.ticker.remove(moveDust);
      if (image) image.onload = null;
      gsap.killTweensOf(view.current);
    };
  }, []);

  const turnTo = (step) => {
    stepRef.current = step;
    setActive(((step % STOPS.length) + STOPS.length) % STOPS.length);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.to(view.current, {
      yaw: FIRST + step * TURN,
      duration: reduced ? 0 : 1.7,
      ease: 'power2.inOut',
      overwrite: 'auto',
      onUpdate: () => drawRef.current(),
    });
  };

  // Dragging looks around; letting go after a real swipe moves on one bag or more.
  const drag = useRef(null);
  const onPointerDown = (e) => {
    if (e.target.closest('a, button')) return;
    gsap.killTweensOf(view.current, 'yaw');
    drag.current = { x: e.clientX, yaw: view.current.yaw };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (drag.current) {
      const perPx = (TAN_V * 2) / box.height;
      view.current.yaw = drag.current.yaw - (e.clientX - drag.current.x) * perPx;
      drawRef.current();
    } else if (e.pointerType === 'mouse') {
      // A slight turn of the head towards the cursor.
      const look = ((e.clientX - box.left) / box.width - 0.5) * 0.09;
      const pitch = ((e.clientY - box.top) / box.height - 0.5) * 0.06;
      gsap.to(view.current, { look, pitch, duration: 0.9, ease: 'power2.out', overwrite: 'auto', onUpdate: () => drawRef.current() });
    }
  };
  const onPointerUp = (e) => {
    if (!drag.current) return;
    const { x, yaw } = drag.current;
    drag.current = null;
    const from = Math.round((yaw - FIRST) / TURN);
    const swiped = e.clientX - x;
    const steps = Math.round((view.current.yaw - yaw) / TURN) || (Math.abs(swiped) > 60 ? -Math.sign(swiped) : 0);
    turnTo(from + steps);
  };

  const current = STOPS[active];
  return (
    <section
      className={`hall${ready ? ' is-ready' : ''}`}
      ref={hallRef}
      aria-roledescription="carousel"
      aria-label="Our rice, in the Cholan hall"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas className="hall__wall" ref={canvasRef} aria-hidden="true" />
      <div className="hall__haze" aria-hidden="true" />
      {STOPS.map((stop, i) => (
        <img
          key={stop.id}
          ref={(el) => {
            bagsRef.current[i] = el;
          }}
          className="hall__bag"
          src={stop.bag}
          alt={i === active ? `${stop.product.name} rice bag` : ''}
          draggable="false"
          loading="lazy"
        />
      ))}
      <canvas className="hall__dust" ref={dustRef} aria-hidden="true" />
      <div className="hall__text" key={current.id} aria-live="polite">
        <h2 className="hall__name">{current.product.name}</h2>
        {current.product.tamil && (
          <p className="hall__tamil" lang="ta">
            {current.product.tamil}
          </p>
        )}
      </div>
      <div className="hall__foot">
        <Link to={`/products/${current.id}`} className="hall__discover">
          Discover
        </Link>
        <div className="hall__arrows">
          <button type="button" aria-label="Previous rice" onClick={() => turnTo(stepRef.current - 1)}>
            ←
          </button>
          <button type="button" aria-label="Next rice" onClick={() => turnTo(stepRef.current + 1)}>
            →
          </button>
        </div>
      </div>
    </section>
  );
}
