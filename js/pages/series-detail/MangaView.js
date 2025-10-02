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

  // Déconnecte l'ancien observer s'il existe pour éviter les doublons
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  // Ajout dynamique des bibliothèques JSZip et FileSaver
  if (!document.getElementById("jszip-script")) {
    const jszipScript = document.createElement("script");
    jszipScript.id = "jszip-script";
    jszipScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(jszipScript);
  }
  if (!document.getElementById("filesaver-script")) {
    const fileSaverScript = document.createElement("script");
    fileSaverScript.id = "filesaver-script";
    fileSaverScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";
    document.head.appendChild(fileSaverScript);
  }

  const statsPromise = fetchStats(currentSeriesData.slug);
  renderSeriesInfo(viewContainer, currentSeriesData, {}, "manga");
  renderActionButtons(viewContainer, currentSeriesData, "manga");

  currentSeriesStats = await statsPromise;

  renderSeriesInfo(
    viewContainer,
    currentSeriesData,
    currentSeriesStats,
    "manga"
  );
  initListControls(viewContainer, handleFilterOrSortChange);

  initAccordion({
    buttonSelector: ".series-see-more-btn",
    contentSelector: ".series-more-infos",
    context: viewContainer,
  });

  displayChapterList({
    sort: { type: "number", order: "desc" },
    search: "",
  });

  initDownloadListeners(); // Initialise les écouteurs pour les nouveaux boutons

  // change quelques textes si one-shot
  if (
    seriesData.os &&
    Object.keys(seriesData.chapters).length === 1 &&
    seriesData.chapters.hasOwnProperty("0")
  ) {
    // si one-shot et un seul chapitre
    qs("[data-tab='chapters']").textContent = "One-shot";
  } else if (seriesData.os) {
    // si collection/compilation de one-shots (comme ceux de takaki tsuyoshi)
    qs("[data-tab='chapters']").textContent = "One-shots";
  }

  setupResponsiveLayout(viewContainer);
  preloadAllImgChestViewsOnce();
  initCoverGallery(viewContainer, currentSeriesData);
}

// --- Fonctions pour le mode téléchargement ---

function initDownloadListeners() {
  console.log("[Download] Initialisation des écouteurs de téléchargement.");
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const cancelBtn = qs("#cancel-download-btn", viewContainer);

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleDownloadMode);
  }
  if (downloadBtn) {
    downloadBtn.addEventListener("click", startDownloadProcess);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      console.log("[Download] Clic sur le bouton Annuler détecté.");
      if (abortController) {
        console.log(
          "[Download] abortController existe. Appel de la méthode abort()."
        );
        abortController.abort(); // Déclenche l'annulation
      } else {
        console.warn(
          "[Download] Clic sur Annuler, mais abortController est null."
        );
      }
    });
    console.log("[Download] Écouteur pour le bouton Annuler attaché.");
  } else {
    console.error(
      "[Download] Le bouton Annuler n'a pas été trouvé dans le DOM."
    );
  }
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

function handleChapterSelection(chapterId, cardElement) {
  if (cardElement.classList.contains("licensed-chapter")) {
    return; // Ne pas autoriser la sélection des chapitres sous licence
  }

  if (selectedChaptersForDownload.has(chapterId)) {
    selectedChaptersForDownload.delete(chapterId);
    cardElement.classList.remove("selected-for-download");
  } else {
    selectedChaptersForDownload.add(chapterId);
    cardElement.classList.add("selected-for-download");
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

async function startDownloadProcess() {
  if (typeof JSZip === "undefined" || typeof saveAs === "undefined") {
    alert(
      "Les bibliothèques de téléchargement ne sont pas encore chargées. Veuillez patienter et réessayer."
    );
    return;
  }

  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const cancelBtn = qs("#cancel-download-btn", viewContainer);
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const originalText = downloadBtn.innerHTML;

  abortController = new AbortController();
  const signal = abortController.signal;

  downloadBtn.disabled = true;
  if (toggleBtn) toggleBtn.style.display = "none";
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  const masterZip = new JSZip();
  const chaptersToDownload = Array.from(selectedChaptersForDownload);
  const totalChapters = chaptersToDownload.length;
  let processedChaptersCount = 0;

  // Pour l'estimation du temps
  const startTime = Date.now();
  let timeEstimates = [];

  try {
    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Téléchargement 0/${totalChapters}`;

    const chapterProcessingPromises = chaptersToDownload.map(
      async (chapterId) => {
        if (signal.aborted)
          throw new DOMException("Téléchargement annulé", "AbortError");

        const chapterStartTime = Date.now();

        const chapterData = currentSeriesData.chapters[chapterId];
        const imgchestId = chapterData.groups?.Big_herooooo?.split("/").pop();

        if (!imgchestId) {
          console.warn(
            `Pas d'ID ImgChest pour le chapitre ${chapterId}, ignoré.`
          );
          return null; // On renvoie null pour que le compteur s'incrémente quand même
        }

        const zipResponse = await fetch(`/api/proxy-zip?id=${imgchestId}`, {
          signal,
        });
        if (!zipResponse.ok) {
          console.warn(`Échec du fetch pour le ZIP du chapitre ${chapterId}`);
          return null;
        }

        const chapterZipBlob = await zipResponse.blob();
        const chapterZip = await JSZip.loadAsync(chapterZipBlob);

        // On retourne le zip chargé pour le traiter de manière synchrone plus tard
        // et éviter les conflits d'écriture dans le masterZip
        const chapterProcessingTime = Date.now() - chapterStartTime;
        timeEstimates.push(chapterProcessingTime);

        return { chapterId, chapterZip };
      }
    );

    // On attend que chaque chapitre soit traité (téléchargé et chargé en mémoire)
    for (const promise of chapterProcessingPromises) {
      const result = await promise; // Attend la résolution de chaque promesse une par une

      processedChaptersCount++;

      // Calcul de l'estimation du temps restant
      const averageTime =
        timeEstimates.reduce((a, b) => a + b, 0) / timeEstimates.length;
      const chaptersRemaining = totalChapters - processedChaptersCount;
      const estimatedTimeMs = chaptersRemaining * averageTime;
      const estimatedTimeSec = Math.round(estimatedTimeMs / 1000);
      const timeString =
        estimatedTimeSec > 0 ? ` (est. ${estimatedTimeSec}s)` : "";

      downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Téléchargement ${processedChaptersCount}/${totalChapters}${timeString}`;

      if (result) {
        // Maintenant on ajoute les fichiers au masterZip
        const { chapterId, chapterZip } = result;
        const chapterFolder = masterZip.folder(`Ch. ${chapterId}`);
        const filePromises = [];
        chapterZip.forEach((relativePath, file) => {
          if (!file.dir) {
            const p = file.async("blob").then((fileData) => {
              chapterFolder.file(file.name, fileData);
            });
            filePromises.push(p);
          }
        });
        await Promise.all(filePromises);
      }
    }

    // --- Étape 2 : Génération de l'archive finale ---
    downloadBtn.innerHTML = `<i class="fas fa-cog fa-spin"></i> Compression...`;

    const finalZipBlob = await masterZip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      },
      (metadata) => {
        if (signal.aborted)
          throw new DOMException("Annulé pendant la compression", "AbortError");
        if (metadata.percent) {
          downloadBtn.innerHTML = `<i class="fas fa-cog fa-spin"></i> Compression... ${Math.round(
            metadata.percent
          )}%`;
        }
      }
    );

    const seriesTitle = slugify(currentSeriesData.title);
    const chapterNumbers = chaptersToDownload.join("-");
    saveAs(finalZipBlob, `BigSolo - ${seriesTitle} - Ch ${chapterNumbers}.zip`);
  } catch (error) {
    if (error.name === "AbortError") {
      alert("Le téléchargement a été annulé.");
    } else {
      console.error(
        "Erreur lors du processus de téléchargement groupé :",
        error
      );
      alert(
        `Une erreur est survenue pendant le téléchargement : ${error.message}`
      );
    }
  } finally {
    // --- Étape 3 : Nettoyage de l'interface ---
    downloadBtn.innerHTML = originalText;
    if (cancelBtn) cancelBtn.style.display = "none";
    if (toggleBtn) toggleBtn.style.display = "inline-flex";
    abortController = null;

    if (isDownloadMode) {
      toggleDownloadMode();
    }
  }
}

// --- Fin des fonctions pour le mode téléchargement ---

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
  const isLicensed = chapterData.licencied === true;

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

  const imgchestId = chapterData.groups?.Big_herooooo?.split("/").pop() || "";

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

    // --- LOGIQUE LIKE ---
    const likeButton = e.target.closest(".chapter-card-list-likes");
    if (likeButton) {
      e.preventDefault();
      e.stopPropagation();
      const chapterId = card.dataset.chapterId;
      const seriesSlug = currentSeriesData.slug;
      handleLikeToggle(seriesSlug, chapterId, likeButton);
      return;
    }

    // --- LOGIQUE SÉLECTION POUR TÉLÉCHARGEMENT ---
    if (isDownloadMode) {
      e.preventDefault();
      e.stopPropagation();
      const chapterId = card.dataset.chapterId;
      handleChapterSelection(chapterId, card);
      return;
    }

    // Si on n'est ni en mode like ni en mode download, c'est une navigation normale,
    // le comportement par défaut du lien `<a>` s'appliquera.
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
