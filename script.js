/* ── State ──────────────────────────────────────────────── */
const state = {
  mode:        'draw',
  image:       null,
  sketchStyle: 'line',
  foldPattern: 'square',
  edgeStrength: 50,
  gridSize:     60,
  gridOpacity:  70,
  gridColor:   '#2563eb',
  invertSketch: false,
};

/* ── DOM Refs ───────────────────────────────────────────── */
const canvas      = document.getElementById('mainCanvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const fileInput   = document.getElementById('fileInput');
const uploadZone  = document.getElementById('uploadZone');
const workspace   = document.getElementById('workspace');
const loader      = document.getElementById('loader');
const drawControls = document.getElementById('drawControls');
const foldControls = document.getElementById('foldControls');

/* ── Mode Switching ─────────────────────────────────────── */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn);
    });
    drawControls.hidden = state.mode !== 'draw';
    foldControls.hidden = state.mode !== 'fold';
    if (state.image) render();
  });
});

/* ── File Upload ────────────────────────────────────────── */
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

function loadFile(file) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1000;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const r = Math.min(MAX / w, MAX / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      canvas.width  = w;
      canvas.height = h;
      state.image   = img;
      workspace.hidden = false;
      render();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ── Render Dispatch ────────────────────────────────────── */
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  if (state.mode === 'draw') applySketch();
  else                       applyFoldGrid();
}

/* ═══════════════════════════════════════════════════════════
   DRAW MODE — Sketch Effects
   ═══════════════════════════════════════════════════════════ */

async function applySketch() {
  showLoader(true);
  setApplyDisabled(true);
  await tick(); // let browser repaint before heavy work

  try {
    const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const out = state.sketchStyle === 'pencil'
      ? pencilSketch(src)
      : lineArtSketch(src);
    ctx.putImageData(out, 0, 0);
  } finally {
    showLoader(false);
    setApplyDisabled(false);
  }
}

function tick() { return new Promise(r => setTimeout(r, 0)); }

function showLoader(v)       { loader.hidden = !v; }
function setApplyDisabled(v) {
  document.getElementById('applySketch').disabled = v;
  document.getElementById('applyFold').disabled   = v;
}

/* Grayscale helper */
function toGray(data, n) {
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}

/* Fast O(n) box blur (separable passes) */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const diam = 2 * r + 1;

  // Horizontal
  for (let y = 0; y < h; y++) {
    let sum = src[y * w] * (r + 1);
    for (let x = 1; x <= r; x++) sum += src[y * w + Math.min(x, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / diam;
      sum -= src[y * w + Math.max(0, x - r)];
      sum += src[y * w + Math.min(w - 1, x + r + 1)];
    }
  }

  // Vertical
  for (let x = 0; x < w; x++) {
    let sum = tmp[x] * (r + 1);
    for (let y = 1; y <= r; y++) sum += tmp[Math.min(y, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum / diam;
      sum -= tmp[Math.max(0, y - r) * w + x];
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x];
    }
  }

  return dst;
}

/* Line Art — Sobel edge detection */
function lineArtSketch({ data, width: w, height: h }) {
  const gray     = toGray(data, w * h);
  const blurred  = boxBlur(gray, w, h, 1);
  const out      = new ImageData(w, h);
  const d        = out.data;
  const scale    = state.edgeStrength / 50;
  const inv      = state.invertSketch;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const g = blurred;
      const gx =
        -g[(y-1)*w+(x-1)] + g[(y-1)*w+(x+1)]
        - 2*g[y*w+(x-1)] + 2*g[y*w+(x+1)]
        - g[(y+1)*w+(x-1)] + g[(y+1)*w+(x+1)];
      const gy =
        -g[(y-1)*w+(x-1)] - 2*g[(y-1)*w+x] - g[(y-1)*w+(x+1)]
        + g[(y+1)*w+(x-1)] + 2*g[(y+1)*w+x] + g[(y+1)*w+(x+1)];

      const mag = Math.min(255, Math.sqrt(gx*gx + gy*gy) * scale);
      const val = inv ? mag : 255 - mag;
      const i   = (y * w + x) * 4;
      d[i] = d[i+1] = d[i+2] = val;
      d[i+3] = 255;
    }
  }
  return out;
}

/* Pencil Sketch — Color-dodge blend */
function pencilSketch({ data, width: w, height: h }) {
  const gray    = toGray(data, w * h);
  const invGray = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) invGray[i] = 255 - gray[i];

  const blurR   = Math.max(3, Math.round(state.edgeStrength / 5));
  const blurred = boxBlur(invGray, w, h, blurR);

  const out = new ImageData(w, h);
  const d   = out.data;
  const inv = state.invertSketch;

  for (let i = 0; i < gray.length; i++) {
    const denom = 255 - blurred[i];
    let val = denom < 1 ? 255 : Math.min(255, (gray[i] * 255) / denom);
    if (inv) val = 255 - val;
    const p = i * 4;
    d[p] = d[p+1] = d[p+2] = val;
    d[p+3] = 255;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════
   FOLD MODE — Grid Overlays
   ═══════════════════════════════════════════════════════════ */

function applyFoldGrid() {
  const { width: w, height: h } = canvas;
  const opacity  = state.gridOpacity / 100;
  const size     = state.gridSize;
  const hex      = state.gridColor;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  const rgba     = (a) => `rgba(${r},${g},${b},${a * opacity})`;

  ctx.save();
  ctx.lineCap = 'round';

  if      (state.foldPattern === 'square')  drawSquare(w, h, size, rgba);
  else if (state.foldPattern === 'diamond') drawDiamond(w, h, size, rgba);
  else if (state.foldPattern === 'radial')  drawRadial(w, h, size, rgba);

  ctx.restore();
}

/* Square grid — solid mountain folds, dashed valley folds */
function drawSquare(w, h, size, rgba) {
  // Mountain (solid)
  ctx.strokeStyle = rgba(0.9);
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);

  for (let x = size; x < w; x += size * 2) { line(x, 0, x, h); }
  for (let y = size; y < h; y += size * 2) { line(0, y, w, y); }

  // Valley (dashed)
  ctx.strokeStyle = rgba(0.7);
  ctx.setLineDash([6, 5]);

  for (let x = size * 2; x < w; x += size * 2) { line(x, 0, x, h); }
  for (let y = size * 2; y < h; y += size * 2) { line(0, y, w, y); }
}

/* Diamond grid — two 45° diagonal sets */
function drawDiamond(w, h, size, rgba) {
  const diag = Math.max(w, h) * 1.5;

  // NW → SE (mountain, solid)
  ctx.strokeStyle = rgba(0.9);
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([]);
  for (let p = -diag; p < w + diag; p += size) {
    line(p, 0, p + h, h);
  }

  // NE → SW (valley, dashed)
  ctx.strokeStyle = rgba(0.7);
  ctx.setLineDash([6, 5]);
  for (let p = -diag; p < w + diag; p += size) {
    line(p, 0, p - h, h);
  }
}

/* Radial grid — spokes + concentric arcs */
function drawRadial(w, h, size, rgba) {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const spokes = Math.max(8, Math.round((2 * Math.PI * (size * 2)) / size));

  // Spokes
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2;
    const isMtn = i % 2 === 0;
    ctx.strokeStyle = isMtn ? rgba(0.9) : rgba(0.65);
    ctx.lineWidth   = 1.5;
    ctx.setLineDash(isMtn ? [] : [6, 5]);
    line(cx, cy, cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
  }

  // Concentric circles (valley folds)
  ctx.strokeStyle = rgba(0.6);
  ctx.setLineDash([4, 4]);
  for (let rr = size; rr < maxR; rr += size) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function line(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/* ── Controls ───────────────────────────────────────────── */

/* Sketch style chips */
document.querySelectorAll('#sketchStyleGroup .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#sketchStyleGroup .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.sketchStyle = btn.dataset.sketch;
  });
});

/* Fold pattern chips */
document.querySelectorAll('#foldPatternGroup .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#foldPatternGroup .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.foldPattern = btn.dataset.fold;
  });
});

/* Sliders */
const edgeSlider = document.getElementById('edgeStrength');
edgeSlider.addEventListener('input', e => {
  state.edgeStrength = +e.target.value;
  document.getElementById('strengthOut').value = e.target.value;
});

const gridSlider = document.getElementById('gridSize');
gridSlider.addEventListener('input', e => {
  state.gridSize = +e.target.value;
  document.getElementById('gridSizeOut').value = e.target.value;
  if (state.image && state.mode === 'fold') render();
});

const opacitySlider = document.getElementById('gridOpacity');
opacitySlider.addEventListener('input', e => {
  state.gridOpacity = +e.target.value;
  document.getElementById('opacityOut').value = e.target.value;
  if (state.image && state.mode === 'fold') render();
});

document.getElementById('gridColor').addEventListener('input', e => {
  state.gridColor = e.target.value;
  if (state.image && state.mode === 'fold') render();
});

document.getElementById('invertSketch').addEventListener('change', e => {
  state.invertSketch = e.target.checked;
});

/* Apply buttons */
document.getElementById('applySketch').addEventListener('click', () => {
  if (state.image) render();
});

document.getElementById('applyFold').addEventListener('click', () => {
  if (state.image) render();
});

/* Reset */
document.getElementById('resetBtn').addEventListener('click', () => {
  if (state.image) render();
});

/* Download */
document.getElementById('downloadBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `${state.mode}-studio-${Date.now()}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});
