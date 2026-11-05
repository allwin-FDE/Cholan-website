// Gold dust hanging in the air of the Rice Hall, and glints around each bag.
// Every speck has a place in the room (wall = radius 1), and the eye sits a
// little ahead of the point it turns about, as a head does on a neck. So nearer
// specks are larger and softer, and sweep past faster than the wall.
const EYE_AHEAD = 0.14;
const NEAREST = 0.09;
const DUST_DESKTOP = 230;
const DUST_PHONE = 120;
const GLINTS_PER_BAG = 12;

function sprite(paint) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  paint(c.getContext('2d'));
  return c;
}

const soft = sprite((g) => {
  const glow = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, '#fff3c8ff');
  glow.addColorStop(0.22, '#ffd777cc');
  glow.addColorStop(0.6, '#e9a93a33');
  glow.addColorStop(1, '#e9a93a00');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
});

const star = sprite((g) => {
  g.drawImage(soft, 44, 44, 40, 40);
  g.globalCompositeOperation = 'lighter';
  for (const turn of [0, Math.PI / 2]) {
    g.save();
    g.translate(64, 64);
    g.rotate(turn);
    const ray = g.createLinearGradient(-64, 0, 64, 0);
    ray.addColorStop(0, '#fff0c000');
    ray.addColorStop(0.5, '#fffbe8ff');
    ray.addColorStop(1, '#fff0c000');
    g.fillStyle = ray;
    g.beginPath();
    g.moveTo(-64, 0);
    g.quadraticCurveTo(0, -5, 64, 0);
    g.quadraticCurveTo(0, 5, -64, 0);
    g.fill();
    g.restore();
  }
});

const rand = (min, max) => min + Math.random() * (max - min);

export function createDust(canvas, { stops, floor, top, halfWidth }) {
  const g = canvas.getContext('2d');
  const specks = [];
  const count = window.innerWidth > 700 ? DUST_DESKTOP : DUST_PHONE;

  for (let i = 0; i < count; i++) {
    const r = 0.3 + Math.random() ** 0.7 * 0.68;
    const glint = Math.random() < 0.22;
    specks.push({
      around: rand(0, Math.PI * 2),
      r,
      h: rand(-0.72, 0.72) * r,
      range: 0.72 * r,
      rise: rand(0.004, 0.018) * r,
      wander: rand(0.2, 0.5),
      phase: rand(0, 6.28),
      twinkle: rand(0.5, 1.6),
      size: glint ? rand(0.028, 0.06) : rand(0.006, 0.015),
      glint,
    });
  }
  // The glints that catch the light around each bag.
  stops.forEach((at) => {
    for (let i = 0; i < GLINTS_PER_BAG; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      specks.push({
        around: at + side * rand(0.45, 1.25) * halfWidth,
        r: 0.92,
        h: rand(floor * 0.7, top * 1.25),
        range: 0,
        rise: 0,
        wander: 0,
        phase: rand(0, 6.28),
        twinkle: rand(0.45, 1),
        size: rand(0.06, 0.12),
        glint: true,
        fixed: true,
      });
    }
  });

  let width = 0;
  let height = 0;
  let toPx = 1;

  return {
    resize(w, h, scale, px) {
      width = w;
      height = h;
      toPx = px;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      g.setTransform(scale, 0, 0, scale, 0, 0);
    },
    render({ yaw, look, pitch }, time) {
      g.clearRect(0, 0, width, height);
      g.globalCompositeOperation = 'lighter';
      const view = yaw + look;
      for (const s of specks) {
        const off = s.around + (s.wander ? Math.sin(time * s.wander + s.phase) * 0.012 : 0) - view;
        const z = s.r * Math.cos(off) - EYE_AHEAD;
        if (z < NEAREST) continue;
        const x = s.r * Math.sin(off) - look * 0.5;
        const up = s.range
          ? ((s.h + s.rise * time + s.range) % (s.range * 2)) - s.range
          : s.h;
        const size = Math.min(110, (s.size / z) * toPx);
        const sx = width / 2 + (x / z) * toPx;
        const sy = height / 2 - ((up + pitch * 0.4) / z) * toPx;
        if (sx < -size || sx > width + size || sy < -size || sy > height + size) continue;

        const wave = Math.sin(time * s.twinkle + s.phase) * 0.5 + 0.5;
        // Dust shimmers all the time; a glint flashes, then rests.
        let alpha = s.glint ? wave ** 3 : 0.45 + wave * 0.55;
        alpha *= s.fixed ? 1 : Math.min(1, (s.r - 0.2) * 1.5);
        if (z < 0.42 && !s.fixed) alpha *= 0.42; // close to the eye: out of focus
        if (alpha < 0.02) continue;
        g.globalAlpha = alpha;
        const grow = s.glint ? 0.65 + wave * 0.35 : 1;
        const d = size * grow;
        g.drawImage(s.glint ? star : soft, sx - d / 2, sy - d / 2, d, d);
      }
      g.globalAlpha = 1;
    },
  };
}
