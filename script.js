// Element refs
const els = {
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  moodBadge: document.getElementById('moodBadge'),
  cameraSelect: document.getElementById('cameraSelect'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  snapBtn: document.getElementById('snapBtn'),
  mirrorToggle: document.getElementById('mirrorToggle'),
  themeToggle: document.getElementById('themeToggle'),
  topMood: document.getElementById('topMood'),
  topConf: document.getElementById('topConf'),
  fpsBar: document.getElementById('fpsBar'),
  fpsText: document.getElementById('fpsText'),
  facesBar: document.getElementById('facesBar'),
  facesText: document.getElementById('facesText'),
  emotionList: document.getElementById('emotionList'),
};

let human, stream, running = false, rafId = null;
let lastFrameTime = performance.now();

// Helpers
const pct = v => `${(v * 100).toFixed(1)}%`;
const clamp01 = v => Math.max(0, Math.min(1, v));

// Init Human.js
(async function init() {
  // theme restore
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.body.setAttribute('data-theme', savedTheme);

  human = new Human.Human({
    modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
    cacheModels: true,
    warmup: 'face',
    filter: { enabled: true, equalizeHistogram: true },
    face: {
      enabled: true,
      detector: { rotation: true, maxDetected: 5 },
      mesh: { enabled: true },
      emotion: { enabled: true },
    },
  });

  try {
    await human.load();
    await human.warmup();
  } catch (e) {
    console.error('Model load error:', e);
    alert('Failed to load AI models. Check your internet and refresh.');
    return;
  }

  // request temp permission so device labels show
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach(t => t.stop());
  } catch { /* ignore */ }

  await listCameras();
})();

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    els.cameraSelect.innerHTML = '';
    if (cams.length === 0) {
      const o = document.createElement('option');
      o.textContent = 'No camera found'; o.disabled = true; els.cameraSelect.appendChild(o);
      return;
    }
    cams.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = c.deviceId;
      opt.textContent = c.label || `Camera ${i + 1}`;
      els.cameraSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn('enumerateDevices failed', e);
  }
}

async function startCamera() {
  stopCamera();
  try {
    const deviceId = els.cameraSelect.value || undefined;
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    els.video.srcObject = stream;
    await els.video.play();
    // size canvas
    els.overlay.width = els.video.videoWidth || 1280;
    els.overlay.height = els.video.videoHeight || 720;

    applyMirror();
    running = true;
    loop();
  } catch (e) {
    console.error('Camera error:', e);
    alert('Unable to access camera. Check permissions and that no other app is using it.');
  }
}

function stopCamera() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}

function snapshot() {
  if (!els.video || !els.overlay) return;
  const c = document.createElement('canvas');
  c.width = els.overlay.width; c.height = els.overlay.height;
  const g = c.getContext('2d');
  g.drawImage(els.video, 0, 0, c.width, c.height);
  g.drawImage(els.overlay, 0, 0);
  const url = c.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `mood-${Date.now()}.png`; a.click();
}

function renderEmotions(list) {
  els.emotionList.innerHTML = '';
  if (!list || list.length === 0) {
    els.emotionList.innerHTML = '<div class="muted">No face detected.</div>';
    return;
  }
  list.forEach((e, idx) => {
    const row = document.createElement('div');
    row.className = 'emotion';
    row.innerHTML = `
      <div class="row">
        <span class="name">${e.emotion}</span>
        <span class="pct">${pct(e.score)}</span>
      </div>
      <div class="bar"><div class="fill" style="width:${pct(e.score)}"></div></div>
    `;
    els.emotionList.appendChild(row);
  });
}

function applyMirror() {
  const mirrored = els.mirrorToggle.checked;
  const scale = mirrored ? 'scaleX(-1)' : 'scaleX(1)';
  els.video.style.transform = scale;
  els.overlay.style.transform = scale;
}

async function loop() {
  if (!running) return;

  const t0 = performance.now();
  const result = await human.detect(els.video);

  // draw overlays
  const ctx = els.overlay.getContext('2d');
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  human.draw.canvas(els.overlay);
  human.draw.face(els.overlay, result.face, { labels: false });

  // summarize
  const faces = result.face || [];
  els.facesText.textContent = String(faces.length);
  els.facesBar.style.width = `${Math.min(100, (faces.length / 5) * 100)}%`;

  const emotions = faces[0]?.emotion || [];
  renderEmotions(emotions);

  if (emotions.length) {
    const top = [...emotions].sort((a, b) => b.score - a.score)[0];
    els.moodBadge.textContent = `Mood: ${top.emotion} (${pct(top.score)})`;
    els.topMood.textContent = top.emotion;
    els.topConf.style.width = pct(clamp01(top.score));
  } else {
    els.moodBadge.textContent = 'Mood: —';
    els.topMood.textContent = '—';
    els.topConf.style.width = '0%';
  }

  // FPS
  const dt = performance.now() - t0;
  const fps = 1000 / dt;
  els.fpsText.textContent = `${fps.toFixed(1)} fps`;
  els.fpsBar.style.width = `${Math.min(100, (fps / 60) * 100)}%`;

  rafId = requestAnimationFrame(loop);
}

// Events
els.startBtn.addEventListener('click', startCamera);
els.stopBtn.addEventListener('click', stopCamera);
els.snapBtn.addEventListener('click', snapshot);
els.cameraSelect.addEventListener('change', async () => {
  if (stream) await startCamera();
});
els.mirrorToggle.addEventListener('change', applyMirror);

// Theme toggle
els.themeToggle.addEventListener('click', () => {
  const cur = document.body.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 's') startCamera();
  if (key === 'x') stopCamera();
  if (key === 'c') snapshot();
  if (key === 'm') { els.mirrorToggle.checked = !els.mirrorToggle.checked; applyMirror(); }
  if (key === 't') els.themeToggle.click();
});
