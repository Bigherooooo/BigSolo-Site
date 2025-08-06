// js/pages/series-detail/MangaReader/data.js
import { qs } from "../../../utils/domUtils.js";
import { loadGlobalConfig } from "../../../utils/fetchUtils.js";
// CORRECTION : On importe bien 'domImages' en tant que variable séparée
import { state, domImages, setDomImages } from "./state.js";
import { render, handleError } from "./ui.js";
import { goToSpread } from "./navigation.js";

/**
 * Calcule la disposition des planches (spreads) en fonction du mode de lecture.
 * Cette fonction ne doit être appelée qu'une fois les dimensions des images connues.
 */
export function calculateSpreads() {
  state.spreads = [];
  state.pageToSpreadMap = [];

  // CORRECTION : On utilise directement la variable 'domImages' importée
  const images = domImages;

  if (state.settings.mode === "webtoon" || state.settings.mode === "single") {
    state.pages.forEach((_, index) => {
      state.spreads.push([index]);
      state.pageToSpreadMap[index] = index;
    });
    return;
  }

  if (state.settings.mode === "double") {
    let i = 0;
    if (state.settings.doublePageOffset && images[0]) {
      state.spreads.push([0]);
      state.pageToSpreadMap[0] = 0;
      i = 1;
    }
    while (i < images.length) {
      const currentImage = images[i];
      const isLandscape =
        currentImage.naturalWidth > 0 &&
        currentImage.naturalWidth > currentImage.naturalHeight;

      if (isLandscape) {
        state.spreads.push([i]);
        state.pageToSpreadMap[i] = state.spreads.length - 1;
        i++;
      } else {
        const nextImage = images[i + 1];
        if (
          nextImage &&
          nextImage.naturalWidth > 0 &&
          nextImage.naturalWidth <= nextImage.naturalHeight
        ) {
          state.spreads.push([i, i + 1]);
          state.pageToSpreadMap[i] = state.pageToSpreadMap[i + 1] =
            state.spreads.length - 1;
          i += 2;
        } else {
          state.spreads.push([i]);
          state.pageToSpreadMap[i] = state.spreads.length - 1;
          i++;
        }
      }
    }
  }
}

/**
 * Récupère la liste des pages du chapitre, attend leur chargement complet,
 * puis initialise l'affichage du lecteur.
 */
export async function fetchAndLoadPages(initialPageNumber = 1) {
  const loadingMsgContainer = qs("#manga-reader-root .reader-viewer");
  if (loadingMsgContainer) {
    loadingMsgContainer.innerHTML = `<p id="reader-loading-msg">Chargement des informations...</p>`;
  }
  const loadingMsgElement = qs("#reader-loading-msg");

  try {
    const CONFIG = await loadGlobalConfig();
    const chapterId = state.currentChapter.groups.Big_herooooo.split("/").pop();
    const apiUrl = `${CONFIG.URL_API_IMGCHEST}?id=${chapterId}`;
    const pagesData = await fetch(apiUrl).then((res) => res.json());

    if (
      pagesData.error ||
      !Array.isArray(pagesData) ||
      pagesData.length === 0
    ) {
      throw new Error(pagesData.error || "Aucune page retournée par l'API.");
    }
    state.pages = pagesData.map((p) => p.link);

    const newDomImages = state.pages.map((src) => {
      const img = new Image();
      img.draggable = false;
      return img;
    });
    setDomImages(newDomImages);

    if (newDomImages.length === 0) {
      handleError("Ce chapitre ne contient aucune page.");
      return;
    }

    let loadedCount = 0;
    if (loadingMsgElement)
      loadingMsgElement.textContent = `Chargement des pages... (0 / ${newDomImages.length})`;

    const onAllImagesProcessed = () => {
      loadingMsgElement?.remove();

      calculateSpreads();

      let finalInitialIndex = 0;
      if (initialPageNumber === "last") {
        finalInitialIndex = state.spreads.length - 1;
      } else if (
        typeof initialPageNumber === "number" &&
        initialPageNumber > 0
      ) {
        const pageIndex = initialPageNumber - 1;
        const targetSpreadIndex = state.pageToSpreadMap[pageIndex];
        if (targetSpreadIndex !== undefined)
          finalInitialIndex = targetSpreadIndex;
      }

      state.currentSpreadIndex = finalInitialIndex;
      goToSpread(state.currentSpreadIndex, true);
    };

    newDomImages.forEach((img, index) => {
      const handleLoadOrError = () => {
        loadedCount++;
        if (loadingMsgElement)
          loadingMsgElement.textContent = `Chargement des pages... (${loadedCount} / ${newDomImages.length})`;
        if (loadedCount === newDomImages.length) {
          onAllImagesProcessed();
        }
      };

      img.onload = handleLoadOrError;
      img.onerror = () => {
        console.error(
          `Erreur de chargement pour l'image: ${state.pages[index]}`
        );
        img.alt = "Erreur de chargement";
        handleLoadOrError();
      };

      img.src = state.pages[index];
    });
  } catch (error) {
    handleError(`Erreur lors du chargement du chapitre : ${error.message}`);
  }
}
