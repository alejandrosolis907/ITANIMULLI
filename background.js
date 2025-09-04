const Bg = (() => {
  let layers = [];
  let groundPatternCanvas, groundPattern;
  let groundPatternSize = 64;
  let canvasW = 0, canvasH = 0;
  let mainCanvas;
  let lowRes = false;

  function initBackgroundLayers(canvas) {
    mainCanvas = canvas;
    canvasW = canvas.width;
    canvasH = canvas.height;
    createGroundPattern();
    createLayers();
  }

  function createGroundPattern() {
    const size = lowRes ? 32 : 64;
    groundPatternSize = size;
    groundPatternCanvas = document.createElement('canvas');
    groundPatternCanvas.width = groundPatternCanvas.height = size;
    const c = groundPatternCanvas.getContext('2d');
    c.fillStyle = '#4a2e3b';
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 50; i++) {
      c.fillStyle = Math.random() < 0.5 ? '#6b7c6b' : '#7a7a7a';
      c.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    groundPattern = c.createPattern(groundPatternCanvas, 'repeat');
  }

  function createLayers() {
    const gY = typeof groundY === 'function' ? groundY() : canvasH * 0.82;
    layers = [
      createMountains('#362640', '#432e54', gY * 0.4, 0.1),
      createMountains('#4a335e', '#5a3d75', gY * 0.5, 0.3),
      createMountains('#6a437c', '#7d4e94', gY * 0.6, 0.6)
    ];
  }

  function createMountains(color1, color2, height, speed) {
    const scale = lowRes ? 0.5 : 1;
    const off = document.createElement('canvas');
    off.width = canvasW * scale;
    off.height = height * scale;
    const c = off.getContext('2d');
    c.scale(scale, scale);
    const grad = c.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(0, height);
    const step = canvasW / 5;
    for (let x = 0; x <= canvasW; x += step) {
      const peak = height - Math.random() * height * 0.8;
      c.lineTo(x, peak);
    }
    c.lineTo(canvasW, height);
    c.closePath();
    c.fill();
    return { canvas: off, height, width: canvasW, speed, x: 0 };
  }

  function updateBackground(dt) {
    const s = (typeof window !== 'undefined' && typeof window._gameSpeed === 'function') ? window._gameSpeed() : 1;
    layers.forEach(l => {
      l.x -= s * dt * l.speed;
      if (l.x <= -l.width) l.x += l.width;
    });
    offsets.ground -= s * dt;
    if (offsets.ground <= -groundPatternSize) offsets.ground += groundPatternSize;
    if (!lowRes && dt > 0.05) { lowRes = true; initBackgroundLayers(mainCanvas); }
    else if (lowRes && dt < 0.035) { lowRes = false; initBackgroundLayers(mainCanvas); }
  }

  const offsets = { ground: 0 };

  function drawParallax(ctx) {
    const gY = typeof groundY === 'function' ? groundY() : canvasH * 0.82;
    layers.forEach(l => {
      let x = l.x;
      const y = gY - l.height;
      while (x < canvasW) {
        ctx.drawImage(l.canvas, x, y);
        x += l.width;
      }
    });
  }

  function drawGround(ctx) {
    const gY = typeof groundY === 'function' ? groundY() : canvasH * 0.82;
    if (!groundPattern) return;
    ctx.save();
    ctx.translate(offsets.ground, 0);
    ctx.fillStyle = groundPattern;
    ctx.fillRect(-groundPatternSize, gY, canvasW + groundPatternSize, canvasH - gY);
    ctx.restore();
    const grad = ctx.createLinearGradient(0, gY - 10, 0, gY + 10);
    grad.addColorStop(0, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, gY - 10, canvasW, 10);
  }

  return { initBackgroundLayers, updateBackground, drawParallax, drawGround };
})();
