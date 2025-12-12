/* =========================
   GLOBALS
========================= */
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const DPR = ()=>Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

let W = 0, H = 0;

const tree = {
  cx: () => W * 0.5,
  bottom: () => H * 0.80,
  height: () => H * 0.62,
  maxR: () => Math.min(W, H) * 0.28,
  turns: 7.5,
  taperPow: 1.15
};

const snowA = [];     // medium
const snowB = [];     // small
const snowC = [];     // micro (NEW)
const clusters = [];

function pointOnSpiral(tt){
  const y = tree.bottom() - tt * tree.height();
  const r = tree.maxR() * Math.pow(1 - tt, tree.taperPow);
  const ang = tt * tree.turns * Math.PI * 2;
  const x = tree.cx() + r * Math.cos(ang);
  return { x, y, tt };
}

function gauss(x,mu,sigma){
  const z=(x-mu)/sigma;
  return Math.exp(-0.5*z*z);
}
function runningGlow(time, tt){
  const head=(time*0.00020) % 1;
  let d=Math.abs(tt-head); d=Math.min(d, 1-d);
  return gauss(d, 0, 0.030);
}
function breathing(time){
  return 0.70 + 0.30 * Math.sin(time * 0.0021);
}

/* =========================
   MUSIC + TOUCH
========================= */
const bgMusic = new Audio("assets/christmas.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.5;

const touchBtn = document.getElementById("touchBtn");

let treeFinished = false;
let started = false;

function showTouch(){
  if (touchBtn) touchBtn.classList.add("show");
}

function startExperience(){
  if (started) return;
  started = true;

  bgMusic.play().catch(()=>{});
  if (touchBtn){
    touchBtn.classList.remove("show");
    touchBtn.style.display = "none";
  }
}

if (touchBtn){
  touchBtn.addEventListener("click", startExperience, { once:true });
  touchBtn.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    startExperience();
  }, { once:true, passive:false });
}

/* =========================
   INIT
========================= */
function spawnSnow(arr, count, o){
  arr.length=0;
  for(let i=0;i<count;i++){
    arr.push({
      x:Math.random()*W, y:Math.random()*H,
      r:o.rMin + Math.random()*(o.rMax-o.rMin),
      vy:o.vyMin + Math.random()*(o.vyMax-o.vyMin),
      vx:o.vxMin + Math.random()*(o.vxMax-o.vxMin),
      a:o.aMin + Math.random()*(o.aMax-o.aMin),
      wob:Math.random()*Math.PI*2,
      wobSpd:o.wobSpdMin + Math.random()*(o.wobSpdMax-o.wobSpdMin),
    });
  }
}

function initSnow(){
  // TĂNG MẬT ĐỘ: chia mẫu nhỏ hơn => nhiều hạt hơn
  const base = (W * H) / 8500;

  // Medium flakes
  spawnSnow(snowA, Math.floor(base * 1.35), {
    rMin: 1.0, rMax: 3.1,
    vyMin: 0.8, vyMax: 2.3,
    vxMin: -0.7, vxMax: 0.7,
    aMin: 0.32, aMax: 0.95,
    wobSpdMin: 0.6, wobSpdMax: 2.2
  });

  // Small flakes
  spawnSnow(snowB, Math.floor(base * 2.8), {
    rMin: 0.35, rMax: 1.5,
    vyMin: 0.5, vyMax: 1.6,
    vxMin: -0.45, vxMax: 0.45,
    aMin: 0.18, aMax: 0.65,
    wobSpdMin: 0.8, wobSpdMax: 3.2
  });

  // Micro flakes (NEW layer, very many)
  spawnSnow(snowC, Math.floor(base * 3.6), {
    rMin: 0.18, rMax: 0.75,
    vyMin: 0.35, vyMax: 1.15,
    vxMin: -0.30, vxMax: 0.30,
    aMin: 0.10, aMax: 0.35,
    wobSpdMin: 1.0, wobSpdMax: 3.8
  });
}

function initClusters(){
  clusters.length=0;
  const k=7;
  for(let i=0;i<k;i++){
    clusters.push({
      c:Math.random(),
      w:0.06 + Math.random()*0.10,
      phase:Math.random()*Math.PI*2,
      freq:0.8 + Math.random()*1.4,
      amp:0.22 + Math.random()*0.40
    });
  }
}

function clusterGlow(time, tt){
  let v=0;
  for(const cl of clusters){
    const gate=gauss(tt, cl.c, cl.w);
    const pulse=0.60 + 0.40*Math.sin(time*0.0026*cl.freq + cl.phase);
    v += gate*pulse*cl.amp;
  }
  return clamp(v,0,1);
}

function resize(){
  const dpr=DPR();
  W=Math.floor(innerWidth); H=Math.floor(innerHeight);
  canvas.width=Math.floor(W*dpr);
  canvas.height=Math.floor(H*dpr);
  canvas.style.width=W+"px";
  canvas.style.height=H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);

  initSnow();
  initClusters();
}

/* =========================
   DRAW
========================= */
function clearBG(){
  ctx.clearRect(0,0,W,H);
  const g=ctx.createRadialGradient(tree.cx(), tree.bottom(), 10, tree.cx(), tree.bottom(), tree.maxR()*2.15);
  g.addColorStop(0,"rgba(140,255,200,0.22)");
  g.addColorStop(0.32,"rgba(90,255,170,0.12)");
  g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);
}

function drawTreeHalo(time){
  ctx.save();
  const p=0.55+0.45*Math.sin(time*0.0016);
  const g=ctx.createRadialGradient(tree.cx(), tree.bottom()-tree.height()*0.55, 20,
                                   tree.cx(), tree.bottom()-tree.height()*0.55, tree.maxR()*1.45);
  g.addColorStop(0,   `rgba(180,255,210,${0.07 + 0.06*p})`);
  g.addColorStop(0.4, `rgba(180,255,210,${0.04 + 0.04*p})`);
  g.addColorStop(1,   `rgba(0,0,0,0)`);
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);
  ctx.restore();
}

function drawSnowLayer(arr, time, alphaMul, driftMul=1){
  ctx.save();
  ctx.fillStyle="rgba(255,255,255,0.95)";
  for(const p of arr){
    p.wob += p.wobSpd*0.01;
    p.x += p.vx + Math.sin(p.wob + time*0.001)*0.18*driftMul;
    p.y += p.vy;

    if(p.y>H+12){ p.y=-12; p.x=Math.random()*W; }
    if(p.x<-12) p.x=W+12;
    if(p.x>W+12) p.x=-12;

    ctx.globalAlpha=p.a*alphaMul;
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawNeonSegment(a,b,intensity){
  const I=clamp(intensity,0,1);
  ctx.save();
  ctx.lineCap="round"; ctx.lineJoin="round";

  ctx.shadowColor=`rgba(180,255,210,${0.18 + I*0.35})`;
  ctx.shadowBlur=26 + I*44;
  ctx.strokeStyle=`rgba(170,255,210,${0.06 + I*0.18})`;
  ctx.lineWidth=10.0 + I*10.0;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

  ctx.shadowColor=`rgba(190,255,220,${0.30 + I*0.45})`;
  ctx.shadowBlur=16 + I*28;
  ctx.strokeStyle=`rgba(235,255,245,${0.24 + I*0.56})`;
  ctx.lineWidth=5.2 + I*3.8;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

  ctx.shadowColor=`rgba(210,255,235,${0.35 + I*0.55})`;
  ctx.shadowBlur=10 + I*18;
  ctx.strokeStyle=`rgba(245,255,250,${0.42 + I*0.50})`;
  ctx.lineWidth=3.2 + I*1.8;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

  ctx.shadowBlur=0;
  ctx.strokeStyle=`rgba(255,255,255,${0.40 + I*0.60})`;
  ctx.lineWidth=1.2 + I*0.9;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

  ctx.restore();
}

function drawTopLamp(x,y,time){
  ctx.save();
  const p=0.60 + 0.40*Math.sin(time*0.0065);
  ctx.globalAlpha=0.22 + 0.55*p;
  ctx.shadowColor="rgba(255,255,255,0.95)";
  ctx.shadowBlur=18 + 34*p;
  ctx.fillStyle="rgba(255,255,255,0.98)";
  ctx.beginPath(); ctx.arc(x,y,4.6 + 1.8*p,0,Math.PI*2); ctx.fill();

  ctx.shadowBlur=0;
  ctx.globalAlpha=0.35 + 0.55*p;
  ctx.fillStyle="rgba(255,255,255,0.99)";
  ctx.beginPath(); ctx.arc(x,y,2.0 + 0.8*p,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawStar(x,y,time){
  ctx.save();
  ctx.translate(x,y);

  const tw=0.75 + 0.25*Math.sin(time*0.004);
  ctx.shadowColor=`rgba(255,240,170,${0.80+0.20*tw})`;
  ctx.shadowBlur=26 + 18*tw;

  const outer=12.8, inner=5.8;
  ctx.beginPath();
  for(let i=0;i<10;i++){
    const a=(Math.PI/5)*i - Math.PI/2;
    const rr=(i%2===0)?outer:inner;
    ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr);
  }
  ctx.closePath();
  ctx.fillStyle=`rgba(255,230,120,${0.90+0.10*tw})`;
  ctx.fill();
  ctx.restore();
}

function drawGlitter(time, pts){
  if(pts.length<4) return;
  ctx.save();
  ctx.globalAlpha=0.12 + 0.06*Math.sin(time*0.004);
  ctx.fillStyle="rgba(255,255,255,0.95)";
  for(let k=0;k<160;k++){
    const idx=(Math.random()*pts.length)|0;
    const s=pts[idx];
    const dx=(Math.random()-0.5)*18;
    const dy=(Math.random()-0.5)*18;
    ctx.beginPath();
    ctx.arc(s.x+dx, s.y+dy, Math.random()*1.6,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

/* =========================
   LOOP
========================= */
let t=0, last=null;
const pts=[];
const speed=0.22;

function frame(ts){
  if(!last) last=ts;
  const dt=Math.min(0.05,(ts-last)/1000);
  last=ts;

  t=Math.min(1, t+dt*speed);
  pts.push(pointOnSpiral(t));

  clearBG();

  // Snow: micro behind, then small, then medium (denser overall)
  drawSnowLayer(snowC, ts, 0.65, 0.9);
  drawSnowLayer(snowB, ts, 0.85, 1.0);
  drawSnowLayer(snowA, ts, 1.00, 1.05);

  drawTreeHalo(ts);

  const breathe=breathing(ts);
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1], b=pts[i];
    const mid=(a.tt+b.tt)*0.5;
    const run=runningGlow(ts, mid);
    const cl=clusterGlow(ts, mid);
    const intensity=clamp(0.45*breathe + 0.55*cl + 1.05*run, 0.25, 1);
    drawNeonSegment(a,b,intensity);
  }

  drawGlitter(ts, pts);

  if(t>0.92){
    const top=pointOnSpiral(1);
    drawTopLamp(top.x, top.y-2, ts);
    drawStar(top.x, top.y-18, ts);
  }

  // ===== TREE FINISHED =====
  if (!treeFinished && t >= 1){
    treeFinished = true;
    setTimeout(showTouch, 350); // delay nhẹ cho cinematic
  }

  requestAnimationFrame(frame);
}

resize();
addEventListener("resize", resize);
requestAnimationFrame(frame);