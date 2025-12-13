/* =========================
   GLOBALS
========================= */
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

/* =========================
   WEBGL PARTICLES (GPU)
========================= */
const glCanvas = document.getElementById("cgl");
const gl = glCanvas.getContext("webgl", {
  alpha: true,
  premultipliedAlpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance"
});

function compileShader(gl, type, src){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(info);
  }
  return sh;
}
function createProgram(gl, vsSrc, fsSrc){
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p  = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
    const info = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(info);
  }
  gl.deleteShader(vs); gl.deleteShader(fs);
  return p;
}

const VS = `
attribute vec2 a_pos;     // pixel
attribute float a_size;   // pixel
attribute float a_kind;   // 0 snow, 1 sparkle
attribute float a_alpha;  // 0..1

uniform vec2 u_res;

varying float v_kind;
varying float v_alpha;

void main(){
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  clip.y *= -1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size;
  v_kind = a_kind;
  v_alpha = a_alpha;
}
`;

const FS = `
precision mediump float;

varying float v_kind;
varying float v_alpha;

void main(){
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r  = length(uv);

  // base soft circle
  float core = smoothstep(0.5, 0.0, r);

  // sparkle sharper + tiny halo
  float shape = mix(core, pow(core, 3.0), step(0.5, v_kind));
  float halo  = 0.0;
  if(v_kind > 0.5){
    halo = smoothstep(0.5, 0.0, r) * 0.35;
  }

  float a = (shape + halo) * v_alpha;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}
`;

const prog = createProgram(gl, VS, FS);
gl.useProgram(prog);

const locPos   = gl.getAttribLocation(prog, "a_pos");
const locSize  = gl.getAttribLocation(prog, "a_size");
const locKind  = gl.getAttribLocation(prog, "a_kind");
const locAlpha = gl.getAttribLocation(prog, "a_alpha");
const locRes   = gl.getUniformLocation(prog, "u_res");

const vbo = gl.createBuffer();
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
// Use additive blending for sparkle
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

gl.disable(gl.DEPTH_TEST);

const gpuSpark = [];
let gpuPacked = null;

const GPUQ = {
  snow: 2200,
  spark: 220,
  wind: 0.55,
};

function rand(min,max){ return min + Math.random()*(max-min); }

function initGpuParticles(){
  gpuSpark.length = 0;

  // sparkle bám quanh cây
  for(let i=0;i<GPUQ.spark;i++){
    const tt = rand(0.08, 0.98);
    const p  = pointOnSpiral(tt);
    gpuSpark.push({
      x: p.x + rand(-18, 18),
      y: p.y + rand(-16, 16),
      baseA: rand(0.10, 0.55),
      size: rand(2.2, 5.8),
      phase: rand(0, Math.PI*2),
      speed: rand(0.8, 1.7)
    });
  }
}

function packSnowLayer(arr, time, alphaMul, driftMul, out, k){
  for(const p of arr){
    // y chang drawSnowLayer (CPU version) nhưng giờ chỉ pack để GPU vẽ
    p.wob += p.wobSpd*0.01;
    p.x += p.vx + Math.sin(p.wob + time*0.001)*0.18*driftMul;
    p.y += p.vy;

    if(p.y > H+12){ p.y = -12; p.x = Math.random()*W; }
    if(p.x < -12) p.x = W+12;
    if(p.x > W+12) p.x = -12;

    out[k++] = p.x;
    out[k++] = p.y;
    out[k++] = p.r * 2.2;         // gl_PointSize ~ đường kính
    out[k++] = 0.0;               // kind snow
    out[k++] = p.a * alphaMul;    // đúng alphaMul layer cũ
  }
  return k;
}

function renderGpuParticles(time){
  gl.viewport(0,0, glCanvas.width, glCanvas.height);
  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog);
  gl.uniform2f(locRes, W, H);

  const snowCount = snowA.length + snowB.length + snowC.length;
  const sparkCount = gpuSpark.length;
  const total = snowCount + sparkCount;

  const stride = 5;
  const need = total * stride;
  if(!gpuPacked || gpuPacked.length !== need) gpuPacked = new Float32Array(need);

  let k = 0;

  // pack snow đúng thứ tự layer cũ
  k = packSnowLayer(snowC, time, 0.65, 0.90, gpuPacked, k);
  k = packSnowLayer(snowB, time, 0.85, 1.00, gpuPacked, k);
  k = packSnowLayer(snowA, time, 1.00, 1.05, gpuPacked, k);

  // pack sparkle
  for(let i=0;i<gpuSpark.length;i++){
    const s = gpuSpark[i];
    const blink = 0.25 + 0.75 * Math.max(0.0, Math.sin(time*0.006*s.speed + s.phase + i));
    gpuPacked[k++] = s.x;
    gpuPacked[k++] = s.y;
    gpuPacked[k++] = s.size * (0.85 + 0.35*blink);
    gpuPacked[k++] = 1.0;
    gpuPacked[k++] = s.baseA * blink;
  }

  // upload 1 lần
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, gpuPacked, gl.DYNAMIC_DRAW);

  const BYTES = 4;
  const STRIDE_BYTES = stride * BYTES;

  gl.enableVertexAttribArray(locPos);
  gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, STRIDE_BYTES, 0);

  gl.enableVertexAttribArray(locSize);
  gl.vertexAttribPointer(locSize, 1, gl.FLOAT, false, STRIDE_BYTES, 2*BYTES);

  gl.enableVertexAttribArray(locKind);
  gl.vertexAttribPointer(locKind, 1, gl.FLOAT, false, STRIDE_BYTES, 3*BYTES);

  gl.enableVertexAttribArray(locAlpha);
  gl.vertexAttribPointer(locAlpha, 1, gl.FLOAT, false, STRIDE_BYTES, 4*BYTES);

  // 1) draw snow (alpha)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS, 0, snowCount);

  // 2) draw sparkle (additive)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.drawArrays(gl.POINTS, snowCount, sparkCount);
}

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

const snowA = [];
const snowB = [];
const snowC = [];
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
  const base = (W * H) / 4200;

  // Layer A -> Large
  spawnSnow(snowA, Math.floor(base * 2.10), {
    rMin: 0.9, rMax: 4.6,
    vyMin: 0.9, vyMax: 2.9,
    vxMin: -0.95, vxMax: 0.95,
    aMin: 0.28, aMax: 0.98,
    wobSpdMin: 0.5, wobSpdMax: 2.6
  });

  for (let i = 0; i < Math.floor(base * 0.08); i++){
    snowA.push({
      x: Math.random()*W, y: Math.random()*H,
      r: rand(4.8, 7.6),
      vy: rand(1.2, 2.8),
      vx: rand(-1.1, 1.1),
      a: rand(0.22, 0.55),
      wob: Math.random()*Math.PI*2,
      wobSpd: rand(0.4, 1.6)
    });
  }

  // Layer B -> Medium
  spawnSnow(snowB, Math.floor(base * 3.70), {
    rMin: 0.30, rMax: 1.85,
    vyMin: 0.55, vyMax: 1.85,
    vxMin: -0.55, vxMax: 0.55,
    aMin: 0.16, aMax: 0.70,
    wobSpdMin: 0.7, wobSpdMax: 3.1
  });

  // Layer C -> Small
  spawnSnow(snowC, Math.floor(base * 4.90), {
    rMin: 0.14, rMax: 1.05,
    vyMin: 0.40, vyMax: 1.25,
    vxMin: -0.35, vxMax: 0.35,
    aMin: 0.08, aMax: 0.38,
    wobSpdMin: 1.0, wobSpdMax: 4.2
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

  // NEW: resize WebGL canvas theo đúng buffer size
  glCanvas.width = Math.floor(W*dpr);
  glCanvas.height = Math.floor(H*dpr);
  glCanvas.style.width = W + "px";
  glCanvas.style.height = H + "px";

  initSnow();
  initClusters();

  // NEW: init GPU particles after geometry ready
  initGpuParticles();
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

  // NEW (GPU snow + sparkle):
  renderGpuParticles(ts);

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

  if(t>0.92){
    const top=pointOnSpiral(1);
    drawTopLamp(top.x, top.y-2, ts);
    drawStar(top.x, top.y-18, ts);
  }

  // ===== TREE FINISHED =====
  if (!treeFinished && t >= 1){
    treeFinished = true;
    setTimeout(showTouch, 350);
  }

  requestAnimationFrame(frame);
}

resize();
addEventListener("resize", resize);

requestAnimationFrame(frame);