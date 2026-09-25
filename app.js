"use strict";
// KANCHEY — Three-target challenge. Approved launch physics unchanged.
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
let W = 0, H = 0, dpr = 1, scale = 1;
let shooter, targets = [], drag = null, mode = "ready", shotTime = 0, restTime = 0;
let impactFlash = 0, audio = null, lastFrame = 0;
let shots = 0, hits = 0, shotHit = false, resultText = "", resultAge = 0;
let cleared = 0, roundShots = 0, rounds = 1;
const MAX_PULL = 190;
const FRICTION = 1.45; // gentler rolling resistance so deliberate soft shots can reach
const RESTITUTION = 0.86;
const EDGE_BOUNCE = 0.42;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function makeMarble(x, y, r, mass, color) {
  return { x, y, vx: 0, vy: 0, r, mass, color };
}
function reset() {
  const r = clamp(Math.min(W, H) * 0.046, 13, 22);
  shooter = makeMarble(W * 0.5, H * 0.74, r, 1.12, "#1b71d2");
  targets = [
    makeMarble(W * 0.5, H * 0.365, r * 0.95, 1, "#e8bf68"),
    makeMarble(W * 0.28, H * 0.49, r * 0.95, 1, "#e8bf68"),
    makeMarble(W * 0.72, H * 0.49, r * 0.95, 1, "#e8bf68")
  ];
  cleared = 0; roundShots = 0;
  drag = null; mode = "ready"; shotTime = 0; restTime = 0; impactFlash = 0;
}
function resize() {
  const oldW = W, oldH = H;
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.min(W / 390, H / 780);
  // During a resize, restart this single-shot experiment rather than distort circles.
  if (!oldW || Math.abs(oldW - W) > 1 || Math.abs(oldH - H) > 1) reset();
}
window.addEventListener("resize", resize);
function position(e) {
  const box = canvas.getBoundingClientRect();
  return { x: e.clientX - box.left, y: e.clientY - box.top };
}
function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch (_) { audio = null; }
}
function clickSound(intensity) {
  if (!audio) return;
  try {
    const t = audio.currentTime;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(clamp(0.055 + intensity * 0.13, 0.055, 0.18), t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);
    gain.connect(audio.destination);
    [1040, 1660].forEach((hz, i) => {
      const osc = audio.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz * (0.95 + 0.08 * intensity), t);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.65, t + 0.09);
      const partial = audio.createGain();
      partial.gain.value = i ? 0.32 : 0.7;
      osc.connect(partial).connect(gain);
      osc.start(t); osc.stop(t + 0.12);
    });
  } catch (_) { /* muted/unsupported audio must never break the game */ }
}
canvas.addEventListener("pointerdown", e => {
  if (mode !== "ready") return;
  const p = position(e);
  const dist = Math.hypot(p.x - shooter.x, p.y - shooter.y);
  if (dist > Math.max(shooter.r * 2.4, 34)) return;
  unlockAudio();
  drag = { pointerId: e.pointerId, x: p.x, y: p.y };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
canvas.addEventListener("pointermove", e => {
  if (!drag || drag.pointerId !== e.pointerId) return;
  const p = position(e);
  drag.x = p.x; drag.y = p.y;
  e.preventDefault();
});
function release(e, cancelled = false) {
  if (!drag || drag.pointerId !== e.pointerId) return;
  const p = position(e);
  const dx = shooter.x - p.x, dy = shooter.y - p.y;
  const pull = Math.min(MAX_PULL, Math.hypot(dx, dy));
  drag = null;
  if (cancelled || pull < 8) return;
  const power = pull / MAX_PULL;
  // Calibrate travel to the actual shooter-to-target gap on this screen.
  // At gentle pulls the marble barely reaches; stronger pulls retain momentum on impact.
  // Use the approved FAR-target calibration as a fixed baseline for all angles.
  const far = targets[0];
  const targetGap = Math.max(1, Math.hypot(far.x - shooter.x, far.y - shooter.y) - shooter.r - far.r);
  const reachSpeed = FRICTION * (targetGap + 12);
  const speed = reachSpeed * (1.04 + 1.22 * Math.pow(power, 1.4));
  const norm = Math.hypot(dx, dy) || 1;
  shooter.vx = (dx / norm) * speed;
  shooter.vy = (dy / norm) * speed;
  mode = "moving"; shotTime = 0; restTime = 0;
  shots++; roundShots++; shotHit = false; resultText = ""; resultAge = 0;
  e.preventDefault();
}
canvas.addEventListener("pointerup", e => release(e));
canvas.addEventListener("pointercancel", e => release(e, true));
window.addEventListener("blur", () => { drag = null; lastFrame = 0; });
function wall(ball) {
  const pad = ball.r + 8;
  if (ball.x < pad) { ball.x = pad; ball.vx = Math.abs(ball.vx) * EDGE_BOUNCE; }
  if (ball.x > W - pad) { ball.x = W - pad; ball.vx = -Math.abs(ball.vx) * EDGE_BOUNCE; }
  if (ball.y < pad + 38) { ball.y = pad + 38; ball.vy = Math.abs(ball.vy) * EDGE_BOUNCE; }
  if (ball.y > H - pad) { ball.y = H - pad; ball.vy = -Math.abs(ball.vy) * EDGE_BOUNCE; }
}
function collide(a, b, scoreHit = false) {
  let dx = b.x - a.x, dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);
  const minimum = a.r + b.r;
  if (distance >= minimum) return;
  if (distance < 0.0001) { dx = 1; dy = 0; distance = 1; }
  const nx = dx / distance, ny = dy / distance;
  const overlap = minimum - distance;
  const sum = a.mass + b.mass;
  a.x -= nx * overlap * (b.mass / sum);
  a.y -= ny * overlap * (b.mass / sum);
  b.x += nx * overlap * (a.mass / sum);
  b.y += ny * overlap * (a.mass / sum);
  const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (approach >= 0) return;
  const impulse = -(1 + RESTITUTION) * approach / (1 / a.mass + 1 / b.mass);
  a.vx -= impulse * nx / a.mass; a.vy -= impulse * ny / a.mass;
  b.vx += impulse * nx / b.mass; b.vy += impulse * ny / b.mass;
  const strength = clamp(-approach / 440, 0, 1);
  clickSound(strength);
  impactFlash = 0.16;
  if (scoreHit && !b.cleared) {
    b.cleared = true; cleared++; hits++; shotHit = true;
    resultText = cleared === 3 ? "ALL THREE!" : "HIT!"; resultAge = 0;
  }
}
function update(dt) {
  impactFlash = Math.max(0, impactFlash - dt);
  if (resultText) resultAge += dt;
  if (mode !== "moving") return;
  shotTime += dt;
  // Substeps reduce tunnelling on small screens and strong flicks.
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    for (const b of [shooter, ...targets.filter(t => !t.cleared)]) {
      b.x += b.vx * step; b.y += b.vy * step;
      const decay = Math.exp(-FRICTION * step);
      b.vx *= decay; b.vy *= decay;
      wall(b);
    }
    for (const t of targets) if (!t.cleared) collide(shooter, t, true);
    for (let a = 0; a < targets.length; a++)
      for (let b = a + 1; b < targets.length; b++)
        if (!targets[a].cleared && !targets[b].cleared) collide(targets[a], targets[b], false);
  }
  const stopped = [shooter, ...targets.filter(t => !t.cleared)].every(b => Math.hypot(b.vx, b.vy) < 11);
  if (stopped) restTime += dt;
  else restTime = 0;
  if ((restTime > 0.65 && shotTime > 0.75) || shotTime > 7) {
    if (!shotHit) { resultText = "MISS"; resultAge = 0; }
    // Keep cleared targets out of subsequent shots; restart the shooter only.
    if (cleared === 3) {
      rounds++; reset();
    } else {
      const r = shooter.r;
      shooter = makeMarble(W * 0.5, H * 0.74, r, 1.12, "#1b71d2");
      for (const t of targets) { t.vx = 0; t.vy = 0; }
      mode = "ready"; shotTime = 0; restTime = 0; impactFlash = 0;
    }
  }
}
function drawBall(b) {
  // Procedural Canvas shading only. No production artwork.
  const grad = ctx.createRadialGradient(b.x - b.r * 0.36, b.y - b.r * 0.43, b.r * 0.08, b.x, b.y, b.r);
  if (b === shooter) {
    grad.addColorStop(0, "#c4e8ff"); grad.addColorStop(0.34, "#3a9df1"); grad.addColorStop(1, "#12427e");
  } else {
    grad.addColorStop(0, "#fff6c9"); grad.addColorStop(0.36, "#efcc74"); grad.addColorStop(1, "#98612b");
  }
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(255,255,255,.52)"; ctx.stroke();
}
function render() {
  ctx.fillStyle = "#b98252"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#55361f";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.letterSpacing = "1.6px";
  ctx.fillText("KANCHEY — SHOT TEST", W / 2, Math.max(35, H * 0.09));
  ctx.font = "600 17px system-ui, sans-serif";
  ctx.fillText("HITS " + hits + " / " + shots, W / 2, Math.max(63, H * 0.14));
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText("ROUND " + rounds + "  •  CLEARED " + cleared + "/3  •  SHOTS " + roundShots, W / 2, Math.max(87, H * 0.18));
  if (resultText && resultAge < 1.2) {
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillStyle = resultText === "HIT!" ? "#f7e9b1" : "#55361f";
    ctx.fillText(resultText, W / 2, H * 0.54);
    ctx.fillStyle = "#55361f";
  }
  ctx.letterSpacing = "0px";
  for (const t of targets) {
    if (t.cleared) continue;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(91,58,31,.48)"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (drag) {
    const dx = shooter.x - drag.x, dy = shooter.y - drag.y;
    const raw = Math.hypot(dx, dy);
    const pull = Math.min(MAX_PULL, raw);
    if (raw > 2) {
      const nx = dx / raw, ny = dy / raw;
      ctx.beginPath();
      ctx.moveTo(shooter.x + nx * (shooter.r + 5), shooter.y + ny * (shooter.r + 5));
      ctx.lineTo(shooter.x + nx * (shooter.r + 20 + pull * 0.58), shooter.y + ny * (shooter.r + 20 + pull * 0.75));
      ctx.strokeStyle = "rgba(255,255,255,.82)";
      ctx.lineWidth = 2.5; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(shooter.x, shooter.y, shooter.r + 6 + pull * 0.06, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.36)"; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  for (const t of targets) if (!t.cleared) drawBall(t);
  drawBall(shooter);
  if (impactFlash > 0) {
    for (const t of targets) {
      if (!t.cleared) continue;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + (0.16 - impactFlash) * 90, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + (impactFlash / 0.16 * 0.8) + ")";
      ctx.lineWidth = 2; ctx.stroke();
    }
  }
}
function loop(time) {
  if (!lastFrame) lastFrame = time;
  const dt = clamp((time - lastFrame) / 1000, 0, 0.04);
  lastFrame = time;
  update(dt); render();
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
