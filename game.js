// Runner: Ángeles y Sombras
// Hecho por ChatGPT para Alejandro — HTML5 Canvas, sin dependencias externas.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const bestEl = document.getElementById('best');
  const livesEl = document.getElementById('lives');
  const jumpBtn = document.getElementById('jumpBtn');
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

  let W = 0, H = 0;
  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = canvas.width / dpr;
    H = canvas.height / dpr;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Estrellas de fondo
  const stars = Array.from({ length: 100 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.5 + 0.5
  }));

  // -------- Utils
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function drawStars() {
    ctx.fillStyle = '#fff';
    stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // -------- Audio (simple WebAudio beeps)
  const Audio = (() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    let muted = false;
    function beep(freq=440, dur=0.08, type='sine', vol=0.04) {
      if (muted) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = vol;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    }
    function burstLaser() { beep(300, .06, 'sawtooth', .05); beep(500, .06, 'square', .03); }
    function jump() { beep(600,.06,'triangle',.05); beep(800,.05,'sine',.04); }
    function hit() { beep(160,.12,'square',.06); beep(120,.16,'sawtooth',.06); }
    function shield() { beep(880,.07,'sine',.04); beep(1175,.09,'sine',.03); }
    return {
      jump, hit, burstLaser, shield,
      toggle(){ muted = !muted; },
      isMuted(){ return muted; },
      unlock(){ if (ctx.state === 'suspended') ctx.resume(); }
    };
  })();

  // -------- Game State
  const STATE = { MENU:0, PLAY:1, OVER:2 };
  let state = STATE.MENU;
  let time = 0, startTs = 0, lastTs = 0, speed = 400; // px/s base ground speed
  let groundY = () => H*0.82;
  let score = 0, best = parseFloat(localStorage.getItem('runnerHighScore') || '0') || 0;
  bestEl.textContent = best.toFixed(1);

  let livesBase = 10;
  let lives = livesBase;
  let shieldActive = false;
  let shieldUntil = 0;

  let wingBoosts = 0; // how many wing windows granted so far (max 3 at 60/120/180s)
  let wingActiveUntil = 0; // timestamp until wings active

  // Entities arrays
  const missiles = [];
  const reptiles = [];
  const triangles = [];
  const lasers = [];
  const angels = [];
  const eyes = [];
  const cosmics = [];
  let missileHomingToggle = false;
  let apocalypseTriggered = false;
  let cycleStart = 0;
  let cycle = 0;


  // Spawners control
  let nextReptile = 2;
  let nextAngel = 6;
  let nextEye = 10;
  let nextTriangle = rand(6.5, 9.0); // interval once triangles start
  let nextCosmic = rand(12, 20); // eventos cósmicos a partir de 180s

  // Input
  const keys = new Set();
  function jump(){ if (state === STATE.PLAY) player.tryJump(); }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','Space','KeyM','KeyR'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyM') Audio.toggle();
    if (e.code === 'KeyR' && state !== STATE.PLAY) resetAndStart();
    if (state === STATE.MENU && (e.code === 'Space' || e.code === 'ArrowUp')) { startGame(); return; }
    if (state !== STATE.PLAY) return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ArrowUp') jump();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('mousedown', (e) => { if (e.button === 0) jump(); });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || e.pointerType === 'mouse') jump();
  }, { passive: false });
  if (jumpBtn) {
    jumpBtn.addEventListener('pointerup', (e) => { e.preventDefault(); jump(); });
  }
  window.addEventListener('gesturestart', (e) => e.preventDefault());
  startBtn.addEventListener('click', startGame);

  let audioUnlocked = false;
  function unlockAudio(){
    if (!audioUnlocked) {
      try { Audio.unlock(); } catch {}
      audioUnlocked = true;
    }
  }
  ['pointerdown','keydown','mousedown','touchstart'].forEach(ev =>
    window.addEventListener(ev, unlockAudio, { once: true })
  );

  // Player
  const player = {
    x: () => W*0.2,
    y: groundY(),
    vy: 0,
    onGround: true,
    jumpsLeft: 2, // doble salto
    baseJumps: 2,
    extraWingJumps: 1, // salto extra cuando hay alas
    width: () => 50,
    height: () => 90,
    color: '#fff',
    tryJump(){
      const now = time;
      const inWing = now < wingActiveUntil;
      const boost = isTouchDevice ? 1.15 : 1; // salto ligeramente más alto en pantallas táctiles
      if (this.onGround || this.jumpsLeft > 0 || (inWing && this.jumpsLeft === 0 && this.extraWingJumps > 0)) {
        // Permite salto en tierra, saltos aéreos restantes o un salto extra por alas
        if (this.onGround) {
          this.vy = -620 * boost;
          this.onGround = false;
          this.jumpsLeft = this.baseJumps - 1; // consumimos uno al saltar
        } else if (this.jumpsLeft > 0) {
          this.vy = -560 * boost; // doble salto
          this.jumpsLeft--;
        } else if (inWing && this.extraWingJumps > 0) {
          this.vy = -540 * boost; // salto extra por alas
          this.extraWingJumps--;
        }
        Audio.jump();
      }
    },
    thigh(){ // coordenada objetivo para misiles (cintura)
      return { x: this.x()+this.width()*0.5, y: this.y - this.height()*0.3 };
    },
    update(dt){
      this.vy += 1600 * dt;
      this.y += this.vy * dt;
      const g = groundY();
      if (this.y >= g) {
        this.y = g;
        this.vy = 0;
        if (!this.onGround) {
          this.onGround = true;
          this.jumpsLeft = this.baseJumps;
          // Si hay alas activas, también permite recargar un salto extra de alas al tocar piso.
          if (time < wingActiveUntil) this.extraWingJumps = 1;
        }
      }
      // Comprueba fin de escudo
      shieldActive = time < shieldUntil;
    },
    render(ctx){
      // Sombra del jugador
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(this.x()+this.width()/2, groundY()+8, 28, 8, 0, 0, Math.PI*2);
      ctx.fill();

      const x = this.x(), y = this.y, w = this.width(), h = this.height();
      ctx.fillStyle = this.color;

      // Torso
      ctx.beginPath();
      ctx.roundRect(x + w*0.3, y - h*0.75, w*0.4, h*0.45, 10);
      ctx.fill();

      // Cabeza
      ctx.beginPath();
      ctx.arc(x + w*0.5, y - h*0.9, w*0.18, 0, Math.PI*2);
      ctx.fill();

      // Brazos estáticos
      ctx.fillRect(x + w*0.2, y - h*0.65, w*0.1, h*0.35);
      ctx.fillRect(x + w*0.7, y - h*0.65, w*0.1, h*0.35);

      // Piernas estáticas
      ctx.fillRect(x + w*0.34, y - h*0.35, w*0.16, h*0.35);
      ctx.fillRect(x + w*0.5, y - h*0.35, w*0.16, h*0.35);

      // Alas temporales (cuando activas)
      if (time < wingActiveUntil) {
        ctx.save();
        ctx.translate(x + w * 0.5, y - h * 0.55);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#f8faff';
        ctx.strokeStyle = '#d0d8ff';
        const drawWing = (dir) => {
          ctx.save();
          ctx.scale(dir, 1);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(w * 0.9, -h * 0.6, w * 0.8, h * 0.1);
          ctx.quadraticCurveTo(w * 0.6, h * 0.2, 0, h * 0.1);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const fx = w * (0.6 + i * 0.15);
            const fy = -h * (0.4 - i * 0.1);
            const tx = w * (0.4 + i * 0.1);
            const ty = h * (0.05 + i * 0.04);
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(fx, fy, tx, ty);
          }
          ctx.stroke();
          ctx.restore();
        };
        drawWing(-1);
        drawWing(1);
        ctx.restore();
      }

      // Escudo (hexagrama) cuando activo
      if (shieldActive) {
        const rad = 68;
        drawHexagram(ctx, x + w*0.5, y - h*0.45, rad);
      }
    }
  };

  function drawHexagram(ctx, cx, cy, r, color = '#ffd700') {
    ctx.save();
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI / 6) * i - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.5;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();
  }

  class Cosmic {
    constructor(type = null, giant = false){
      const baseTypes = ['galaxy','planet','nebula','comet'];
      this.type = type || (Math.random() < 0.1 ? 'ufo' : baseTypes[Math.floor(Math.random()*baseTypes.length)]);
      this.giant = giant;
      this.x = giant ? W/2 : rand(0, W);
      this.y = giant ? H/2 : rand(0, H*0.4);
      this.ttl = giant ? 4 : 2.5;
      if (this.type === 'comet' || this.type === 'ufo') {
        this.x = -50;
        this.y = rand(0, H*0.3);
        this.vx = this.type === 'comet' ? rand(150,220) : rand(60,90);
        this.ttl = (W + 100) / this.vx;
      }
      if (this.type === 'planet') {
        this.r = rand(10,20);
        const hue = Math.floor(rand(0,360));
        this.color = `hsl(${hue},60%,60%)`;
      }
    }
    update(dt){
      this.ttl -= dt;
      if (this.vx) this.x += this.vx * dt;
    }
    render(ctx){
      ctx.save();
      ctx.translate(this.x, this.y);
      switch(this.type){
        case 'galaxy':
          ctx.strokeStyle = 'rgba(200,200,255,0.7)';
          for(let i=0;i<6;i++){ ctx.beginPath(); ctx.arc(0,0,i*4,0,Math.PI*2); ctx.stroke(); }
          break;
        case 'nebula':
          const g = ctx.createRadialGradient(0,0,0,0,0,40);
          g.addColorStop(0,'rgba(255,200,255,0.6)');
          g.addColorStop(1,'rgba(100,0,150,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.fill();
          break;
        case 'blackhole':
          const r = this.giant ? 60 : 25;
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#444';
          ctx.lineWidth = this.giant ? 8 : 4;
          ctx.beginPath(); ctx.arc(0,0,r+7,0,Math.PI*2); ctx.stroke();
          break;
        case 'planet':
          ctx.fillStyle = this.color;
          ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 2; ctx.stroke();
          break;
        case 'comet':
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-40,0); ctx.lineTo(0,0); ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();
          break;
        case 'ufo':
          ctx.fillStyle = '#bbb';
          ctx.beginPath(); ctx.ellipse(0,0,15,6,0,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = 'rgba(150,255,150,0.7)';
          ctx.beginPath(); ctx.arc(0,-4,8,0,Math.PI*2); ctx.fill();
          break;
      }
      ctx.restore();
    }
    get alive(){ return this.ttl > 0; }
  }

  function clearEnemies(){
    missiles.length = reptiles.length = triangles.length = lasers.length = angels.length = eyes.length = 0;
  }

  // Hazards / Enemies
  class Reptile {
    constructor() {
      this.w = rand(40, 48);
      this.h = rand(90, 110);
      this.x = W + this.w + 10;
      this.y = groundY();
      this.speed = speed * rand(0.75, 1.0);
      this.alive = true;
    }
    update(dt) {
      this.x -= this.speed * dt;
      if (this.x < -80) this.alive = false;
    }
    render(ctx) {
      // reptiliano alto humanoide
      ctx.fillStyle = '#2bbf66';
      ctx.save();
      ctx.translate(this.x, this.y);
      // cuerpo
      ctx.beginPath();
      ctx.roundRect(-this.w*0.25, -this.h, this.w*0.5, this.h*0.6, 8);
      ctx.fill();
      // piernas
      ctx.fillRect(-this.w*0.2, -this.h*0.4, this.w*0.15, this.h*0.4);
      ctx.fillRect(this.w*0.05, -this.h*0.4, this.w*0.15, this.h*0.4);
      // brazos
      ctx.fillRect(-this.w*0.35, -this.h*0.75, this.w*0.1, this.h*0.35);
      ctx.fillRect(this.w*0.25, -this.h*0.75, this.w*0.1, this.h*0.35);
      // cabeza
      ctx.beginPath();
      ctx.ellipse(0, -this.h*0.9, this.w*0.3, this.h*0.15, 0, 0, Math.PI*2);
      ctx.fill();
      // ojo
      ctx.fillStyle = '#113f22';
      ctx.beginPath();
      ctx.ellipse(this.w*0.08, -this.h*0.92, this.w*0.05, this.h*0.03, 0, 0, Math.PI*2);
      ctx.fill();
      // boca con colmillos
      ctx.strokeStyle = '#113f22';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -this.h*0.88, this.w*0.08, 0, Math.PI);
      ctx.stroke();
      // colmillos
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-this.w*0.03, -this.h*0.88);
      ctx.lineTo(-this.w*0.02, -this.h*0.83);
      ctx.lineTo(-this.w*0.01, -this.h*0.88);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(this.w*0.01, -this.h*0.88);
      ctx.lineTo(this.w*0.02, -this.h*0.83);
      ctx.lineTo(this.w*0.03, -this.h*0.88);
      ctx.fill();
      ctx.fillStyle = '#113f22';
      // cola
      ctx.beginPath();
      ctx.moveTo(-this.w*0.25, -this.h*0.2);
      ctx.quadraticCurveTo(-this.w*0.6, -this.h*0.3, -this.w*0.7, -this.h*0.05);
      ctx.quadraticCurveTo(-this.w*0.4, -this.h*0.15, -this.w*0.25, -this.h*0.1);
      ctx.fill();
      ctx.restore();
    }
    bbox(){ return {x:this.x - this.w*0.25, y:this.y - this.h, w:this.w*0.5, h:this.h}; }
  }

  class Angel {
    constructor() {
      this.w = 36; this.h = 60;
      this.x = W + 40; this.y = groundY() - 120 - rand(0,80);
      this.speed = speed * rand(0.6, 0.9);
      this.cooldown = rand(0.6, 1.2);
      this.alive = true; this.fired = false;
    }
    update(dt) {
      this.x -= this.speed * dt;
      this.cooldown -= dt;
      if (!this.fired && this.cooldown <= 0) {
        this.fire();
      }
      if (this.x < -80) this.alive = false;
    }
    fire() {
      // Dispara misil apuntado al jugador
      const t = player.thigh();
      const dx = t.x - this.x, dy = t.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = 260;
      const vx = (dx / d) * spd;
      const vy = (dy / d) * spd;
      const homing = time >= 180 ? (missileHomingToggle = !missileHomingToggle) : false;
      missiles.push(new Missile(this.x, this.y, vx, vy, homing));
      this.fired = true;
    }
    render(ctx) {
      const chaos = (time - cycleStart) >= 90 && (time - cycleStart) < 115 && !apocalypseTriggered;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (chaos) {
        ctx.fillStyle = '#ff3030';
        // cuerpo
        ctx.beginPath();
        ctx.roundRect(-this.w*0.3, -this.h*0.6, this.w*0.6, this.h*0.6, 8);
        ctx.fill();
        // cabeza
        ctx.beginPath();
        ctx.arc(0, -this.h*0.75, 10, 0, Math.PI*2);
        ctx.fill();
        // cuernos grandes
        ctx.beginPath();
        ctx.moveTo(-6, -this.h*0.78); ctx.lineTo(-14, -this.h*1.05); ctx.lineTo(-2, -this.h*0.82); ctx.closePath();
        ctx.moveTo(6, -this.h*0.78); ctx.lineTo(14, -this.h*1.05); ctx.lineTo(2, -this.h*0.82); ctx.closePath();
        ctx.fill();
        // cola de diablo
        ctx.beginPath();
        ctx.moveTo(this.w*0.3, -this.h*0.2);
        ctx.quadraticCurveTo(this.w*0.6, 0, this.w*0.4, this.h*0.25);
        ctx.lineTo(this.w*0.52, this.h*0.22);
        ctx.lineTo(this.w*0.38, this.h*0.35);
        ctx.closePath();
        ctx.fill();
      } else {
        // silueta humanoide con alas
        ctx.fillStyle = '#eaeefc';
        // cuerpo
        ctx.beginPath();
        ctx.roundRect(-this.w*0.3, -this.h*0.6, this.w*0.6, this.h*0.6, 8);
        ctx.fill();
        // cabeza
        ctx.beginPath();
        ctx.arc(0, -this.h*0.75, 10, 0, Math.PI*2);
        ctx.fill();
        // alas más definidas
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#f8faff';
        ctx.strokeStyle = '#d0d8ff';
        const drawWing = (dir) => {
          ctx.save();
          ctx.scale(dir, 1);
          ctx.beginPath();
          ctx.moveTo(this.w * 0.3, -this.h * 0.45);
          ctx.quadraticCurveTo(this.w * 0.9, -this.h * 0.9, this.w * 1.1, -this.h * 0.2);
          ctx.quadraticCurveTo(this.w * 0.9, 0, this.w * 0.3, -this.h * 0.1);
          ctx.closePath();
          ctx.fill();
          // plumas
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const fx = this.w * (0.6 + i * 0.15);
            const fy = -this.h * (0.7 - i * 0.15);
            const tx = this.w * (0.4 + i * 0.1);
            const ty = -this.h * (0.15 - i * 0.03);
            ctx.moveTo(this.w * 0.3, -this.h * 0.45);
            ctx.quadraticCurveTo(fx, fy, tx, ty);
          }
          ctx.stroke();
          ctx.restore();
        };
        drawWing(1);
        drawWing(-1);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  class EyeAngel {
    constructor() {
      this.x = W + 40;
      this.y = groundY() - 120 - rand(20, 120);
      this.speed = speed * rand(0.7,1.0);
      this.alive = true;
      this.phase = rand(0, Math.PI*2);
    }
    update(dt) {
      this.x -= this.speed * dt;
      this.y += Math.sin(time*2 + this.phase) * 24 * dt * 10;
      if (this.x < -80) this.alive = false;
    }
    render(ctx) {
      // ojo con alas
      ctx.save();
      ctx.translate(this.x, this.y);
      // alas más realistas
      ctx.fillStyle = '#f0f4ff';
      ctx.strokeStyle = '#d0d8ff';
      const drawWing = (dir) => {
        ctx.save();
        ctx.scale(dir, 1);
        ctx.beginPath();
        ctx.moveTo(30, -10);
        ctx.quadraticCurveTo(80, -40, 78, 20);
        ctx.quadraticCurveTo(58, 10, 30, 5);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const fx = 60 + i * 12;
          const fy = -25 - i * 5;
          const tx = 40 + i * 8;
          const ty = 5 + i * 6;
          ctx.moveTo(30, -10);
          ctx.quadraticCurveTo(fx, fy, tx, ty);
        }
        ctx.stroke();
        ctx.restore();
      };
      drawWing(-1);
      drawWing(1);
      // ojo
      ctx.fillStyle = '#cde1ff';
      ctx.beginPath();
      ctx.ellipse(0, -20, 22, 14, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#1a274a';
      ctx.beginPath();
      ctx.arc(0, -20, 6, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    bbox(){ return {x:this.x-24, y:this.y-44, w:48, h:48}; }
  }

  class Missile {
    constructor(x, y, vx, vy, homing = true) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.speed = Math.hypot(vx, vy) || 260;
      this.alive = true;
      this.homing = homing;
    }
    update(dt) {
      if (this.homing) {
        const t = player.thigh();
        const dx = t.x - this.x, dy = t.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        this.vx = this.vx * 0.9 + this.speed * ux * 0.1;
        this.vy = this.vy * 0.9 + this.speed * uy * 0.1;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < -40 || this.x > W + 40 || this.y < -40 || this.y > H + 40) this.alive = false;
    }
    render(ctx) {
      // misil simple
      ctx.save();
      ctx.translate(this.x, this.y);
      const ang = Math.atan2(this.vy, this.vx);
      ctx.rotate(ang);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(-14, -3, 28, 6);
      ctx.fillStyle = '#f33';
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(22, -5); ctx.lineTo(22, 5); ctx.closePath(); ctx.fill();
      // estela
      ctx.strokeStyle = 'rgba(255,200,200,.5)';
      ctx.beginPath();
      ctx.moveTo(-14,0); ctx.lineTo(-28, Math.sin(time*60)*3); ctx.stroke();
      ctx.restore();
    }
    bbox(){ return {x:this.x-14, y:this.y-5, w:28, h:10}; }
  }

  class TriangleEye {
    constructor() {
      this.x = W + 50;
      // Flota en el cielo en vez de desplazarse junto al jugador
      this.y = rand(H * 0.15, H * 0.35);
      this.speed = speed * rand(0.5, 0.85);
      this.alive = true;
      this.aimTime = 0.4 + rand(0,0.25);
      this.fired = false;
      // objetivo dinámico del láser
      this.targetX = player.x() + player.width()*0.3;
      this.targetY = player.y - player.height()*0.4;
    }
    update(dt) {
      // si está cerca del jugador, frena para disparar
      if (!this.fired && this.x < W*0.55) {
        this.speed = Math.max(this.speed*0.92, 30);
        this.aimTime -= dt;
        // apuntar continuamente al jugador
        this.targetX = player.x() + player.width()*0.3;
        this.targetY = player.y - player.height()*0.4;
        if (this.aimTime <= 0) this.fire();
      } else {
        this.x -= this.speed * dt;
      }
      if (this.x < -60) this.alive = false;
    }
    fire() {
      // Dispara un láser rojo dirigido al jugador (evitable saltando)
      const eyeX = this.x;
      const eyeY = this.y - 6;
      lasers.push(new Laser(eyeX, eyeY, this.targetX, this.targetY));
      this.fired = true;
      Audio.burstLaser();
    }
    render(ctx) {
      // triángulo con ojo (no idéntico a IP)
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = '#f5e6a6';
      ctx.beginPath();
      ctx.moveTo(0, -32); ctx.lineTo(-28, 24); ctx.lineTo(28, 24); ctx.closePath(); ctx.fill();
      const chaos = (time - cycleStart) >= 90 && (time - cycleStart) < 115 && !apocalypseTriggered;
      if (chaos) {
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.ellipse(0, -6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#4aff4a';
        ctx.beginPath();
        ctx.ellipse(0, -6, 5, 5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, -6, 1.5, 5, 0, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(0, -6, 10, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#6fa8dc'; // iris
        ctx.beginPath();
        ctx.arc(0, -6, 4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, -6, 2, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
      // línea de apuntado (si aún no dispara)
      if (!this.fired) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#ff8a8a';
        ctx.setLineDash([6,6]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y-6);
        ctx.lineTo(this.targetX, this.targetY);
        ctx.stroke();
        ctx.restore();
      }
    }
    bbox(){ return {x:this.x-28, y:this.y-32, w:56, h:56}; }
  }

  class Laser {
    constructor(x, y, tx, ty) {
      this.x = x; this.y = y;
      const ang = Math.atan2(ty - y, tx - x);
      const speed = 800;
      this.vx = Math.cos(ang) * speed;
      this.vy = Math.sin(ang) * speed;
      this.prevX = x; this.prevY = y;
      this.alive = true;
      this.ttl = 1.5;
    }
    update(dt) {
      this.prevX = this.x; this.prevY = this.y;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.ttl -= dt;
      if (this.ttl <= 0 || this.x < -50 || this.x > W+50 || this.y < -50 || this.y > H+50) this.alive = false;
    }
    render(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,0,0,.9)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(this.prevX, this.prevY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.restore();
    }
    bbox(){
      const minX = Math.min(this.prevX, this.x);
      const minY = Math.min(this.prevY, this.y);
      return {x:minX, y:minY, w:Math.abs(this.x - this.prevX), h:Math.abs(this.y - this.prevY)};
    }
  }

  // Collisions
  function rectsOverlap(a,b){
    return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  }
  function playerBBox(){
    return { x: player.x(), y: player.y - player.height(), w: player.width()*0.6, h: player.height() };
  }

  // Reset & Start
  function resetAndStart(preserve=false){
    state = STATE.PLAY;
    missiles.length = reptiles.length = triangles.length = lasers.length = angels.length = eyes.length = 0;
    missileHomingToggle = false;
    apocalypseTriggered = false;
    nextCosmic = rand(12,20);
    if (preserve) {
      cycle++;
      cycleStart = time;
      startTs = performance.now()/1000 - time;
      livesEl.textContent = lives;
    } else {
      lives = livesBase;
      livesEl.textContent = lives;
      time = 0;
      cycleStart = 0;
      cycle = 0;
      startTs = performance.now()/1000;
    }
    lastTs = startTs;
    speed = 420;
    const ease = 1 + (240 - 0) / 240; // inicio más fácil
    const diff = 1 + cycle * 0.15;
    nextReptile = 2 * ease / diff;
    nextAngel = 6 * ease / diff;
    nextEye = 10 * ease / diff;
    nextTriangle = rand(6.5,9.0) * ease / diff;
    shieldUntil = time + 3; shieldActive = true; Audio.shield();
    wingBoosts = 0; wingActiveUntil = 0;
    overlay.style.display = 'none';
  }

  function startGame(){
    resetAndStart();
  }

  function endGame(){
    state = STATE.OVER;
    Audio.hit();
    // Guarda best
    best = Math.max(best, score);
    localStorage.setItem('runnerHighScore', String(best));
    bestEl.textContent = best.toFixed(1);
    // Auto-reinicio tras 3s
    setTimeout(() => resetAndStart(), 3000);
    // Muestra overlay de resultado
    overlay.querySelector('h1').textContent = '¡Eliminado! Reiniciando...';
    overlay.querySelector('.subtitle').textContent = `Tiempo: ${score.toFixed(1)} s · Récord: ${best.toFixed(1)} s`;
    overlay.style.display = 'flex';
    overlay.querySelector('#startBtn').textContent = 'Reintentar (Espacio)';
  }

  // HUD badges
  const hud = (() => {
    const container = document.createElement('div');
    container.className = 'hud';
    document.body.appendChild(container);
    const scorePill = document.createElement('div'); scorePill.className = 'pill'; container.appendChild(scorePill);
    const speedPill = document.createElement('div'); speedPill.className = 'pill'; container.appendChild(speedPill);
    const wingPill = document.createElement('div'); wingPill.className = 'pill'; container.appendChild(wingPill);
    return { scorePill, speedPill, wingPill, container };
  })();

  // Main loop
  function loop(tsMs){
    requestAnimationFrame(loop);
    const ts = tsMs/1000;
    const dt = clamp(ts - lastTs, 0, 0.05);
    lastTs = ts;
    if (state !== STATE.PLAY) return;

    time = ts - startTs;
    score = time;
    const cycleTime = time - cycleStart;

    if (!apocalypseTriggered && cycleTime >= 115) {
      apocalypseTriggered = true;
      cosmics.push(new Cosmic('blackhole', true));
      clearEnemies();
      resetAndStart(true);
      return;
    }

    // dificultad: se mantiene estable hasta los 240s globales y luego aumenta
    speed = 420 * (1 + Math.max(0, time - 240) * 0.004);
    if (cycleTime >= 90 && cycleTime < 115 && !apocalypseTriggered) speed *= 1.4;

    // Wing boosts a los 60s, 120s, 180s (15s cada uno) por ciclo
    const checkpoints = [60, 120, 180];
    for (let i=wingBoosts; i<checkpoints.length; i++) {
      if (cycleTime >= checkpoints[i]) {
        wingBoosts++;
        wingActiveUntil = time + 15;
        player.extraWingJumps = 1; // recarga salto extra
        // mensaje
        flashBadge(`¡Alas activas por 15s!`, 1600);
        Audio.shield();
      }
    }

    update(dt);
    render();
  }
  requestAnimationFrame(loop);

  function update(dt){
    const cycleTime = time - cycleStart;
    const chaos = cycleTime >= 90 && cycleTime < 115 && !apocalypseTriggered;
    const difficulty = 1 + cycle * 0.15;
    // Spawns
    nextReptile -= dt * (chaos ? 2 : 1);
    if (nextReptile <= 0) {
      reptiles.push(new Reptile());
      const early = 1 + Math.max(0, 240 - cycleTime) / 240;
      nextReptile = rand(1.6, 2.6) * early / (difficulty * (1 + Math.max(0, time - 240) * 0.003));
    }
    if (cycleTime >= 12) {
      nextAngel -= dt * (chaos ? 2 : 1);
      if (nextAngel <= 0) {
        angels.push(new Angel());
        const early = 1 + Math.max(0, 240 - cycleTime) / 240;
        nextAngel = rand(4.5, 7.0) * early / (difficulty * (1 + Math.max(0, time - 240) * 0.002));
      }
    }
    if (cycleTime >= 18) {
      nextEye -= dt * (chaos ? 2 : 1);
      if (nextEye <= 0) {
        eyes.push(new EyeAngel());
        const early = 1 + Math.max(0, 240 - cycleTime) / 240;
        nextEye = rand(5.5, 9.5) * early / (difficulty * (1 + Math.max(0, time - 240) * 0.002));
      }
    }
    if (cycleTime >= 36) {
      nextTriangle -= dt * (chaos ? 2 : 1);
      if (nextTriangle <= 0) {
        triangles.push(new TriangleEye());
        const early = 1 + Math.max(0, 240 - cycleTime) / 240;
        nextTriangle = rand(6.5, 9.0) * early / (difficulty * (1 + Math.max(0, time - 240) * 0.0025));
      }
    }
    nextCosmic -= dt;
    if (nextCosmic <= 0) {
      if (time >= 180 && Math.random() < 0.25) {
        cosmics.push(new Cosmic('blackhole', true));
        clearEnemies();
      } else {
        cosmics.push(new Cosmic());
      }
      nextCosmic = rand(12,20);
    }

    // Update entities
    player.update(dt);
    reptiles.forEach(o=>o.update(dt));
    angels.forEach(o=>o.update(dt));
    eyes.forEach(o=>o.update(dt));
    triangles.forEach(o=>o.update(dt));
    missiles.forEach(o=>o.update(dt));
    lasers.forEach(o=>o.update(dt));
    cosmics.forEach(o=>o.update(dt));

    // Collisions
    const pb = playerBBox();
    function tryHit(hitSource){
      if (shieldActive) return;
      lives -= 1;
      livesEl.textContent = lives;
      shieldUntil = time + 3;
      Audio.hit();
      if (lives <= 0) endGame();
    }

    reptiles.forEach(r => { if (r.alive && rectsOverlap(pb, r.bbox())) { r.alive=false; tryHit('reptile'); } });
    angels.forEach(a => { /* contacto directo no daña para balance */ });
    eyes.forEach(e => { if (e.alive && rectsOverlap(pb, e.bbox())) { e.alive=false; tryHit('eye'); } });
    missiles.forEach(m => { if (m.alive && rectsOverlap(pb, m.bbox())) { m.alive=false; tryHit('missile'); } });
    lasers.forEach(l => { if (l.alive && rectsOverlap(pb, l.bbox())) { l.alive=false; tryHit('laser'); } });

    // Cleanup
    function aliveFilter(o){ return o.alive !== false; }
    [reptiles, angels, eyes, triangles, missiles, lasers, cosmics].forEach(list => {
      for (let i=list.length-1;i>=0;i--) if (list[i].alive===false) list.splice(i,1);
    });

    // HUD
    hud.scorePill.textContent = `Tiempo: ${score.toFixed(1)} s · Récord: ${best.toFixed(1)} s · Vidas: ${lives} · Fase: ${cycle + 1}`;
    hud.speedPill.textContent = `Velocidad: ${(speed/420).toFixed(2)}x`;
    hud.wingPill.textContent = (time < wingActiveUntil) ? `Alas: ${(wingActiveUntil-time).toFixed(0)}s` : `Alas: —`;
  }

  function render(){
    // Fondo
    ctx.clearRect(0,0,W,H);
    // Cielo
    const grad = ctx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'#0b1020');
    grad.addColorStop(1,'#101a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
    drawStars();
    cosmics.forEach(o=>o.render(ctx));

    // Suelo
    ctx.fillStyle = '#0b1536';
    ctx.fillRect(0, groundY(), W, H-groundY());
    // marcas de suelo
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    for (let i=0;i<12;i++){
      const x = (i * 160 - (time*speed)%160);
      ctx.moveTo(x, groundY()+2);
      ctx.lineTo(x+80, groundY()+2);
    }
    ctx.stroke();

    // Render entities
    triangles.forEach(o=>o.render(ctx));
    lasers.forEach(o=>o.render(ctx));
    reptiles.forEach(o=>o.render(ctx));
    angels.forEach(o=>o.render(ctx));
    eyes.forEach(o=>o.render(ctx));
    missiles.forEach(o=>o.render(ctx));
    player.render(ctx);

    // Mensajes situacionales
    const cycleTime = time - cycleStart;
    if (cycleTime < 3) {
      drawTip(`ESCUDO INICIAL 3s`, player.x()+20, player.y - player.height() - 60);
    } else if (Math.abs((cycleTime%60)-0) < 0.2 && cycleTime>59.5 && cycleTime<61) {
      drawTip(`¡ALAS ACTIVADAS!`, player.x()+20, player.y - player.height() - 60);
    }
  }

  function drawTip(text, x, y){
    ctx.save();
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function flashBadge(msg, ms=1200){
    const b = document.createElement('div');
    b.className = 'badge';
    b.textContent = msg;
    document.body.appendChild(b);
    setTimeout(()=>b.remove(), ms);
  }

  // Mostrar menú al cargar
  overlay.style.display = 'flex';
  overlay.querySelector('h1').textContent = 'RUNNER: ÁNGELES Y SOMBRAS';
  overlay.querySelector('.subtitle').textContent = 'Evita misiles, rayos y reptilianos. Sobrevive el mayor tiempo posible.';
})();
