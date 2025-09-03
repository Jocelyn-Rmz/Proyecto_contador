// assets/js/app.js
import { ExpressionCounters } from "./counters.js";
import {
  drawLandmarks,
  updateStateBadges,
  loadProgrammerBox,
  loadThresholds
} from "./ui.js";

// Elementos base
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");

// Botones UI
const btnStart = document.getElementById("btnStart");
const btnStop  = document.getElementById("btnStop");
const btnReset = document.getElementById("btnReset");

// Estados y helpers
let camera = null;
let camActive = false;

// Indicador de estado de cámara
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

// MediaPipe FaceMesh
let faceMesh = null;
let latestLandmarks = null;

// Contadores
let counters = null;

// Ajusta tamaño del canvas al del video
function fitCanvas() {
  const rect = video.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
}

// Animación de números
function animateCounter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("animate__animated", "animate__pulse");
  setTimeout(() => el.classList.remove("animate__animated", "animate__pulse"), 400);
}

// Inicializa Face Mesh
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

// Inicia cámara
async function startCamera() {
  if (camActive) return;

  const constraints = { video: { facingMode: "user" } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;

  await new Promise((resolve) => (video.onloadedmetadata = resolve));
  await video.play();

  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  // MediaPipe Camera
  const mpCamera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
    },
    width: 640,
    height: 480,
  });
  camera = mpCamera;
  camera.start();
  camActive = true;
  setCamStatus(true);
}

// Detiene cámara
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

// Bucle de renderizado
function renderLoop() {
  if (!camActive) return; // se corta si se detuvo

  // Pintar frame actual
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.drawImage(video, 0, 0, overlay.width, overlay.height);

  if (latestLandmarks && counters) {
    // Actualizar contadores y obtener métricas (EAR, MAR, BROW)
    const metrics = counters.update(latestLandmarks);

    // Dibujar landmarks (puntos) sobre el rostro
    drawLandmarks(ctx, latestLandmarks, overlay.width, overlay.height);

    // Actualizar estados (badges)
    updateStateBadges({
      eyeIsClosed: counters.eyeIsClosed,
      mouthIsOpen: counters.mouthIsOpen,
      browIsRaised: counters.browIsRaised
    });

    // Actualizar contadores con animación
    const blinkEl = document.getElementById("blinkCount");
    const browEl  = document.getElementById("browCount");
    const mouthEl = document.getElementById("mouthCount");
    if (blinkEl) blinkEl.textContent = counters.blinks;
    if (browEl)  browEl.textContent  = counters.browRaises;
    if (mouthEl) mouthEl.textContent = counters.mouthOpens;
  }

  // HUD de métricas (opcional: si lo tienes en ui.js puedes quitarlo aquí)
  // ...

  requestAnimationFrame(renderLoop);
}

// Principal
async function main() {
  setCamStatus(false);

  // Carga info programador
  loadProgrammerBox();

  // Carga umbrales (si tu ui.js los maneja internamente; aquí solo inicializamos contadores)
  const th = await loadThresholds(); // lee thresholds.json y/o localStorage
  counters = new ExpressionCounters(th);

  initFaceMesh();

  // Eventos UI
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
  });

  // Recomendación de seguridad para getUserMedia
  const isSecure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure) {
    console.warn("[ctx] La cámara requiere HTTPS o http://localhost.");
  }
}

document.addEventListener("DOMContentLoaded", main);
