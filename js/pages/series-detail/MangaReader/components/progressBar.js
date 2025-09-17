// --- File: js/pages/series-detail/MangaReader/components/progressBar.js ---

import { qs } from "../../../../utils/domUtils.js";
import { state, dom } from "../state.js";
import { goToSpread } from "../navigation.js";

/**
 * Initialise la barre de progression.
 */
export function init() {
  // Le DOM est déjà assigné dans reader.js, on attache juste l'écouteur.
  if (dom.progressBar) {
    dom.progressBar.addEventListener("click", handleProgressBarClick);
  }
}

/**
 * Gère le rendu (ou la mise à jour) de la barre de progression.
 */
export function render() {
  if (!dom.progressBar || state.spreads.length === 0) {
    if (dom.progressBar) dom.progressBar.innerHTML = "";
    return;
  }

  // Applique la classe de direction pour l'ordre des ticks
  dom.progressBar.classList.toggle(
    "rtl-mode",
    state.settings.direction === "rtl"
  );

  // Génère les "ticks" représentant chaque planche
  dom.progressBar.innerHTML = state.spreads
    .map((_, index) => {
      const isCurrent = index === state.currentSpreadIndex;
      const isRead = index < state.currentSpreadIndex;
      return `<div class="progress-tick ${isCurrent ? "current" : ""} ${isRead ? "read" : ""}" data-spread-index="${index}"></div>`;
    })
    .join("");
}

/**
 * Gère le clic sur un "tick" de la barre de progression pour naviguer.
 * @param {MouseEvent} e - L'événement de clic.
 */
function handleProgressBarClick(e) {
  const tick = e.target.closest(".progress-tick");
  if (tick && tick.dataset.spreadIndex) {
    const spreadIndex = parseInt(tick.dataset.spreadIndex, 10);
    if (!isNaN(spreadIndex)) {
      goToSpread(spreadIndex);
    }
  }
}
