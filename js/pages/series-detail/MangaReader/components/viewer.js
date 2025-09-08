// --- File: js/pages/series-detail/MangaReader/components/viewer.js ---

import { qs } from "../../../../utils/domUtils.js";
import { state, dom, domImages } from "../state.js";
import { changeSpread } from "../navigation.js";

/**
 * Initialise le composant de la visionneuse d'images.
 */
export function init() {
  console.log("[ViewerComponent] Initialisation.");
  if (dom.viewerContainer) {
    dom.viewerContainer.addEventListener("click", handleViewerClick);
  }
}

// - Debut modification (Fonction entièrement réécrite)
/**
 * Gère le rendu des images dans la visionneuse en fonction de l'état actuel.
 * Affiche des placeholders pour les images non encore chargées.
 */
export function render() {
  console.log(
    "[ViewerComponent] Rendu des images pour la planche :",
    state.currentSpreadIndex
  );

  const viewer = document.createElement("div");
  const {
    mode,
    fit,
    direction,
    stretch,
    limitWidth,
    customMaxWidth,
    limitHeight,
    customMaxHeight,
  } = state.settings;

  viewer.className = `reader-viewer ${mode}-mode fit-${fit} ${direction}-mode`;
  if (stretch) viewer.classList.add("stretch");

  let imagesToRenderIndices = [];
  if (mode === "webtoon") {
    // En webtoon, on affiche toutes les images (ou leurs placeholders)
    imagesToRenderIndices = domImages.map((_, index) => index);
  } else {
    imagesToRenderIndices = state.spreads[state.currentSpreadIndex] || [];
  }

  const isSingleImageSpread = imagesToRenderIndices.length === 1;
  let isLandscape = false;
  if (isSingleImageSpread) {
    const imgElement = domImages[imagesToRenderIndices[0]];
    if (imgElement && imgElement.naturalWidth > 0) {
      isLandscape = imgElement.naturalWidth > imgElement.naturalHeight;
    }
    if (imagesToRenderIndices[0] === domImages.length - 1) {
      viewer.classList.add("last-page");
    }
  }

  if (mode === "double" && isSingleImageSpread && isLandscape) {
    viewer.classList.add("single-landscape-spread");
  }

  if (fit === "custom") {
    viewer.style.maxWidth = limitWidth ? `${customMaxWidth}px` : "none";
  } else {
    viewer.style.maxWidth = "";
  }

  imagesToRenderIndices.forEach((pageIndex) => {
    const img = domImages[pageIndex];

    // Si l'image n'est pas encore chargée (pas de .src), on crée un placeholder.
    if (!img.src) {
      const placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
      placeholder.style.aspectRatio = "2 / 3"; // Ratio standard manga
      placeholder.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
      viewer.appendChild(placeholder);
    } else {
      const imgClone = img.cloneNode(true);
      if (fit === "custom") {
        imgClone.style.maxHeight = limitHeight
          ? `${customMaxHeight}px`
          : "none";
      }
      if (mode === "double" && imagesToRenderIndices.length === 1) {
        const isImgLandscape = imgClone.naturalWidth > imgClone.naturalHeight;
        if (!isImgLandscape) {
          imgClone.classList.add("single-page-spread");
        }
      }
      viewer.appendChild(imgClone);
    }
  });

  dom.viewerContainer.innerHTML = "";
  dom.viewerContainer.appendChild(viewer);
}
// - Fin modification

/**
 * Gère les clics sur la visionneuse pour la navigation.
 * @param {MouseEvent} e
 */
function handleViewerClick(e) {
  if (state.settings.mode === "webtoon") return;
  const rect = dom.viewerContainer.getBoundingClientRect();
  const zone = (e.clientX - rect.left) / rect.width;
  const direction = state.settings.direction;
  if (zone < 0.45) {
    changeSpread(direction === "ltr" ? -1 : 1);
  } else if (zone > 0.55) {
    changeSpread(direction === "ltr" ? 1 : -1);
  }
}
