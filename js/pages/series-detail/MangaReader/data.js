// --- File: js/pages/series-detail/MangaReader/data.js ---

import { qs } from "../../../utils/domUtils.js";
import { loadGlobalConfig } from "../../../utils/fetchUtils.js";
import { state, domImages, setDomImages } from "./state.js";
import { goToSpread } from "./navigation.js";
import { render as renderViewer } from "./components/viewer.js";

/**
 * Calcule la disposition des planches (spreads).
 * Peut fonctionner de manière "optimiste" (sans dimensions d'images) ou "définitive".
 * @param {boolean} useImageDimensions - Si true, utilise les dimensions réelles des images chargées pour détecter les pages paysages.
 */
export function calculateSpreads(useImageDimensions = false) {
  state.spreads = [];
  state.pageToSpreadMap = [];

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
    // Gère la première page seule si l'option de décalage est active
    if (state.settings.doublePageOffset && images.length > 0) {
      state.spreads.push([0]);
      state.pageToSpreadMap[0] = 0;
      i = 1;
    }
    while (i < images.length) {
      const currentImage = images[i];
      // On vérifie si l'image est paysage SEULEMENT si demandé ET si l'image est chargée
      const isLandscape =
        useImageDimensions &&
        currentImage &&
        currentImage.naturalWidth > 0 &&
        currentImage.naturalWidth > currentImage.naturalHeight;

      if (isLandscape) {
        state.spreads.push([i]);
        state.pageToSpreadMap[i] = state.spreads.length - 1;
        i++;
      } else {
        const nextImage = images[i + 1];
        // On vérifie si l'image suivante n'est pas non plus un paysage
        const isNextImageLandscape =
          useImageDimensions &&
          nextImage &&
          nextImage.naturalWidth > 0 &&
          nextImage.naturalWidth > nextImage.naturalHeight;

        if (nextImage && !isNextImageLandscape) {
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

// - Debut modification
/**
 * Gère le chargement en arrière-plan et priorisé du reste des images.
 * @param {number} startIndex - L'index de la page à partir de laquelle commencer le chargement.
 */
function startProgressiveLoading(startIndex) {
  const pagesToLoad = [];
  const totalPages = state.pages.length;

  // Créer une file de priorité : [10, 9, 11, 8, 12, ...]
  for (let i = 0; i < totalPages; i++) {
    if (i === 0) {
      pagesToLoad.push(startIndex);
    } else {
      const prevIndex = startIndex - i;
      const nextIndex = startIndex + i;
      if (prevIndex >= 0) pagesToLoad.push(prevIndex);
      if (nextIndex < totalPages) pagesToLoad.push(nextIndex);
    }
  }

  // Filtrer les doublons
  const uniquePagesToLoad = [...new Set(pagesToLoad)];

  let currentLoadIndex = 0;

  function loadNext() {
    if (currentLoadIndex >= uniquePagesToLoad.length) return; // Terminé

    const pageIndex = uniquePagesToLoad[currentLoadIndex];
    const img = domImages[pageIndex];

    // Si l'image n'a pas encore de source, on la charge
    if (img && !img.src) {
      // AJOUT : Logique de remplacement du placeholder
      img.onload = () => {
        // Uniquement en mode webtoon, on cherche et remplace le placeholder
        if (state.settings.mode === "webtoon") {
          const placeholder = qs(
            `.image-placeholder[data-page-index="${pageIndex}"]`
          );
          if (placeholder) {
            // On clone l'image chargée pour l'insérer dans le DOM
            const imgClone = img.cloneNode(true);
            placeholder.replaceWith(imgClone);
          }
        }
      };

      img.src = state.pages[pageIndex];
    }

    currentLoadIndex++;
    // On charge la suivante au prochain moment d'inactivité du navigateur
    setTimeout(loadNext, 50);
  }

  // Démarrer le processus
  loadNext();
}
// - Fin modification

/**
 * Récupère la liste des pages et gère le chargement progressif.
 */
export async function fetchAndLoadPages(initialPageNumber = 1) {
  const loadingMsgContainer = qs("#manga-reader-root .reader-viewer-container");
  if (loadingMsgContainer) {
    loadingMsgContainer.innerHTML = `<p id="reader-loading-msg">Chargement des informations du chapitre...</p>`;
  }
  const loadingMsgElement = qs("#reader-loading-msg");

  try {
    if (state.currentChapter.licencied === true) {
      const message = `Ce chapitre est désormais disponible dans l'édition officielle. Soutenez l'auteur en l'achetant !`;
      if (loadingMsgContainer) {
        loadingMsgContainer.innerHTML = `<p class="licensed-notice">${message}</p>`;
      }
      return;
    }

    // 1. Récupérer la liste des URLs des pages
    const CONFIG = await loadGlobalConfig();
    const chapterId = state.currentChapter.source.id;
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

    // 2. Créer les objets Image en mémoire, mais SANS les charger
    const newDomImages = state.pages.map((src) => {
      const img = new Image();
      img.draggable = false;
      return img;
    });
    setDomImages(newDomImages);

    if (newDomImages.length === 0) {
      throw new Error("Ce chapitre ne contient aucune page.");
    }

    // 3. Calculer un agencement "optimiste" (toutes pages en portrait)
    // Cela nous donne immédiatement le nombre total de planches et la structure de base.
    calculateSpreads(false);

    // 4. Identifier la page/planche cible et les images à charger en priorité
    let targetPageIndex = 0;
    if (initialPageNumber === "last") {
      targetPageIndex = state.pages.length - 1;
    } else if (typeof initialPageNumber === "number" && initialPageNumber > 0) {
      targetPageIndex = Math.min(initialPageNumber - 1, state.pages.length - 1);
    }

    const targetSpreadIndex = state.pageToSpreadMap[targetPageIndex];
    const initialSpreadIndices = state.spreads[targetSpreadIndex] || [
      targetPageIndex,
    ];

    if (loadingMsgElement) {
      loadingMsgElement.textContent = `Chargement de la page ${
        targetPageIndex + 1
      } / ${state.pages.length}...`;
    }

    // 5. Charger uniquement les images de la planche initiale
    const initialLoadPromises = initialSpreadIndices.map((index) => {
      return new Promise((resolve, reject) => {
        const img = domImages[index];
        if (!img)
          return reject(new Error(`Image à l'index ${index} non trouvée.`));
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(
            new Error(
              `Erreur de chargement pour l'image: ${state.pages[index]}`
            )
          );
        img.src = state.pages[index];
      });
    });

    await Promise.all(initialLoadPromises);

    // 6. Maintenant que les images initiales sont chargées, on peut recalculer
    // l'agencement de manière "définitive" en tenant compte des pages paysages.
    calculateSpreads(true);

    // 7. On retrouve le bon index de planche après le recalcul final.
    const finalSpreadIndex = state.pageToSpreadMap[targetPageIndex];
    state.currentSpreadIndex = finalSpreadIndex;

    // 8. On affiche la première planche et on démarre le chargement du reste.
    goToSpread(finalSpreadIndex, true); // `true` pour un positionnement initial sans animation
    startProgressiveLoading(targetPageIndex);
  } catch (error) {
    throw error; // Propage l'erreur pour qu'elle soit attrapée par reader.js
  }
}
