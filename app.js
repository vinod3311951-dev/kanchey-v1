"use strict";
// KANCHEY — black striker makes a short visible hop, lands, then rolls.
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
let W = 0, H = 0, dpr = 1, scale = 1;
let shooter, targets = [], drag = null, mode = "ready", shotTime = 0, restTime = 0;
let hopZ = 0, hopV = 0, landedOnce = false;
let reward = null, collectionOpen = false, postFlick = 0;
let coinBursts = [], levelBurst = [];
const collection = { found: Array(12).fill(false), total: 0 };
const REWARD_COLORS = ["#efc94c","#d45b48","#4f9bd8","#6ab66d","#a978cf","#e8914b","#55b9ae","#d9789c","#8b744e","#d8d8d0","#6688bd","#c9a457"];
let lastSpawnX = 0;
let impactFlash = 0, audio = null, lastFrame = 0;
let shots = 0, hits = 0, shotHit = false, resultText = "", resultAge = 0;
let cleared = 0, roundShots = 0, rounds = 1;
let bestShots = null, completedShots = 0, celebrationAge = 0;
const CHAPTERS=["First Flick","Glass Garden","Crossfire","Long Shot","Tricky Angles","Master's Yard","Kancha Dominion"];
const TOTAL_LEVELS=105;
let level=1, levelPicker=false, musicOn=true, musicGain=null, musicNext=0, musicStep=0;
const bestByLevel=Array(TOTAL_LEVELS).fill(null);
const clampLevel=n=>Math.max(1,Math.min(TOTAL_LEVELS,n));
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
  shooter = makeMarble(W * 0.5, H * 0.74, r, 1.12, "#111318");
  // All 105 levels are selectable; three targets remain constant.
  const chapter=Math.floor((level-1)/15), stage=(level-1)%15;
  const spread=.17+Math.min(chapter*.018+stage*.003,.12);
  const shift=((stage*7+chapter*3)%9-4)*.012;
  const top=.355-Math.min(chapter*.009+stage*.001,.065);
  const targetScale=Math.max(.62,.95-chapter*.038-stage*.004);
  targets=[
    makeMarble(W*(.5+shift),H*top,r*targetScale,1,chapter%2?"#257fc0":"#249e72"),
    makeMarble(W*(.5-spread),H*(.475+((stage%3)-1)*.018),r*targetScale,1,"#257fc0"),
    makeMarble(W*(.5+spread),H*(.485+((stage%4)-1.5)*.014),r*targetScale,1,"#249e72")
  ];
  cleared = 0; roundShots = 0;
  drag = null; mode = "ready"; shotTime = 0; restTime = 0; impactFlash = 0;
  hopZ = 0; hopV = 0; landedOnce = false;
  lastSpawnX = shooter.x;
  if(level>1)placeShooterChallenge();
  reward = null; postFlick = 0;
}
function placeShooterChallenge() {
  const margin = Math.max(shooter.r * 4.8, W * 0.22);
  const minY = Math.max(H * 0.61, H * 0.5 + shooter.r * 3);
  const maxY = H - Math.max(shooter.r * 5.2, H * 0.20);
  let bestX = W * 0.5, bestY = H * 0.76, bestScore = -1;
  for (let i = 0; i < 18; i++) {
    const x = margin + Math.random() * Math.max(1, W - margin * 2);
    const y = minY + Math.random() * Math.max(1, maxY - minY);
    const nearest = Math.min(...targets.filter(t=>!t.cleared).map(t=>Math.hypot(t.x-x,t.y-y)));
    const sideChange = Math.abs(x-lastSpawnX);
    if (nearest < shooter.r * 3.2) continue;
    const score = nearest + sideChange * 0.42;
    if (score > bestScore) { bestScore=score; bestX=x; bestY=y; }
  }
  shooter.x=bestX; shooter.y=bestY; shooter.vx=0; shooter.vy=0; lastSpawnX=bestX;
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
function setupMusic(){
  if(!audio)return;
  if(!musicGain){musicGain=audio.createGain();musicGain.gain.value=0;musicGain.connect(audio.destination);}
  musicGain.gain.setTargetAtTime(musicOn?.13:0,audio.currentTime,.15);
  if(musicOn)musicNext=audio.currentTime+.08;
}
function updateMusic(){
  if(!musicOn||!audio||!musicGain||audio.state!=="running")return;
  // Original, generated-in-code quiet pentatonic ambience: no third-party samples or recording.
  const notes=[196,246.94,293.66,329.63,392,329.63,293.66,246.94,220,261.63,329.63,392,329.63,261.63,220,196];
  while(musicNext<audio.currentTime+.20){
    const start=Math.max(musicNext,audio.currentTime+.01),freq=notes[musicStep%notes.length];
    const osc=audio.createOscillator(),env=audio.createGain();
    osc.type="sine";osc.frequency.setValueAtTime(freq,start);
    env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(.28,start+.13);
    env.gain.exponentialRampToValueAtTime(.0001,start+1.6);
    osc.connect(env).connect(musicGain);osc.start(start);osc.stop(start+1.65);
    musicStep++;musicNext=start+.65;
  }
}
function rewardSound(kind=0) {
  if(!audio)return;
  try{
    const t=audio.currentTime, notes=kind?[523,659,784,1047]:[880,1175,1568];
    notes.forEach((hz,i)=>{
      const o=audio.createOscillator(),g=audio.createGain(),start=t+i*.065;
      o.type=kind?"triangle":"sine";o.frequency.setValueAtTime(hz,start);
      g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(kind?.045:.032,start+.008);
      g.gain.exponentialRampToValueAtTime(.0001,start+.19);
      o.connect(g).connect(audio.destination);o.start(start);o.stop(start+.2);
    });
  }catch(_){}
}
function spawnCoins(x,y) {
  for(let i=0;i<9;i++)coinBursts.push({x,y,vx:(i-4)*35+(Math.random()-.5)*24,vy:-130-Math.random()*85,age:0,spin:Math.random()*6.28});
  rewardSound(0);
}
function spawnLevelBurst() {
  const colors=["#00a7c7","#087f5b","#6c4bd3","#ff8a3d","#e83e6f","#ffd43b"];
  // 🎉-style full-screen confetti cannon from both lower corners.
  for(let i=0;i<150;i++){
    const left=i%2===0;
    levelBurst.push({x:left?18:W-18,y:H*.72+Math.random()*40,vx:(left?1:-1)*(70+Math.random()*310),vy:-210-Math.random()*430,age:0,color:colors[i%colors.length],spin:Math.random()*6.28,rect:i%3!==0});
  }
  rewardSound(1);
}
function updateFX(dt){
  for(const c of coinBursts){c.age+=dt;c.vy+=300*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.spin+=dt*10}
  coinBursts=coinBursts.filter(c=>c.age<.95);
  for(const p of levelBurst){p.age+=dt;p.vy+=240*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.spin+=dt*8}
  levelBurst=levelBurst.filter(p=>p.age<2.3);
}
function drawFX(){
  ctx.save();
  for(const c of coinBursts){
    ctx.globalAlpha=clamp(1-c.age/.95,0,1);ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.spin);
    const g=ctx.createLinearGradient(-7,0,7,0);g.addColorStop(0,"#9d2d05");g.addColorStop(.45,"#ff8b00");g.addColorStop(.72,"#ffc12b");g.addColorStop(1,"#d64a08");
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,7,4.5,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#e76806";ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
  for(const p of levelBurst){
    ctx.globalAlpha=clamp(1-p.age/2.3,0,1);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.spin);
    const g=ctx.createLinearGradient(-8,-8,8,8);g.addColorStop(0,"#fff");g.addColorStop(.28,p.color);g.addColorStop(.72,p.color);g.addColorStop(1,"#333");
    ctx.fillStyle=g;ctx.beginPath();if(p.rect)ctx.rect(-6,-3,12,6);else ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  ctx.restore();
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
  const p = position(e);
  // Mobile browsers require a user gesture before music can start.
  if(!audio){unlockAudio();setupMusic();}
  else if(audio.state==="suspended")unlockAudio();
  if(collectionOpen){collectionOpen=false;e.preventDefault();return;}
  if (p.x > W-112 && p.y > H-100) {collectionOpen=true;e.preventDefault();return;}
  if(p.y<76 && p.x<105){levelPicker=!levelPicker;e.preventDefault();return;}
  if(p.y<76 && p.x>W-105){musicOn=!musicOn;unlockAudio();setupMusic();e.preventDefault();return;}
  if(levelPicker){
    const top=H*.18,cellW=(W-24)/5,cellH=Math.min(42,H*.72/21);
    const col=Math.floor((p.x-12)/cellW),row=Math.floor((p.y-top)/cellH);
    if(col>=0&&col<5&&row>=0&&row<21){level=clampLevel(row*5+col+1);levelPicker=false;reset();}
    else levelPicker=false;
    e.preventDefault();return;
  }
  if (mode !== "ready" || reward) return;
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
  // Short visible hop on release.
  hopZ = 0; hopV = 185 + 105 * power; landedOnce = false; postFlick = 0.48;
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
    spawnCoins(b.x,b.y);
    spawnReward(b.x,b.y);
    if(cleared===3) spawnLevelBurst();
    resultText = cleared === 3 ? "ALL THREE!" : "HIT!"; resultAge = 0;
  }
}
function chooseReward() {
  const missing=[];
  for(let i=0;i<12;i++) if(!collection.found[i]) missing.push(i);
  const slot=missing.length ? missing[Math.floor(Math.random()*missing.length)] : Math.floor(Math.random()*12);
  return {slot,color:REWARD_COLORS[slot]};
}
function spawnReward(x,y) {
  if (reward) finishReward();
  const item=chooseReward();
  reward={item,x,y,fromX:x,fromY:y,age:0};
}
function finishReward() {
  if(!reward)return;
  const slot=reward.item.slot;
  if(!collection.found[slot]) { collection.found[slot]=true; collection.total++; }
  reward=null;
}
function updateReward(dt) {
  if(!reward)return;
  reward.age+=dt;
  if(reward.age>=1.25){finishReward();return;}
  const t=clamp((reward.age-0.88)/0.37,0,1);
  reward.x=reward.fromX+(W-43-reward.fromX)*t*t;
  reward.y=reward.fromY-28*Math.sin(Math.PI*clamp(reward.age/0.88,0,1))+(H-54-reward.fromY)*t*t;
}
function drawHandPose(alpha) {
  if(alpha<=0)return;
  const sx=shooter.x,sy=shooter.y;
  const tension=drag?clamp(Math.hypot(sx-drag.x,sy-drag.y)/MAX_PULL,0,1):0;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.fillStyle="#81502f";ctx.strokeStyle="#4c2d1b";ctx.lineWidth=2;
  // Broad palm silhouettes with thumb and forefinger kept anatomically compact.
  ctx.beginPath();ctx.ellipse(sx-27,sy+35,26,19,-0.3,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#81502f";ctx.lineWidth=12;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(sx-35,sy+34);ctx.lineTo(sx-51,sy+44);ctx.stroke();
  ctx.beginPath();ctx.moveTo(sx-16,sy+27);ctx.lineTo(sx-6,sy+7);ctx.stroke();
  const rx=sx+38+tension*9,ry=sy+38+tension*4;
  ctx.fillStyle="#95613e";ctx.strokeStyle="#59351f";ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(rx,ry,24,18,0.25,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#95613e";ctx.lineWidth=10;
  ctx.beginPath();ctx.moveTo(rx-13,ry-7);ctx.lineTo(sx+3,sy+10);ctx.stroke();
  ctx.beginPath();ctx.moveTo(rx-12,ry+4);ctx.lineTo(sx+6,sy+15);ctx.stroke();
  ctx.restore();
}
function drawReward() {
  if(!reward)return;
  const r=reward, t=clamp(r.age/0.88,0,1);
  ctx.save();
  ctx.fillStyle=r.item.color;ctx.strokeStyle="#fff0c2";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(r.x,r.y-22*t,10+7*Math.sin(Math.PI*t),0,Math.PI*2);ctx.fill();ctx.stroke();
  if(r.age<0.88){
    ctx.font="bold 12px system-ui,sans-serif";ctx.textAlign="center";ctx.fillStyle="#ff9a12";
    ctx.fillText("FOUND!",r.x,r.y-46);
  }
  ctx.restore();
}
function drawCollectionBook() {
  if(!collectionOpen)return;
  const x=18,y=H*0.25,w=W-36,h=Math.min(H*0.55,430);
  ctx.save();
  ctx.fillStyle="rgba(248,252,253,.97)";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="#86a7ad";ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
  ctx.textAlign="center";ctx.fillStyle="#263238";ctx.font="bold 19px system-ui,sans-serif";
  ctx.fillText("KANCHA POTLI — "+collection.total+"/12 FOUND",W/2,y+35);
  const cols=3, gapX=w/cols, gapY=Math.min(78,(h-90)/4);
  for(let i=0;i<12;i++){
    const col=i%3,row=Math.floor(i/3),cx=x+gapX*(col+.5),cy=y+78+row*gapY;
    ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);
    if(collection.found[i]){
      const cg=ctx.createRadialGradient(cx-6,cy-7,2,cx,cy,18);cg.addColorStop(0,"rgba(255,255,255,.95)");cg.addColorStop(.28,REWARD_COLORS[i]);cg.addColorStop(1,"rgba(20,60,70,.78)");ctx.fillStyle=cg;ctx.fill();
      ctx.strokeStyle="rgba(52,82,88,.35)";ctx.lineWidth=2;ctx.stroke();
      ctx.beginPath();ctx.arc(cx-6,cy-7,3,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,.8)";ctx.fill();
    }else{
      ctx.fillStyle="rgba(38,50,56,.12)";ctx.fill();
      ctx.strokeStyle="rgba(38,50,56,.24)";ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle="#263238";ctx.font="bold 17px system-ui,sans-serif";ctx.fillText("?",cx,cy+1);
    }
  }
  ctx.fillStyle="#263238";ctx.font="bold 12px system-ui,sans-serif";
  ctx.fillText("TAP BOOK TO CLOSE",W/2,y+h-18);
  ctx.restore();
}
function update(dt) {
  impactFlash = Math.max(0, impactFlash - dt);
  updateFX(dt);
  updateMusic();
  postFlick = Math.max(0, postFlick-dt);
  updateReward(dt);
  if (resultText) resultAge += dt;
  if (mode === "celebrating") {
    celebrationAge += dt;
    if (celebrationAge >= 3.6 && !reward) { level=level%TOTAL_LEVELS+1; rounds=level; reset(); }
    return;
  }
  if (mode !== "moving") return;
  shotTime += dt;
  // Short ballistic hop while horizontal shot physics continue.
  if(!landedOnce){hopZ+=hopV*dt;hopV-=760*dt;if(hopZ<=0&&hopV<0){hopZ=0;hopV=0;landedOnce=true;}}else hopZ=0;
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
    // Low/descending striker can hit; at the apex it passes above.
    if (hopZ <= shooter.r * 1.55) for (const t of targets) if (!t.cleared) collide(shooter, t, true);
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
      completedShots = roundShots;
      bestShots = bestShots === null ? roundShots : Math.min(bestShots, roundShots);
      bestByLevel[level-1]=bestByLevel[level-1]===null?roundShots:Math.min(bestByLevel[level-1],roundShots);
      celebrationAge = 0;
      mode = "celebrating";
      resultText = ""; resultAge = 0;
    } else {
      // Fresh challenge after every resolved shot: relocate within a safe bottom-half zone.
      for (const t of targets) { t.vx = 0; t.vy = 0; }
      placeShooterChallenge();
      mode = "ready"; shotTime = 0; restTime = 0; impactFlash = 0;
      hopZ = 0; hopV = 0; landedOnce = false;
    }
  }
}
function drawBall(b) {
  // Glass-look procedural marbles: translucent shell, internal ribbon and specular highlight.
  const isShooter=b===shooter, lift=isShooter?hopZ:0;
  const baseY=b.y;if(lift>0)b.y-=lift;
  ctx.save();
  ctx.shadowColor="rgba(25,40,50,.20)";ctx.shadowBlur=7;ctx.shadowOffsetY=4;
  const shell=ctx.createRadialGradient(b.x-b.r*.38,b.y-b.r*.42,b.r*.06,b.x,b.y,b.r);
  if(isShooter){shell.addColorStop(0,"#777d86");shell.addColorStop(.25,"#252a31");shell.addColorStop(.72,"#0b0d11");shell.addColorStop(1,"#020305");}
  else if(b.color==="#249e72"){shell.addColorStop(0,"rgba(225,255,247,.98)");shell.addColorStop(.28,"rgba(82,211,158,.82)");shell.addColorStop(.72,"rgba(13,119,78,.86)");shell.addColorStop(1,"rgba(4,66,45,.96)");}
  else {shell.addColorStop(0,"rgba(232,249,255,.98)");shell.addColorStop(.28,"rgba(73,173,232,.82)");shell.addColorStop(.72,"rgba(18,96,168,.88)");shell.addColorStop(1,"rgba(7,52,105,.97)");}
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=shell;ctx.fill();ctx.shadowBlur=0;
  if(!isShooter){
    ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,b.r*.91,0,Math.PI*2);ctx.clip();
    ctx.strokeStyle=b.color==="#249e72"?"rgba(193,255,88,.88)":"rgba(55,239,213,.82)";
    ctx.lineWidth=b.r*.28;ctx.lineCap="round";ctx.beginPath();
    ctx.moveTo(b.x-b.r*.72,b.y+b.r*.38);ctx.quadraticCurveTo(b.x,b.y-b.r*.5,b.x+b.r*.72,b.y+b.r*.18);ctx.stroke();ctx.restore();
  }
  ctx.beginPath();ctx.arc(b.x-b.r*.32,b.y-b.r*.38,b.r*.18,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,.72)";ctx.fill();
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.strokeStyle="rgba(50,70,75,.38)";ctx.lineWidth=1.2;ctx.stroke();
  ctx.restore();
  if(lift>0)b.y=baseY;
}
function labelBox(text,cx,cy,font="600 13px system-ui, sans-serif",fill="#e8ecee",padX=12,h=27,textColor="#111820"){
  ctx.save();ctx.font=font;const w=Math.min(W-20,ctx.measureText(text).width+padX*2);
  ctx.fillStyle=fill;ctx.fillRect(cx-w/2,cy-h/2,w,h);
  ctx.fillStyle=textColor;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=font;ctx.fillText(text,cx,cy+1);ctx.restore();
}
function render() {
  ctx.fillStyle = "#fbfcfd"; ctx.fillRect(0, 0, W, H);
  // Subtle cool tabletop shadowing keeps the white board tactile rather than flat.
  const tableGlow=ctx.createRadialGradient(W*.5,H*.52,20,W*.5,H*.52,Math.max(W,H)*.72);
  tableGlow.addColorStop(0,"rgba(222,237,240,.20)");tableGlow.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=tableGlow;ctx.fillRect(0,0,W,H);
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.letterSpacing="0px";
  const chapterName=CHAPTERS[Math.floor((level-1)/15)].toUpperCase();
  labelBox("KANCHEY  •  "+chapterName,W/2,85,"600 12px system-ui, sans-serif","#e8ecee",13,27);
  labelBox("LEVELS",48,43,"bold 11px system-ui, sans-serif","#1597c4",10,25,"#fff");
  labelBox(musicOn?"♫ ON":"♫ OFF",W-48,43,"bold 11px system-ui, sans-serif","#e8ecee",10,25);
  labelBox("HITS "+hits+" / "+shots,W/2,117,"600 16px system-ui, sans-serif","#e8ecee",15,27);
  labelBox("LEVEL "+level+"/105  •  CLEARED "+cleared+"/3  •  SHOTS "+roundShots,W/2,149,"600 12px system-ui, sans-serif","#e8ecee",10,27);
  labelBox("BEST "+(bestShots===null?"—":bestShots+" SHOTS"),W/2,181,"600 12px system-ui, sans-serif","#e8ecee",12,26);
  if (resultText && resultAge < 1.2) {
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillStyle = resultText === "HIT!" ? "#d85a08" : "#55361f";
    ctx.fillText(resultText, W / 2, H * 0.54);
    ctx.fillStyle = "#263238";
  }
  ctx.letterSpacing = "0px";
  // ENERGY bar: pull strength is visible before release.
  const barW = W*0.86, barH = 14, barX = W*0.07, barY = 227;
  const energy = drag ? clamp(Math.hypot(shooter.x-drag.x,shooter.y-drag.y)/MAX_PULL,0,1) : 0;
  ctx.fillStyle="rgba(42,63,68,.12)"; ctx.fillRect(barX,barY,barW,barH);
  if (energy>0) { const eg=ctx.createLinearGradient(barX,0,barX+barW,0);eg.addColorStop(0,"#43b6e8");eg.addColorStop(.5,"#4bd08a");eg.addColorStop(1,"#ffd64a");ctx.fillStyle=eg;ctx.fillRect(barX,barY,barW*energy,barH); }
  ctx.strokeStyle="rgba(42,63,68,.42)"; ctx.lineWidth=1.5; ctx.strokeRect(barX,barY,barW,barH);
  labelBox("ENERGY  "+Math.round(energy*100)+"%",W/2,barY-21,"700 10px system-ui, sans-serif","#e8ecee",10,21);
  for (const t of targets) {
    if (t.cleared) continue;
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 20, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(55,83,88,.28)"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (drag) {
    drawHandPose(1);
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
  if(!drag && (mode==="ready" || postFlick>0))drawHandPose(mode==="ready"?0.85:postFlick/0.48*0.65);
  drawBall(shooter);
  drawReward();
  drawFX();
  // Potli tray remains visible; collection book opens with a tap.
  // Compact colourful Potli chip. One tap opens; tapping the overlay anywhere closes.
  ctx.fillStyle="#087f5b";ctx.fillRect(W-96,H-76,84,56);
  const pg=ctx.createLinearGradient(W-96,0,W-12,0);pg.addColorStop(0,"#48bce8");pg.addColorStop(.5,"#55d58b");pg.addColorStop(1,"#ffd34e");
  ctx.fillStyle=pg;ctx.fillRect(W-96,H-76,84,5);
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="bold 12px system-ui,sans-serif";ctx.fillText("POTLI",W-54,H-55);
  ctx.font="12px system-ui,sans-serif";ctx.fillText(collection.total+" / 12",W-54,H-35);
  if (mode === "celebrating") {
    // Fast radial burst: stars + flower-like petals, driven entirely by celebrationAge.
    const cx = W / 2, cy = H * 0.47;
    const burstT = clamp(celebrationAge / 1.35, 0, 1);
    const fade = clamp(1 - Math.max(0, celebrationAge - 1.65) / 1.05, 0, 1);
    const ease = 1 - Math.pow(1 - burstT, 3);
    const glyphs = ["★", "✦", "✿", "❋"];
    const burstColors = ["#fff2a8", "#f7c84b", "#ff8a5b", "#f6e7c1"];
    ctx.save();
    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * 2 * i / 28) + ((i % 3) - 1) * 0.11;
      const dist = (36 + (i % 7) * 13) * ease;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist * 0.72 - 18 * burstT;
      ctx.globalAlpha = fade * (0.72 + (i % 4) * 0.07);
      ctx.fillStyle = burstColors[i % burstColors.length];
      ctx.font = (i % 2 ? "bold 20px" : "bold 25px") + " system-ui, sans-serif";
      ctx.fillText(glyphs[i % glyphs.length], x, y);
    }
    ctx.restore();

    // Keep the celebration unobstructed: no opaque result card.
    ctx.globalAlpha = 1;
    ctx.shadowBlur=0;
    labelBox("LEVEL "+level+" CLEARED!",cx,cy-42,"bold "+Math.min(24,W*.057)+"px system-ui, sans-serif","#e8ecee",16,38);
    labelBox(completedShots+(completedShots===1?" SHOT":" SHOTS"),cx,cy+2,"bold 19px system-ui, sans-serif","#e8ecee",15,32);
    labelBox(level===105?"ALL 105 LEVELS COMPLETE!":"NEXT LEVEL UNLOCKED!",cx,cy+41,"bold 12px system-ui, sans-serif","#e8ecee",13,27);
  }
  drawCollectionBook();
  if(levelPicker){
    const top=H*.18,cellW=(W-24)/5,cellH=Math.min(42,H*.72/21);
    ctx.fillStyle="rgba(248,252,253,.98)";ctx.fillRect(6,top-38,W-12,cellH*21+45);
    ctx.strokeStyle="#76a8b0";ctx.strokeRect(6,top-38,W-12,cellH*21+45);
    ctx.textAlign="center";ctx.fillStyle="#23424d";ctx.font="bold 15px system-ui,sans-serif";
    ctx.fillText("105 LEVELS  •  ALL UNLOCKED",W/2,top-18);
    for(let i=0;i<105;i++){
      const x=12+(i%5)*cellW,y=top+Math.floor(i/5)*cellH;
      ctx.fillStyle=i+1===level?"#2b91b3":bestByLevel[i]!==null?"#50b38e":"#e5f0f3";
      ctx.fillRect(x+2,y+2,cellW-5,cellH-5);
      ctx.fillStyle=i+1===level||bestByLevel[i]!==null?"#fff":"#264653";
      ctx.font="bold 11px system-ui,sans-serif";ctx.fillText(String(i+1),x+cellW/2,y+cellH/2);
    }
  }
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
