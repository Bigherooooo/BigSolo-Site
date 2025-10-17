// --- File: js/pages/series-detail/MangaView.js ---

import { qs, qsa, slugify } from "../../utils/domUtils.js";
import { timeAgo, parseDateToTimestamp } from "../../utils/dateUtils.js";
import { initMainScrollObserver } from "../../components/observer.js";
import {
  queueAction,
  getLocalInteractionState,
  setLocalInteractionState,
} from "../../utils/interactions.js";
import { renderSeriesInfo } from "./shared/infoRenderer.js";
import { renderActionButtons } from "./shared/actionButtons.js";
import { initListControls } from "./shared/listControls.js";
import {
  fetchStats,
  preloadAllImgChestViewsOnce,
  updateAllVisibleChapterViews,
} from "./shared/statsManager.js";
import { initAccordion } from "./shared/accordion.js";
import { renderItemNumber } from "./shared/itemNumberRenderer.js";
import { initCoverGallery } from "./shared/coverGallery.js";
import { initDownloadManager } from "./shared/downloadManager.js";

let abortController = null; // Pour gérer l'annulation
let isDownloadMode = false;
let selectedChaptersForDownload = new Set();

let currentSeriesData = null;
let currentSeriesStats = null;
let viewContainer = null;
let resizeObserver = null; // Pour pouvoir le déconnecter plus tard

/**
 * Point d'entrée pour le rendu de la vue Manga.
 * @param {HTMLElement} mainContainer - L'élément <main> de la page.
 * @param {object} seriesData - Les données de la série.
 */
export async function render(mainContainer, seriesData) {
  console.log("[MangaView] Début du rendu.");
  currentSeriesData = seriesData;
  viewContainer = mainContainer;

  // Déconnecte l'ancien observer de redimensionnement s'il en existe un
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  // 1. Lancer le chargement des statistiques en arrière-plan
  const statsPromise = fetchStats(currentSeriesData.slug);

  // 2. Rendre les informations statiques de la série et les boutons d'action immédiatement
  renderSeriesInfo(viewContainer, currentSeriesData, {}, "manga");
  renderActionButtons(viewContainer, currentSeriesData, "manga");

  // 3. Attendre que les statistiques soient récupérées
  currentSeriesStats = await statsPromise;

  // 4. Mettre à jour l'interface avec les statistiques (notes, etc.)
  renderSeriesInfo(
    viewContainer,
    currentSeriesData,
    currentSeriesStats,
    "manga"
  );

  // 5. Initialiser tous les composants interactifs de la page
  initListControls(viewContainer, handleFilterOrSortChange);
  initAccordion({
    buttonSelector: ".series-see-more-btn",
    contentSelector: ".series-more-infos",
    context: viewContainer,
  });

  // 6. Afficher la liste des chapitres
  displayChapterList({
    sort: { type: "number", order: "desc" },
    search: "",
  });

  // 7. Initialiser le gestionnaire de téléchargement (qui gère ses propres scripts)
  initDownloadManager(viewContainer, currentSeriesData);

  // 8. Ajuster le texte pour les One-Shots si nécessaire
  if (
    seriesData.os &&
    Object.keys(seriesData.chapters).length === 1 &&
    seriesData.chapters.hasOwnProperty("0")
  ) {
    const tab = qs("[data-tab='chapters']");
    if (tab) tab.textContent = "One-shot";
  } else if (seriesData.os) {
    const tab = qs("[data-tab='chapters']");
    if (tab) tab.textContent = "One-shots";
  }

  // 9. Initialiser les fonctionnalités avancées
  setupResponsiveLayout(viewContainer);
  preloadAllImgChestViewsOnce();
  initCoverGallery(viewContainer, currentSeriesData);
}

function toggleDownloadMode() {
  isDownloadMode = !isDownloadMode;
  const container = qs(".chapters-list-container", viewContainer);
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const infoMessage = qs("#download-mode-info", viewContainer);

  // On utilise les ID pour cibler précisément les éléments
  const sortBtn = qs("#sort-chapter-btn", viewContainer);
  const searchInput = qs("#search-chapter-input", viewContainer);

  if (container) container.classList.toggle("download-mode", isDownloadMode);
  if (infoMessage)
    infoMessage.style.display = isDownloadMode ? "block" : "none";
  if (downloadBtn)
    downloadBtn.style.display = isDownloadMode ? "inline-flex" : "none";

  if (toggleBtn) {
    toggleBtn.classList.toggle("active", isDownloadMode);
    toggleBtn.title = isDownloadMode
      ? "Quitter le mode téléchargement"
      : "Activer le mode téléchargement";
  }

  if (isDownloadMode) {
    // Cacher les contrôles de tri et de recherche
    if (sortBtn) sortBtn.style.display = "none";
    if (searchInput) searchInput.style.display = "none";
  } else {
    // Afficher les contrôles de tri et de recherche
    if (sortBtn) sortBtn.style.display = "flex";
    if (searchInput) searchInput.style.display = "inline-block";

    // Nettoyer la sélection en quittant le mode
    selectedChaptersForDownload.clear();
    if (container) {
      qsa(".chapter-card-list-item.selected-for-download", container).forEach(
        (card) => {
          card.classList.remove("selected-for-download");
        }
      );
    }
  }
  updateDownloadButtonState();
}

function updateDownloadButtonState() {
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const count = selectedChaptersForDownload.size;
  downloadBtn.disabled = count === 0;

  const textSpan = qs(".download-btn-text", downloadBtn);
  if (count > 0) {
    textSpan.textContent = ` Télécharger (${count})`;
  } else {
    textSpan.textContent = ` Télécharger`;
  }
}

/**
 * Gère les changements de filtre ou de tri et met à jour la liste des chapitres.
 * @param {object} controls - L'état actuel des contrôles { sort, search }.
 */
function handleFilterOrSortChange(controls) {
  displayChapterList(controls);
}

/**
 * Filtre, trie et affiche la liste des chapitres dans le DOM.
 * @param {object} controls - L'état des contrôles { sort, search }.
 */
function displayChapterList({ sort, search }) {
  const container = qs(".chapters-list-container", viewContainer);
  if (!container) {
    console.error("[MangaView] Conteneur de liste de chapitres introuvable.");
    return;
  }

  let chapters = Object.entries(currentSeriesData.chapters || {}).map(
    ([id, data]) => ({ id, ...data })
  );

  if (search.trim()) {
    const searchTerm = search
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    chapters = chapters.filter(
      (chap) =>
        chap.id.toLowerCase().includes(searchTerm) ||
        (chap.title &&
          chap.title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes(searchTerm))
    );
  }

  chapters.sort((a, b) => {
    if (sort.type === "date") {
      const dateA = parseDateToTimestamp(a.last_updated);
      const dateB = parseDateToTimestamp(b.last_updated);
      return sort.order === "desc" ? dateB - dateA : dateA - dateB;
    }
    const numA = parseFloat(a.id);
    const numB = parseFloat(b.id);
    return sort.order === "desc" ? numB - numA : numA - numB;
  });

  if (chapters.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; padding: 1rem;">Aucun chapitre ne correspond à votre recherche.</p>`;
  } else {
    container.innerHTML = chapters
      .map((chap) => renderChapterItem(chap))
      .join("");
  }

  attachChapterItemEventListeners(container);
  updateAllVisibleChapterViews();
  initMainScrollObserver(".chapters-list-container .chapter-card-list-item");
}

/**
 * Crée le HTML pour un seul item de la liste de chapitres.
 * @param {object} chapterData - Les données d'un chapitre.
 * @returns {string} Le HTML de l'élément.
 */
function renderChapterItem(chapterData) {
  const seriesSlug = currentSeriesData.slug;
  const isLicensed = chapterData.licensed === true;

  const cardClasses = ["chapter-card-list-item"];
  if (isLicensed) {
    cardClasses.push("licensed-chapter");
  }
  const tooltipText = isLicensed
    ? `Ce chapitre est disponible dans l'édition officielle.`
    : "";

  const href = isLicensed ? "" : `href="/${seriesSlug}/${chapterData.id}"`;

  const interactionKey = `interactions_${seriesSlug}_${chapterData.id}`;
  const localState = getLocalInteractionState(interactionKey);
  const isLiked = !!localState.liked;

  const chapterStats = currentSeriesStats?.[chapterData.id] || {
    likes: 0,
    comments: [],
  };
  let displayLikes = chapterStats.likes || 0;
  if (isLiked) {
    displayLikes++;
  }

  const serverCommentCount = Array.isArray(chapterStats.comments)
    ? chapterStats.comments.length
    : 0;
  const displayComments = serverCommentCount;

  const imgchestId = !chapterData.licensed && chapterData.source?.id;

  const viewsHtml = imgchestId
    ? `<span class="chapter-card-list-views detail-chapter-views" data-imgchest-id="${imgchestId}">
           <i class="fas fa-eye"></i> ...
         </span>`
    : "";

  const chapterNumberHtml = renderItemNumber(chapterData, currentSeriesData.os);

  return `
      <a ${href} class="${cardClasses.join(" ")}" data-chapter-id="${
    chapterData.id
  }" title="${tooltipText}">
        <div class="chapter-card-list-top">
          <div class="chapter-card-list-left">
            <span class="chapter-card-list-number">${chapterNumberHtml}</span>
          </div>
          <div class="chapter-card-list-right">
            ${viewsHtml}
          </div>
        </div>
        <div class="chapter-card-list-bottom">
          <div class="chapter-card-list-left">
            <span class="chapter-card-list-title">${
              chapterData.title || ""
            }</span>
          </div>
          <div class="chapter-card-list-right">
            <span class="chapter-card-list-likes${
              isLiked ? " liked" : ""
            }" data-base-likes="${chapterStats.likes || 0}">
              <i class="fas fa-heart"></i>
              <span class="likes-count">${displayLikes}</span>
            </span>
            <span class="chapter-card-list-comments">
              <i class="fas fa-comment"></i> ${displayComments}
            </span>
          </div>
        </div>
      </a>
    `;
}

/**
 * Attache les écouteurs d'événements pour les items de la liste de chapitres.
 * @param {HTMLElement} container - Le conteneur de la liste.
 */
function attachChapterItemEventListeners(container) {
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".chapter-card-list-item");
    if (!card) return;

    const likeButton = e.target.closest(".chapter-card-list-likes");
    if (likeButton) {
      e.preventDefault();
      e.stopPropagation();
      const chapterId = card.dataset.chapterId;
      const seriesSlug = currentSeriesData.slug;
      handleLikeToggle(seriesSlug, chapterId, likeButton);
    }
  });
}

/**
 * Gère la logique de like/unlike pour un chapitre.
 * @param {string} seriesSlug
 * @param {string} chapterId
 * @param {HTMLElement} likeButton
 */
function handleLikeToggle(seriesSlug, chapterId, likeButton) {
  const interactionKey = `interactions_${seriesSlug}_${chapterId}`;
  const localState = getLocalInteractionState(interactionKey);
  const isLiked = !!localState.liked;

  likeButton.classList.toggle("liked", !isLiked);
  const countSpan = likeButton.querySelector(".likes-count");
  const baseLikes = parseInt(likeButton.dataset.baseLikes, 10) || 0;
  countSpan.textContent = !isLiked ? baseLikes + 1 : baseLikes;

  localState.liked = !isLiked;
  setLocalInteractionState(interactionKey, localState);

  queueAction(seriesSlug, {
    type: !isLiked ? "like" : "unlike",
    chapter: chapterId,
  });

  console.log(
    `[MangaView] Action de like mise en file: ${
      !isLiked ? "like" : "unlike"
    } pour chap. ${chapterId}`
  );
}

/**
 * Configure la logique de déplacement des éléments pour le responsive.
 * @param {HTMLElement} container - Le conteneur principal de la vue.
 */
function setupResponsiveLayout(container) {
  // 1. Identifier tous les éléments à déplacer et leurs parents/cibles
  const elementsToMove = {
    tags: {
      element: qs(".detail-tags", container),
      desktopParent: qs(".series-metadata-container", container), // Son parent d'origine
      mobileTarget: qs("#mobile-tags-target", container), // Sa cible mobile
    },
    actions: {
      element: qs("#reading-actions-container", container),
      desktopParent: qs(".hero-info-bottom", container),
      mobileTarget: qs("#mobile-actions-target", container),
    },
    description: {
      element: qs("#description-wrapper", container),
      desktopParent: qs("#series-info-section", container),
      mobileTarget: qs("#mobile-description-target", container), // Cible pour la description
    },
  };

  // Ajout d'une div "cible" pour la description si elle n'existe pas
  if (!elementsToMove.description.mobileTarget) {
    const descTarget = document.createElement("div");
    descTarget.id = "mobile-description-target";
    // Insérer après les autres cibles mobiles
    qs(".mobile-only-targets", container).appendChild(descTarget);
    elementsToMove.description.mobileTarget = descTarget;
  }

  const updatePositions = () => {
    const isMobile = window.innerWidth <= 768;

    for (const key in elementsToMove) {
      const { element, desktopParent, mobileTarget } = elementsToMove[key];
      if (!element || !desktopParent || !mobileTarget) {
        console.warn(
          `[Responsive] Element manquant pour la clé "${key}". Opération annulée.`
        );
        continue;
      }

      if (isMobile) {
        // Si on est en mobile et que l'élément n'est pas déjà dans la cible mobile
        if (element.parentElement !== mobileTarget) {
          mobileTarget.appendChild(element);
        }
      } else {
        // Si on est en desktop et que l'élément n'est pas dans son parent desktop
        if (element.parentElement !== desktopParent) {
          // Pour la description, on la replace à la fin de la section info
          if (key === "description") {
            desktopParent.appendChild(element);
          } else {
            // Pour les autres, on les remet dans leur conteneur respectif
            desktopParent.appendChild(element);
          }
        }
      }
    }
  };

  // Créer un seul observer pour la page
  resizeObserver = new ResizeObserver(updatePositions);
  resizeObserver.observe(document.body);

  // Exécuter une fois au chargement
  updatePositions();
}
