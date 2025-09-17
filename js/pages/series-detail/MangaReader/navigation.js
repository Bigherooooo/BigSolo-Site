// --- File: js/pages/series-detail/MangaReader/navigation.js ---

import { qs, slugify } from "../../../utils/domUtils.js";
import { state, dom, domImages } from "./state.js";
import { render as renderViewer } from "./components/viewer.js";
// On importe calculateSpreads pour pouvoir recalculer la mise en page
import { calculateSpreads } from "./data.js";
import { render as renderProgressBar } from "./components/progressBar.js";

let urlUpdateTimeout = null;

export function getInitialPageNumberFromUrl() {
  if (window.location.hash === "#last") return "last";
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  if (pathSegments.length === 3) {
    const pageNumber = parseInt(pathSegments[2], 10);
    if (!isNaN(pageNumber) && pageNumber > 0) return pageNumber;
  }
  return 1;
}

export function updateUrlForCurrentPage() {
  clearTimeout(urlUpdateTimeout);
  urlUpdateTimeout = setTimeout(() => {
    const seriesSlug = slugify(state.seriesData.title);
    const chapterNumber = state.currentChapter.number;
    const currentSpread = state.spreads[state.currentSpreadIndex];
    if (!currentSpread || currentSpread.length === 0) return;

    const firstPageIndexInSpread = currentSpread[0];
    const pageNumberForUrl = firstPageIndexInSpread + 1;
    const newPath = `/${seriesSlug}/${chapterNumber}/${pageNumberForUrl}`;

    if (window.location.pathname !== newPath) {
      history.replaceState({ page: pageNumberForUrl }, "", newPath);
    }
  }, 150);
}

// - Debut modification (Fonction entièrement réécrite)
export function goToSpread(spreadIndex, isInitializing = false) {
  // 1. Déterminer la planche cible et la page de référence (notre "ancre")
  const targetSpreadIndex = Math.max(
    0,
    Math.min(spreadIndex, state.spreads.length - 1)
  );
  const targetSpreadIndices = state.spreads[targetSpreadIndex] || [];
  if (targetSpreadIndices.length === 0) return;
  const anchorPageIndex = targetSpreadIndices[0];

  // 2. Charger les images de la planche cible si elles ne le sont pas déjà
  const imagesToLoadPromises = [];
  targetSpreadIndices.forEach((pageIndex) => {
    const img = domImages[pageIndex];
    if (img && !img.complete && !img.src) {
      imagesToLoadPromises.push(
        new Promise((resolve) => {
          img.onload = img.onerror = () => resolve();
          img.src = state.pages[pageIndex];
        })
      );
    }
  });

  const onImagesReady = () => {
    // 3. (CORRECTION) Une fois les images chargées, recalculer la structure si on est en mode double
    if (state.settings.mode === "double") {
      calculateSpreads(true);
    }

    // 4. Retrouver le bon index de planche après le recalcul potentiel
    const finalSpreadIndex = state.pageToSpreadMap[anchorPageIndex];
    state.currentSpreadIndex = finalSpreadIndex;

    // 5. (CORRECTION CLÉ) On appelle TOUJOURS renderViewer() pour s'assurer que le DOM est à jour
    // C'est cette étape qui manquait pour le mode webtoon au chargement initial.
    renderViewer();

    // 6. Procéder au positionnement (scroll)
    if (state.settings.mode === "webtoon") {
      const pageIndex = state.spreads[finalSpreadIndex]?.[0];
      if (pageIndex !== undefined) {
        // Le viewer a été rendu, l'image existe maintenant dans le DOM
        const imageInDom = qs(`.reader-viewer img:nth-child(${pageIndex + 1})`);
        if (imageInDom) {
          const behavior = isInitializing ? "auto" : "smooth";

          // Au premier chargement sur mobile, on calcule manuellement la position
          // pour prendre en compte la hauteur des barres de navigation.
          if (isInitializing && window.innerWidth <= 768) {
            const imageTopOffset =
              imageInDom.getBoundingClientRect().top + window.scrollY;
            const barsHeight =
              (document.getElementById("main-header")?.offsetHeight || 0) +
              (dom.mobileControls?.offsetHeight || 0);
            window.scrollTo({
              top: imageTopOffset - barsHeight,
              behavior: "auto",
            });
          } else {
            imageInDom.scrollIntoView({ behavior, block: "start" });
          }
        }
      }
    } else {
      // Pour les modes paginés, on s'assure d'être en haut du conteneur
      if (!isInitializing) {
        dom.viewerContainer.scrollTop = 0;
      }
    }

    // 7. Mettre à jour l'interface utilisateur et l'URL
    updateUIOnPageChange();
    updateUrlForCurrentPage();
  };

  if (imagesToLoadPromises.length > 0) {
    if (state.settings.mode !== "webtoon") {
      dom.viewerContainer.innerHTML = `<p class="image-placeholder" style="aspect-ratio: 4/3; width: 80%;"><i class="fas fa-spinner fa-spin"></i></p>`;
    }
    Promise.all(imagesToLoadPromises).then(onImagesReady);
  } else {
    onImagesReady();
  }
}
// - Fin modification

export function changeSpread(delta) {
  const isLastSpread = state.currentSpreadIndex >= state.spreads.length - 1;
  if (delta > 0 && isLastSpread) {
    navigateToChapter(1);
  } else if (delta < 0 && state.currentSpreadIndex === 0) {
    navigateToChapter(-1, true);
  } else {
    // On passe l'index de la planche suivante/précédente à goToSpread
    goToSpread(state.currentSpreadIndex + delta);
  }
}

export function navigateToChapter(delta, goToLastPage = false) {
  const currentChapterIndex = state.allChapterKeys.indexOf(
    state.currentChapter.number
  );
  const nextChapterIndex = currentChapterIndex + delta;
  if (nextChapterIndex >= 0 && nextChapterIndex < state.allChapterKeys.length) {
    const nextChapterKey = state.allChapterKeys[nextChapterIndex];
    let url = `/${slugify(state.seriesData.title)}/${nextChapterKey}`;
    if (goToLastPage) url += "#last";
    window.location.href = url;
  } else {
    const message =
      delta > 0
        ? "Vous êtes au dernier chapitre disponible."
        : "Ceci est le premier chapitre.";
    console.log(message);
  }
}

export function updateUIOnPageChange() {
  renderProgressBar();
  const currentSpread = state.spreads[state.currentSpreadIndex] || [];
  const firstPage = currentSpread.length > 0 ? currentSpread[0] + 1 : 0;
  const pageCounterText = `Page ${firstPage} / ${state.pages.length}`;
  const webtoonBubbleText = `${firstPage}/${state.pages.length}`;

  if (dom.pageCounter) {
    dom.pageCounter.textContent = pageCounterText;
  }

  if (dom.webtoonPageBubble) {
    dom.webtoonPageBubble.textContent = webtoonBubbleText;
  }

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const commentsSection = qs("#comments-mobile-section");
    const interactionsSection = qs("#interactions-share");
    if (commentsSection && interactionsSection) {
      const isPagedMode =
        state.settings.mode === "single" || state.settings.mode === "double";

      if (isPagedMode) {
        const shouldBeVisible =
          state.currentSpreadIndex >= state.spreads.length - 2;
        commentsSection.classList.toggle("is-visible", shouldBeVisible);
        interactionsSection.classList.toggle("is-visible", shouldBeVisible);
        console.log(
          `[UI Update] Paged mode. Spread ${state.currentSpreadIndex + 1}/${
            state.spreads.length
          }. Footer sections visible: ${shouldBeVisible}`
        );
      }
    }
  }
}
