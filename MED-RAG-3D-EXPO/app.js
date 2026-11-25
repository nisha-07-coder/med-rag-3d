// MED-RAG: Inside the Intelligence. Three.js is loaded locally from ./vendor (no CDN, no API keys).
import * as THREE from './vendor/three.module.min.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Stage content (matches the real MED-RAG stack) ---------- */
const S = [
 {t:'User uploads a medical document', simple:'The user uploads a medical PDF or supported image through the dashboard.',
  tech:'The browser dashboard sends the file to the backend through an API request.', stack:['HTML','CSS','JavaScript','Python FastAPI'],
  inp:'Medical PDF / image', out:'File received by backend', flow:'USER → DASHBOARD → FASTAPI BACKEND'},
 {t:'PDF processing and OCR', simple:'The system reads the text on every page. Typed pages are read directly; scanned pages are "read" by OCR.',
  tech:'Path A, text-based PDF: PyMuPDF extracts selectable text. Path B, image-based PDF or image: Tesseract OCR recognises the visible text. The current OCR setup uses English language data only.',
  stack:['PyMuPDF','Tesseract OCR (English)'], inp:'PDF pages / images', out:'Extracted text per page', flow:'DOCUMENT → PYMUPDF or TESSERACT → TEXT'},
 {t:'Text chunking', simple:'Long reports are cut into small sections called chunks, so the system can find the relevant part instead of searching one giant block.',
  tech:'Chunking in the RAG pipeline: 70 words per chunk with 15 words of overlap. Source filename and page number are kept with every chunk.',
  stack:['Chunk size 70 words','Overlap 15 words','Filename + page metadata'], inp:'Extracted text', out:'Chunks + metadata', flow:'EXTRACTED TEXT → SMALLER CHUNKS + METADATA'},
 {t:'Multilingual embedding generation', simple:'Each chunk becomes a list of numbers that captures its meaning, so related text can be found even when the wording differs.',
  tech:'A pretrained sentence-embedding model (not trained by our team) outputs a 384-dimension vector per chunk.',
  stack:['paraphrase-multilingual-MiniLM-L12-v2','384 dimensions'], inp:'Text chunks', out:'Numerical vectors', flow:'TEXT CHUNKS → NUMERICAL VECTORS'},
 {t:'Qdrant vector database', simple:'The vectors are stored together with their text and source details, ready to be searched.',
  tech:'Vectors, chunk text and metadata are stored in a Qdrant Cloud collection, which later performs similarity search.',
  stack:['Qdrant Cloud','medical_documents_integrated_v1','Vector size 384'], inp:'Vectors + text + metadata', out:'Searchable collection', flow:'VECTORS + TEXT + METADATA → QDRANT CLOUD'},
 {t:'User asks a question', simple:'The question is turned into numbers in the same way as the document chunks.',
  tech:'The question is sent to the backend and converted into a 384-dimension embedding by the same embedding model.',
  stack:['FastAPI','paraphrase-multilingual-MiniLM-L12-v2'], inp:'"What is my current HbA1c level?"', out:'Question embedding', flow:'USER QUESTION → QUESTION EMBEDDING'},
 {t:'Semantic retrieval', simple:'The system finds the pieces of the report whose meaning is closest to the question.',
  tech:'Qdrant similarity search returns the top 6 chunks, each with its source metadata.',
  stack:['Qdrant similarity search','Top-K = 6'], inp:'Question vector', out:'6 evidence chunks + sources', flow:'QUESTION VECTOR → QDRANT SEARCH → RELEVANT EVIDENCE'},
 {t:'Gemini answer generation', simple:'An AI writer reads the question and the retrieved evidence, then drafts an answer based on that evidence.',
  tech:'Retrieval-Augmented Generation: the question and retrieved chunks are passed to Google Gemini 3.6 Flash, a pretrained model we did not train.',
  stack:['Google Gemini 3.6 Flash','RAG'], inp:'Question + retrieved evidence', out:'Generated answer', flow:'QUESTION + EVIDENCE → GEMINI → ANSWER'},
 {t:'Answer with source citation', simple:'The answer appears with the file name and page, so the user can check it in the original document.',
  tech:'Citations come from the filename and page metadata stored with each chunk. They help verification; they are not guaranteed to be correct.',
  stack:['Filename metadata','Page metadata'], inp:'Generated answer + metadata', out:'Answer card with source',
  flow:'ANSWER + SOURCE → DASHBOARD', extra:'<h5>Illustrative sample</h5><p>Q: What is my current HbA1c level?<br><b>A: The recorded HbA1c value is 8.1%.</b><br>Source: 01_type2_diabetes_report.pdf, page 5</p>'},
 {t:'Safe abstention', simple:'If the report does not contain the answer, MED-RAG says so instead of inventing one.',
  tech:'When retrieval finds insufficient supporting evidence, the system abstains. This reduces unsupported answers but is not a guarantee, and the system is not clinically validated.',
  stack:['Evidence check','Abstention response'], inp:'Question with no support in the report', out:'Safe refusal message',
  flow:'LOW EVIDENCE → ABSTAIN', extra:'<h5>Message shown</h5><p><b>"I could not find enough relevant information in this patient\'s documents to answer safely."</b></p>'}
];

/* ---------- Scene setup with WebGL fallback ---------- */
let renderer, scene, camera, hasGL = true;
try {
  renderer = new THREE.WebGLRenderer({canvas: $('#gl'), antialias: true, powerPreference: 'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x050a18, 0.012);
  camera = new THREE.PerspectiveCamera(55, 1, .1, 400);
} catch (e) { hasGL = false; $('#gl').style.display = 'none'; console.warn('WebGL unavailable, using panel-only mode'); }

const POS = S.map((_, i) => new THREE.Vector3(i * 15 - 67, Math.sin(i * 1.3) * 3, Math.cos(i * 0.9) * 9));
const anims = [];
const CY = 0x35e0ff, VI = 0x8b6cff, WARN = 0xff6b6b;
const mat = (c, o = .8, w = false) => new THREE.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: w ? .9 : .28, roughness: .3, metalness: .45, transparent: true, opacity: o, wireframe: w, side: THREE.DoubleSide});
const mesh = (g, c, o, w) => new THREE.Mesh(g, mat(c, o, w));

function points(n, spread, color, size = .12) {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) a[i] = (Math.random() - .5) * spread;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({color, size, transparent: true, opacity: .9}));
}

/* One distinctive 3D object per stage. Each builder returns a group and may register an animation. */
const builders = [
 g => { // dashboard + flying PDF
   g.add(mesh(new THREE.PlaneGeometry(6, 3.6), CY, .15)); const f = mesh(new THREE.PlaneGeometry(6, 3.6), CY, .6, true); g.add(f);
   const d = mesh(new THREE.PlaneGeometry(1.4, 1.9), 0xffffff, .9); g.add(d);
   anims.push(t => { const k = (t % 3) / 3; d.position.set(-5 + k * 5, 3 - k * 3, .3); d.scale.setScalar(1 - k * .5); });
 },
 g => { // scanner: floating pages + scan beam
   const pages = [-2.4, 0, 2.4].map(x => { const p = mesh(new THREE.PlaneGeometry(1.8, 2.5), 0xdce8ff, .75); p.position.set(x, 0, x * .2); g.add(p); return p; });
   const beam = mesh(new THREE.PlaneGeometry(8, .1), CY, 1); g.add(beam);
   anims.push(t => { beam.position.y = Math.sin(t * 2) * 1.4; pages.forEach((p, i) => p.position.y = Math.sin(t + i) * .3); });
 },
 g => { // chunks: small floating blocks
   for (let i = 0; i < 18; i++) { const b = mesh(new THREE.BoxGeometry(1.1, .5, .15), i % 3 ? CY : VI, .7); b.userData = {x: (i % 6 - 2.5) * 1.5, y: (Math.floor(i / 6) - 1) * 1.2, p: i}; g.add(b); }
   anims.push(t => g.children.forEach(b => { const u = b.userData; b.position.set(u.x, u.y + Math.sin(t * 1.5 + u.p) * .25, Math.sin(u.p) * 1.2); b.rotation.y = Math.sin(t + u.p) * .3; }));
 },
 g => { // embedding vector space
   const p = points(260, 7, CY); g.add(p); g.add(mesh(new THREE.IcosahedronGeometry(3.6, 1), VI, .25, true));
   anims.push(t => { p.rotation.y = t * .25; });
 },
 g => { // Qdrant database stack
   for (let i = 0; i < 4; i++) { const c = mesh(new THREE.CylinderGeometry(2.2, 2.2, .6, 40, 1, true), i % 2 ? VI : CY, .5, true); c.position.y = i * .9 - 1.4; g.add(c); }
   const p = points(60, 3.5, 0xffffff, .1); g.add(p);
   anims.push(t => { g.rotation.y = t * .3; p.position.y = Math.sin(t * 2) * .3; });
 },
 g => { // question orb
   const s = mesh(new THREE.SphereGeometry(1.2, 24, 16), CY, .35, true); g.add(s);
   const r = mesh(new THREE.TorusGeometry(2.2, .05, 8, 60), VI, .9); g.add(r);
   anims.push(t => { s.rotation.y = t; r.rotation.x = t * .8; s.scale.setScalar(1 + Math.sin(t * 3) * .08); });
 },
 g => { // retrieval: dim field, six glowing evidence nodes
   const hot = [];
   for (let i = 0; i < 40; i++) { const hi = i < 6, n = mesh(new THREE.SphereGeometry(hi ? .28 : .12, 10, 8), hi ? 0xffe66b : 0x3a4a70, hi ? 1 : .6);
     n.position.set((Math.random() - .5) * 8, (Math.random() - .5) * 5, (Math.random() - .5) * 4); if (hi) hot.push(n); g.add(n); }
   anims.push(t => hot.forEach((n, i) => n.scale.setScalar(1 + .35 * Math.sin(t * 4 + i))));
 },
 g => { // Gemini neural network
   const nodes = [];
   for (let l = 0; l < 4; l++) for (let k = 0; k < 4; k++) { const n = mesh(new THREE.SphereGeometry(.22, 10, 8), l % 2 ? VI : CY, .95); n.position.set(l * 1.8 - 2.7, k * 1.2 - 1.8, 0); g.add(n); nodes.push(n); }
   const pts = []; nodes.forEach(a => nodes.forEach(b => { if (Math.abs(b.position.x - a.position.x - 1.8) < .01) pts.push(a.position, b.position); }));
   g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: CY, transparent: true, opacity: .3})));
   anims.push(t => nodes.forEach((n, i) => n.scale.setScalar(1 + .4 * Math.max(0, Math.sin(t * 3 - n.position.x * 1.2 + i * .3)))));
 },
 g => { // answer card + link to source page
   const c = mesh(new THREE.PlaneGeometry(4, 2.2), CY, .25); g.add(c); g.add(mesh(new THREE.PlaneGeometry(4, 2.2), CY, .8, true));
   const src = mesh(new THREE.PlaneGeometry(1.6, 2.2), 0xdce8ff, .8); src.position.set(4.2, 0, -1); g.add(src);
   const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(2, 0, 0), src.position]), new THREE.LineBasicMaterial({color: VI}));
   g.add(ln); anims.push(t => { c.position.y = Math.sin(t * 1.5) * .2; });
 },
 g => { // abstention warning ring
   const r = mesh(new THREE.TorusGeometry(2, .12, 8, 60), WARN, .95); g.add(r); const q = mesh(new THREE.OctahedronGeometry(.8), WARN, .5, true); g.add(q);
   anims.push(t => { r.scale.setScalar(1 + .12 * Math.sin(t * 4)); q.rotation.y = t; });
 }
];

/* End users: low-poly people at a desk with a glowing monitor (patient, caregiver, healthcare professional) */
function person(color, x) {
  const p = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(.45, 1, 6, 14), color, .95); body.position.y = .2;
  const head = mesh(new THREE.SphereGeometry(.38, 20, 14), 0xf1d3b8, 1); head.position.y = 1.3;
  p.add(body, head); p.position.set(x, -1.2, 3); return p;
}
function desk(g) {
  const top = mesh(new THREE.BoxGeometry(9, .15, 2), 0x1d2c55, .95); top.position.set(0, -.6, 3.2); g.add(top);
  const scr = mesh(new THREE.PlaneGeometry(3, 1.8), CY, .55); scr.position.set(0, .6, 2.6); g.add(scr);
  g.add(person(0x4f8bff, -3), person(0xb487ff, 0), person(0x2fd6a5, 3)); // patient, caregiver, clinician
}
const b0 = builders[0], b5 = builders[5];
builders[0] = g => { b0(g); desk(g); };
builders[5] = g => { b5(g); const m = person(0x4f8bff, -3.5); g.add(m); };
if (hasGL) {
  scene.add(new THREE.AmbientLight(0x6f86c8, .7));
  const L1 = new THREE.PointLight(CY, 90, 80), L2 = new THREE.PointLight(VI, 90, 80); scene.add(L1, L2);
  anims.push(t => { L1.position.set(Math.cos(t * .4) * 60, 12, 12); L2.position.set(Math.sin(t * .3) * 60, -8, 18); });
  scene.add(points(900, 160, 0x6f8fff, .18));
  // glowing data path linking the stages, with travelling data packets
  const curve = new THREE.CatmullRomCurve3(POS);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(300)), new THREE.LineBasicMaterial({color: CY, transparent: true, opacity: .45})));
  const packets = Array.from({length: 12}, () => { const m = mesh(new THREE.SphereGeometry(.25, 8, 8), 0xffffff, .95); scene.add(m); return m; });
  anims.push(t => packets.forEach((m, i) => m.position.copy(curve.getPoint(((t * .04 + i / 12) % 1)))));
  S.forEach((_, i) => { const g = new THREE.Group(); g.position.copy(POS[i]); builders[i](g); g.userData.stage = i; scene.add(g); });
}

/* ---------- Camera director ---------- */
let idx = 0, overview = false, playing = false, stageTime = 0;
const STAGE_MS = 11000;
const camTo = new THREE.Vector3(), lookTo = new THREE.Vector3(), look = new THREE.Vector3();
function aim() {
  if (!hasGL) return;
  if (overview) { camTo.set(0, 22, 62); lookTo.set(0, 0, 0); }
  else { const p = POS[idx]; camTo.set(p.x + 3, p.y + 1.5, p.z + 9); lookTo.set(p.x - 1, p.y, p.z); }
}

/* ---------- UI: panel, dots, progress ---------- */
const panel = $('#panel'), dots = $('#dots'), bar = $('#bar i');
S.forEach((_, i) => { const b = document.createElement('button'); b.textContent = i + 1; b.title = S[i].t; b.onclick = () => go(i); dots.appendChild(b); });

function render() {
  const s = S[idx];
  panel.innerHTML = overview ? `<h3>The complete journey</h3><p>Ten stages: upload, extraction (PyMuPDF or Tesseract), chunking, embedding, Qdrant storage, question, retrieval, Gemini answer, cited answer, and safe abstention. Pick a stage number below to zoom in.</p>` :
   `<span class="tag">Stage ${idx + 1} of 10</span><h3>${s.t}</h3><h5>In plain words</h5><p>${s.simple}</p><h5>Under the hood</h5><p>${s.tech}</p>
    <h5>Technology</h5><div class="chips">${s.stack.map(x => `<span>${x}</span>`).join('')}</div>${s.extra || ''}
    <div class="io"><span>IN: ${s.inp}</span>→<span>OUT: ${s.out}</span></div><p class="small" style="margin-top:10px;color:#9db0d0">${s.flow}</p>`;
  panel.scrollTop = 0;
  $$('button', dots).forEach((b, i) => b.classList.toggle('on', !overview && i === idx));
}
function go(i) { overview = false; idx = Math.max(0, Math.min(S.length - 1, i)); stageTime = 0; aim(); render(); }
function showOverview() { overview = true; playing = false; $('#play').textContent = 'Start journey'; aim(); render(); }
function finish() { showOverview(); $('#end').hidden = false; }

$('#prev').onclick = () => { playing && pause(); go(idx - 1); };
$('#next').onclick = () => { playing && pause(); go(idx + 1); };
function pause() { playing = false; $('#play').textContent = 'Resume'; }
$('#play').onclick = () => { if (playing) return pause(); if (overview) go(0); playing = true; $('#play').textContent = 'Pause'; };
$('#replay').onclick = () => { $('#end').hidden = true; go(0); playing = true; $('#play').textContent = 'Pause'; };
$('#again').onclick = $('#replay').onclick;
$('#overview').onclick = showOverview;

$('#enter').onclick = () => {
  $('#intro').style.display = 'none'; $('#hud').hidden = false; resize(); go(0);
  if (hasGL) { camera.position.set(POS[0].x - 20, 14, 40); look.copy(POS[0]); } // cinematic fly-in
};

/* ---------- Modals ---------- */
$$('[data-open]').forEach(b => b.onclick = () => { pause(); $('#m-' + b.dataset.open).hidden = false; });
$$('.x').forEach(b => b.onclick = () => b.closest('.modal').hidden = true);
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.hidden = true; }));
addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal').forEach(m => m.hidden = true);
  if (e.key === 'ArrowRight') $('#next').click(); if (e.key === 'ArrowLeft') $('#prev').click(); });

// Before / after: original page vs extracted chunks
const CH = ['Lab Report (sample) Patient: [illustrative] HbA1c: 8.1 %', 'HbA1c: 8.1 % Fasting glucose: 142 mg/dL Clinical note:', 'Clinical note: follow-up in 3 months.'];
$('#xform').onclick = () => {
  const c = $('#chunks'); c.innerHTML = ''; $('#pdfv').classList.add('gone');
  CH.forEach((t, i) => setTimeout(() => c.insertAdjacentHTML('beforeend', `<div class="chunk">${t}<em>01_sample_report.pdf · page ${i + 1} (sample metadata)</em></div>`), 500 + i * 700));
  setTimeout(() => $('#pdfv').classList.remove('gone'), 3200);
};

// Question demo: simulated, clearly labelled, no network calls
const STEPS = ['Question', 'Embedding (384-d)', 'Qdrant search', 'Retrieved evidence (top 6)', 'Gemini', 'Answer + citation'];
const flow = $('#flow'); STEPS.forEach(s => flow.insertAdjacentHTML('beforeend', `<span>${s}</span>`));
$('#run').onclick = () => {
  const el = $$('span', flow); el.forEach(e => e.classList.remove('on')); $('#out').innerHTML = 'Running simulated sample…';
  el.forEach((e, i) => setTimeout(() => { e.classList.add('on'); if (i === 3) $('#out').innerHTML = 'Evidence found: "HbA1c: 8.1 %" (page 5)…'; }, i * 800));
  setTimeout(() => $('#out').innerHTML = '<b>Answer:</b> The recorded HbA1c value is 8.1%.<br><b>Source:</b> 01_type2_diabetes_report.pdf, page 5<br><small>Illustrative sample data only. Not a live connection.</small>', STEPS.length * 800);
};

/* ---------- Render loop ---------- */
function resize() { if (!hasGL) return; renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
camera && camera.position.set(-90, 12, 45);
aim();
let last = performance.now();
renderer && renderer.setAnimationLoop(now => {
  const dt = Math.min(now - last, 60); last = now; const t = now / 1000;
  if (!$('#hud').hidden && playing) { // guided journey timing
    stageTime += dt; bar.style.width = ((idx + stageTime / STAGE_MS) / S.length * 100) + '%';
    if (stageTime > STAGE_MS) idx < S.length - 1 ? go(idx + 1) : finish();
  } else if (!playing) bar.style.width = overview ? '100%' : (idx / S.length * 100) + '%';
  camera.position.lerp(camTo, 1 - Math.pow(.001, dt / 1000));
  look.lerp(lookTo, 1 - Math.pow(.001, dt / 1000)); camera.lookAt(look);
  anims.forEach(a => a(t));
  renderer.render(scene, camera);
});
if (!hasGL) { $('#intro h1').after(Object.assign(document.createElement('p'), {textContent: '3D is unavailable in this browser, so the explanation runs in 2D mode.'})); }
render();
// 2D fallback: still drive the guided journey without WebGL
if (!hasGL) setInterval(() => { if (playing) { stageTime += 200; bar.style.width = ((idx + stageTime / STAGE_MS) / S.length * 100) + '%'; if (stageTime > STAGE_MS) idx < S.length - 1 ? go(idx + 1) : finish(); } }, 200);

/* ---------- Upgrade: Simple/Technical toggle, user-system-result, fullscreen, click-to-explore ---------- */
const U = ['Picks a medical PDF and drags it into the upload area.','Waits while the report is processed.','Nothing: it happens automatically.','Nothing: it happens automatically.','Nothing: the data is stored for later.','Types: "What is my current HbA1c level?"','Waits a moment for the search.','Waits for the answer.','Reads the answer and checks the source page.','Asks something the report does not contain.'];
let mode = 'simple';
render = function () {
  const s = S[idx];
  panel.innerHTML = overview ? `<h3>The complete journey</h3><p>Ten stages from upload to cited answer or safe abstention. Pick a number below, or click any glowing stage in 3D.</p>` :
   `<span class="tag">Stage ${idx + 1} of 10</span><h3>${s.t}</h3>
    <h5>${mode === 'simple' ? 'In plain words' : 'Technical explanation'}</h5><p>${mode === 'simple' ? s.simple : s.tech}</p>
    <h5>What the user does</h5><p>${U[idx]}</p><h5>What the system does</h5><p>${s.tech}</p><h5>Result produced</h5><p>${s.out}</p>
    <h5>Technology</h5><div class="chips">${s.stack.map(x => `<span>${x}</span>`).join('')}</div>${s.extra || ''}
    <div class="io"><span>IN: ${s.inp}</span>→<span>OUT: ${s.out}</span></div><p class="small" style="margin-top:10px;color:#9db0d0">${s.flow}</p>`;
  panel.scrollTop = 0; $$('button', dots).forEach((b, i) => b.classList.toggle('on', !overview && i === idx));
};
$('#mode').onclick = e => { mode = mode === 'simple' ? 'tech' : 'simple'; e.target.textContent = mode === 'simple' ? 'Mode: Simple' : 'Mode: Technical'; render(); };
$('#fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
if (hasGL) { // free exploration: click a stage in the 3D scene to jump to it
  const ray = new THREE.Raycaster(), mp = new THREE.Vector2();
  $('#gl').addEventListener('click', e => {
    mp.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mp, camera);
    const hit = ray.intersectObjects(scene.children, true)[0]; let o = hit && hit.object;
    while (o && o.userData.stage === undefined) o = o.parent; if (o) { playing && pause(); go(o.userData.stage); }
  });
}
render(); $('#load').remove();
