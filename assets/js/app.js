// assets/js/app.js
import { ExpressionCounters } from "./counters.js";
import {
  drawLandmarks,
  updateStateBadges,
  loadProgrammerBox,
  loadThresholds
} from "./ui.js";

/* ===========================
   MockAPI (POST en tiempo real)
   =========================== */
const MOCKAPI_RESOURCE_URL = "https://68b89981b71540504328aaf0.mockapi.io/api/v1/gestos";

// Encolar envíos para no saturar
let _sendQueue = [];
let _sending = false;

// Throttle mínimo entre envíos (ms)
const MIN_POST_INTERVAL = 800;
let _lastPostAt = 0;

async function postToMockAPI(payload) {
  if (!MOCKAPI_RESOURCE_URL) return;
  const now = Date.now();
  const elapsed = now - _lastPostAt;

  _sendQueue.push(payload);
  if (_sending || elapsed < MIN_POST_INTERVAL) {
    return; // se enviará en el siguiente ciclo
  }

  _sending = true;
  try {
    while (_sendQueue.length) {
      const data = _sendQueue.shift();
      const res = await fetch(MOCKAPI_RESOURCE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        console.warn("[MockAPI] POST no OK", res.status);
      }
      _lastPostAt = Date.now();
      // Respeta el throttle entre posts en ráfaga
      await new Promise(r => setTimeout(r, MIN_POST_INTERVAL));
    }
  } catch (err) {
    console.error("[MockAPI] Error POST:", err);
  } finally {
    _sending = false;
  }
}

/* ===========================
   Elementos base y estados
   =========================== */
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

// Botones UI
const btnStart = document.getElementById("btnStart");
const btnStop  = document.getElementById("btnStop");
const btnReset = document.getElementById("btnReset");

let camera = null;
let camActive = false;

// Indicador de estado de cámara (badge en UI)
const camStatusEl = document.getElementById("camStatus");
function setCamStatus(isOn){
  if (!camStatusEl) return;
  camStatusEl.classList.remove("status-on","status-off");
  if(isOn){
    camStatusEl.classList.add("status-on");
    camStatusEl.innerHTML = `<i class="bi bi-webcam"></i> Cámara encendida`;
  } else {
    camStatusEl.classList.add("status-off");
    camStatusEl.innerHTML = `<i class="bi bi-webcam-off"></i> Cámara apagada`;
  }
}

// MediaPipe
let faceMesh = null;
let latestLandmarks = null;

// Contadores de eventos
let counters = null;

/* ===========================
   Utilidades UI
   =========================== */
function fitCanvas() {
  const rect = video.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
}

function animateCounter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("animate__animated", "animate__pulse");
  setTimeout(() => el.classList.remove("animate__animated", "animate__pulse"), 400);
}

/* ===========================
   FaceMesh
   =========================== */
function initFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults((res) => {
    if (res.multiFaceLandmarks && res.multiFaceLandmarks.length > 0) {
      latestLandmarks = res.multiFaceLandmarks[0];
    } else {
      latestLandmarks = null;
    }
  });
}

/* ===========================
   Cámara
   =========================== */
async function startCamera() {
  if (camActive) return;

  const constraints = { video: { facingMode: "user" } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  await video.play();

  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  camera = new Camera(video, {
    onFrame: async () => { await faceMesh.send({ image: video }); },
    width: 640,
    height: 480,
  });
  camera.start();
  camActive = true;
  setCamStatus(true);
}

function stopCamera() {
  if (!camActive) return;

  if (camera && camera.stop) camera.stop();

  const stream = video.srcObject;
  if (stream) {
    for (const tr of stream.getTracks()) tr.stop();
  }
  video.srcObject = null;

  camActive = false;
  setCamStatus(false);
  console.log("[cam] Cámara detenida.");
}

/* ===========================
   Render loop
   =========================== */
function renderLoop() {
  if (!camActive) return;

  // Dibuja frame actual
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.drawImage(video, 0, 0, overlay.width, overlay.height);

  if (latestLandmarks && counters) {
    // Actualiza contadores y métricas
    const metrics = counters.update(latestLandmarks);

    // Landmarks y estados
    drawLandmarks(ctx, latestLandmarks, overlay.width, overlay.height);
    updateStateBadges({
      eyeIsClosed: counters.eyeIsClosed,
      mouthIsOpen: counters.mouthIsOpen,
      browIsRaised: counters.browIsRaised
    });

    // UI contadores
    const blinkEl = document.getElementById("blinkCount");
    const browEl  = document.getElementById("browCount");
    const mouthEl = document.getElementById("mouthCount");
    if (blinkEl) blinkEl.textContent = counters.blinks;
    if (browEl)  browEl.textContent  = counters.browRaises;
    if (mouthEl) mouthEl.textContent = counters.mouthOpens;

    // ---- Enviar a MockAPI al cambiar los contadores ----
    if (!renderLoop._lastSent) {
      renderLoop._lastSent = { blinks: 0, browRaises: 0, mouthOpens: 0 };
    }
    const last = renderLoop._lastSent;
    const cur  = {
      blinks: counters.blinks,
      browRaises: counters.browRaises,
      mouthOpens: counters.mouthOpens,
    };

    if (cur.blinks !== last.blinks || cur.browRaises !== last.browRaises || cur.mouthOpens !== last.mouthOpens) {
      renderLoop._lastSent = { ...cur };
      const payload = {
        Parpadeo: cur.blinks,
        Cejas: cur.browRaises,
        Boca: cur.mouthOpens,
        Fecha_Hora: new Date().toISOString(),
      };
      postToMockAPI(payload);
    }

    // // DEBUG HUD opcional:
    // ctx.fillStyle = "rgba(0,0,0,0.6)";
    // ctx.fillRect(10, 10, 220, 80);
    // ctx.fillStyle = "#00FF7F";
    // ctx.font = "12px monospace";
    // ctx.fillText(`EAR:  ${metrics.ear.toFixed(3)}`, 20, 30);
    // ctx.fillText(`MAR:  ${metrics.mar.toFixed(3)}`, 20, 45);
    // ctx.fillText(`BROW: ${metrics.brow.toFixed(3)}`, 20, 60);
  }

  requestAnimationFrame(renderLoop);
}

/* ===========================
   Main
   =========================== */
async function main() {
  setCamStatus(false);

  // Cargar datos de programador
  loadProgrammerBox();

  // Cargar umbrales base (para ExpressionCounters)
  const th = await loadThresholds();
  counters = new ExpressionCounters(th);

  // Inicializar FaceMesh
  initFaceMesh();

  // Eventos
  btnStart?.addEventListener("click", async () => {
    try {
      await startCamera();
      renderLoop();
    } catch (e) {
      console.error("[cam] Error al iniciar la cámara:", e);
      alert("No se pudo acceder a la cámara. Revisa permisos, HTTPS o usa localhost.");
    }
  });

  btnStop?.addEventListener("click", () => {
    stopCamera();
  });

  btnReset?.addEventListener("click", () => {
    if (!counters) return;
    counters.blinks = counters.browRaises = counters.mouthOpens = 0;

    const blinkEl = document.getElementById("blinkCount");
    const browEl  = document.getElementById("browCount");
    const mouthEl = document.getElementById("mouthCount");
    if (blinkEl) blinkEl.textContent = "0";
    if (browEl)  browEl.textContent  = "0";
    if (mouthEl) mouthEl.textContent = "0";

    animateCounter("blinkCount");
    animateCounter("browCount");
    animateCounter("mouthCount");

    // Registrar el reset en MockAPI (opcional)
    postToMockAPI({
      Parpadeo: 0,
      Cejas: 0,
      Boca: 0,
      Fecha_Hora: new Date().toISOString(),
    });
  });

  // Aviso HTTPS
  const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) {
    console.warn("[ctx] La cámara requiere HTTPS o http://localhost.");
  }
}

document.addEventListener("DOMContentLoaded", main);
