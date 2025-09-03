/* ui.js
   Funciones de UI: pintar overlay, actualizar contadores/estados,
   panel de umbrales en vivo y carga de datos vía fetch.
*/

// Dibuja puntos clave simples en el canvas
function drawLandmarks(ctx, landmarks, w, h) {
  if (!landmarks) return;
  ctx.save();
  ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
  for (let i = 0; i < landmarks.length; i += 8) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Actualiza badges de estado
function updateStateBadges({ eyeIsClosed, mouthIsOpen, browIsRaised }) {
  const eyeEl = document.getElementById("eyeState");
  const browEl = document.getElementById("browState");
  const mouthEl = document.getElementById("mouthState");

  if (eyeEl)  eyeEl.textContent  = `Ojos: ${eyeIsClosed ? "cerrados" : "abiertos"}`;
  if (browEl) browEl.textContent = `Cejas: ${browIsRaised ? "arriba" : "neutras"}`;
  if (mouthEl)mouthEl.textContent= `Boca: ${mouthIsOpen ? "abierta" : "cerrada"}`;
}

// Carga datos del programador y los presenta en tarjeta con iniciales
async function loadProgrammerBox() {
  const box = document.getElementById("programmerBox");
  if (!box) return;
  try {
    const res = await fetch("assets/data/programmer.json", { cache: "no-store" });
    const data = await res.json();

    const initials = (data.name || "Usuario")
      .split(/\s+/)
      .map(s => s[0]?.toUpperCase() || "")
      .slice(0, 2)
      .join("");

    box.innerHTML = `
      <div class="dev-card">
        <div class="dev-head">
          <div class="dev-avatar">${initials}</div>
          <div>
            <h6 class="dev-name">${data.name || "—"}</h6>
            <p class="dev-meta">${data.email ? `<a href="mailto:${data.email}">${data.email}</a>` : "—"}</p>
          </div>
        </div>
        <p class="mb-2">${data.about || ""}</p>
        <div class="dev-actions">
          ${data.email ? `<a class="btn btn-sm btn-outline-light" href="mailto:${data.email}"><i class="bi bi-envelope"></i> Contactar</a>` : ""}
          <a class="btn btn-sm btn-outline-light" href="#" onclick="window.scrollTo({top:0, behavior:'smooth'})"><i class="bi bi-rocket"></i> Ir al panel</a>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("[programmerBox] Error:", err);
    box.textContent = "No se pudo cargar la información del programador.";
  }
}

// ------ Umbrales (si aún usas thresholds.json/localStorage para contadores) ------
async function loadThresholds() {
  try {
    const res = await fetch("assets/config/thresholds.json", { cache: "no-store" });
    const base = await res.json();
    // Si guardaste overrides en localStorage, cárgalos aquí (opcional)
    const saved = localStorage.getItem("thresholds_v1");
    if (saved) {
      const over = JSON.parse(saved);
      return { ...base, ...over };
    }
    return base;
  } catch (e) {
    console.warn("[thresholds] usando defaults por error de carga:", e);
    return {
      EAR: { close_threshold: 0.20, open_threshold: 0.25, min_frames: 2 },
      MAR: { open_threshold: 0.60, close_threshold: 0.50, min_frames: 2 },
      BROW: { raise_threshold_pct: 0.08, relax_threshold_pct: 0.04, min_frames: 2 }
    };
  }
}

// Exports
export {
  drawLandmarks,
  updateStateBadges,
  loadProgrammerBox,
  loadThresholds
};
