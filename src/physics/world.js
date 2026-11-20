// Простая 2D-физика для «залипательных» игр: шарики, отрезки, дуги с разрывами и колышки.
// Координаты мира: центр арены в (0, 0), единицы условные (арена ~ радиус 300).

const TAU = Math.PI * 2;

export function normAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

let nextId = 1;

export class Ball {
  constructor({ x = 0, y = 0, vx = 0, vy = 0, r = 10, color = '#fff', hue = 0, data = {} } = {}) {
    this.id = nextId++;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.baseR = r;
    this.color = color; this.hue = hue;
    this.data = data;
    this.flash = 0;     // 0..1, вспышка после удара
    this.trail = [];    // точки для хвоста
  }
  get mass() { return this.r * this.r; }
  get speed() { return Math.hypot(this.vx, this.vy); }
}

export class World {
  constructor({ gravity = 0, restitution = 1, maxSpeed = 1400, minSpeed = 0, substeps = 4 } = {}) {
    this.gravity = gravity;
    this.restitution = restitution;
    this.maxSpeed = maxSpeed;
    this.minSpeed = minSpeed;
    this.substeps = substeps;
    this.balls = [];
    this.segments = [];  // {ax, ay, bx, by, w, id, data}
    this.arcs = [];      // {cx, cy, R, w, start, len, rot, id, data}
    this.pegs = [];      // {x, y, r, id, data}
    this.ballCollisions = true;
    this.onBallBall = null;   // (a, b, impact)
    this.onBallWall = null;   // (ball, wall, impact, type)
  }

  addBall(opts) { const b = new Ball(opts); this.balls.push(b); return b; }
  removeBall(b) { const i = this.balls.indexOf(b); if (i >= 0) this.balls.splice(i, 1); }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const h = dt / this.substeps;
    for (let s = 0; s < this.substeps; s++) this._substep(h);
    for (const b of this.balls) b.flash = Math.max(0, b.flash - dt * 3);
  }

  _substep(h) {
    const balls = this.balls;
    for (const b of balls) {
      b.vy += this.gravity * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > this.maxSpeed) { b.vx *= this.maxSpeed / sp; b.vy *= this.maxSpeed / sp; }
      else if (this.minSpeed && sp < this.minSpeed && sp > 0.001) { b.vx *= this.minSpeed / sp; b.vy *= this.minSpeed / sp; }
      b.x += b.vx * h;
      b.y += b.vy * h;
    }
    for (const b of balls) {
      for (const p of this.pegs) this._circleStatic(b, p.x, p.y, p.r, p, 'peg');
      for (const sg of this.segments) this._segment(b, sg);
      for (const a of this.arcs) this._arc(b, a);
    }
    if (this.ballCollisions) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) this._ballBall(balls[i], balls[j]);
      }
    }
  }

  _bounce(b, nx, ny, wall, type) {
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    const e = wall && wall.restitution != null ? wall.restitution : this.restitution;
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    // Движущаяся стенка (вращение) подталкивает шарик
    if (wall && wall.vx != null) { b.vx += wall.vx * 0.5; b.vy += wall.vy * 0.5; }
    b.flash = 1;
    if (this.onBallWall) this.onBallWall(b, wall, -vn, type);
  }

  _circleStatic(b, x, y, r, wall, type) {
    const dx = b.x - x, dy = b.y - y;
    const d = Math.hypot(dx, dy);
    const min = b.r + r;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = x + nx * min; b.y = y + ny * min;
    this._bounce(b, nx, ny, wall, type);
  }

  _segment(b, s) {
    const ex = s.bx - s.ax, ey = s.by - s.ay;
    const len2 = ex * ex + ey * ey || 1;
    let t = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = s.ax + ex * t, py = s.ay + ey * t;
    const dx = b.x - px, dy = b.y - py;
    const d = Math.hypot(dx, dy);
    const min = b.r + (s.w || 0) / 2;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = px + nx * min; b.y = py + ny * min;
    this._bounce(b, nx, ny, s, 'segment');
  }

  _arc(b, a) {
    const dx = b.x - a.cx, dy = b.y - a.cy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const half = (a.w || 0) / 2;
    if (Math.abs(d - a.R) > b.r + half) return;
    const ang = normAngle(Math.atan2(dy, dx) - (a.rot || 0) - (a.start || 0));
    const len = a.len == null ? TAU : a.len;
    if (ang <= len) {
      // Шарик у сплошной части дуги: отталкиваем в ту сторону, где он сейчас
      const inside = d < a.R;
      const ux = dx / d, uy = dy / d;
      const nx = inside ? -ux : ux, ny = inside ? -uy : uy;
      const target = inside ? a.R - half - b.r : a.R + half + b.r;
      b.x = a.cx + ux * target; b.y = a.cy + uy * target;
      if (a.spin) { a.vx = -uy * a.spin * a.R; a.vy = ux * a.spin * a.R; }
      this._bounce(b, nx, ny, a, 'arc');
    } else {
      // В разрыве: концы дуги работают как маленькие круглые «колпачки»
      const r0 = (a.rot || 0) + (a.start || 0);
      for (const e of [r0, r0 + len]) {
        this._circleStatic(b, a.cx + Math.cos(e) * a.R, a.cy + Math.sin(e) * a.R, half, a, 'arc');
      }
    }
  }

  _ballBall(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d >= min || d === 0) return;
    const nx = dx / d, ny = dy / d;
    const overlap = (min - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap;
    b.x += nx * overlap; b.y += ny * overlap;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv >= 0) return;
    const ma = a.mass, mb = b.mass;
    const j = (-(1 + this.restitution) * rv) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
    b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
    a.flash = b.flash = 1;
    if (this.onBallBall) this.onBallBall(a, b, -rv);
  }
}
