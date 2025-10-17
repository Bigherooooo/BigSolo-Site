// --- File: js/pages/series-detail/AnimeView.js ---

import { qs } from "../../utils/domUtils.js";
import { timeAgo, parseDateToTimestamp } from "../../utils/dateUtils.js";
import {
  queueAction,
  getLocalInteractionState,
  setLocalInteractionState,
} from "../../utils/interactions.js";
import { renderSeriesInfo } from "./shared/infoRenderer.js";
import { renderActionButtons } from "./shared/actionButtons.js";
import { initListControls } from "./shared/listControls.js";
import { fetchStats } from "./shared/statsManager.js";
import { initMainScrollObserver } from "../../components/observer.js";

let currentSeriesData = null;
let currentSeriesStats = null;
let viewContainer = null;
let resizeObserver = null;

/**
 * Ajoute un index absolu à chaque épisode pour la navigation.
 * @param {Array} episodes - La liste des épisodes de la série.
 * @returns {Array} La liste des épisodes enrichie avec un `absolute_index`.
 */
function enrichEpisodesWithAbsoluteIndex(episodes) {
  if (!episodes) return [];

  const episodesWithSeason = episodes.map((ep) => ({
    ...ep,
    season: ep.season || 1,
  }));

  const episodesBySeason = episodesWithSeason.reduce((acc, ep) => {
    const season = ep.season;
    if (!acc[season]) acc[season] = [];
    acc[season].push(ep);
    return acc;
  }, {});

  const sortedSeasons = Object.keys(episodesBySeason).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  let absoluteIndexCounter = 1;
  let enrichedEpisodes = [];

  sortedSeasons.forEach((seasonNum) => {
    const seasonEpisodes = episodesBySeason[seasonNum].sort(
      (a, b) => a.number - b.number
    );
    seasonEpisodes.forEach((ep) => {
      enrichedEpisodes.push({ ...ep, absolute_index: absoluteIndexCounter });
      absoluteIndexCounter++;
    });
  });
  return enrichedEpisodes;
}

/**
 * Configure la logique de déplacement des éléments pour le responsive.
 * @param {HTMLElement} container - Le conteneur principal de la vue.
 */
function setupResponsiveLayout(container) {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }

  const elementsToMove = {
    tags: {
      element: qs(".detail-tags", container),
      desktopParent: qs(".series-metadata-container", container),
      mobileTarget: qs("#mobile-tags-target", container),
    },
    actions: {
      element: qs("#reading-actions-container", container),
      desktopParent: qs(".hero-info-bottom", container),
      mobileTarget: qs("#mobile-actions-target", container),
    },
    description: {
      element: qs("#description-wrapper", container),
      desktopParent: qs("#series-info-section", container),
      mobileTarget: qs("#mobile-description-target", container),
    },
  };

  if (!elementsToMove.description.mobileTarget) {
    const descTarget = document.createElement("div");
    descTarget.id = "mobile-description-target";
    qs(".mobile-only-targets", container).appendChild(descTarget);
    elementsToMove.description.mobileTarget = descTarget;
  }

  const updatePositions = () => {
    const isMobile = window.innerWidth <= 768;
    for (const key in elementsToMove) {
      const { element, desktopParent, mobileTarget } = elementsToMove[key];
      if (element && desktopParent && mobileTarget) {
        if (isMobile && element.parentElement !== mobileTarget) {
          mobileTarget.appendChild(element);
        } else if (!isMobile && element.parentElement !== desktopParent) {
          if (key === "description") {
            desktopParent.appendChild(element);
          } else {
            desktopParent.appendChild(element);
          }
        }
      }
    }
  };

  resizeObserver = new ResizeObserver(updatePositions);
  resizeObserver.observe(document.body);
  updatePositions();
}

/**
 * Point d'entrée pour le rendu de la vue Anime.
 * @param {HTMLElement} mainContainer - L'élément <main> de la page.
 * @param {object} seriesData - Les données de la série.
 */
export async function render(mainContainer, seriesData) {
  console.log("[AnimeView] Début du rendu.");
  currentSeriesData = seriesData;
  viewContainer = mainContainer;

  if (!seriesData.anime || seriesData.anime.length === 0) {
    viewContainer.innerHTML =
      "<p class='loading-message'>Aucune information sur l'anime disponible pour cette série.</p>";
    return;
  }

  const statsPromise = fetchStats(currentSeriesData.slug);

  renderSeriesInfo(viewContainer, currentSeriesData, {}, "anime");
  renderActionButtons(viewContainer, currentSeriesData, "anime");

  currentSeriesStats = await statsPromise;

  renderSeriesInfo(
    viewContainer,
    currentSeriesData,
    currentSeriesStats,
    "anime"
  );

  initListControls(viewContainer, handleFilterOrSortChange);

  displayEpisodeList({
    search: "",
    sort: { type: "number", order: "desc" },
  });

  setupResponsiveLayout(viewContainer);
}

function handleFilterOrSortChange(controls) {
  displayEpisodeList(controls);
}

function displayEpisodeList({ search, sort }) {
  const container = qs(".chapters-list-container", viewContainer);
  if (!container) {
    console.error("[AnimeView] Conteneur de liste d'épisodes introuvable.");
    return;
  }

  let episodes = enrichEpisodesWithAbsoluteIndex(
    currentSeriesData.episodes || []
  );

  if (search.trim()) {
    const searchTerm = search
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    episodes = episodes.filter(
      (ep) =>
        String(ep.number).toLowerCase().includes(searchTerm) ||
        (ep.title &&
          ep.title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes(searchTerm))
    );
  }

  // NOUVELLE LOGIQUE DE TRI DYNAMIQUE
  episodes.sort((a, b) => {
    // Le tri primaire par saison (décroissant) est conservé pour la cohérence
    if (b.season !== a.season) {
      return b.season - a.season;
    }

    // Le tri secondaire dépend du choix de l'utilisateur
    if (sort.type === "date") {
      const dateA = parseDateToTimestamp(a.timestamp);
      const dateB = parseDateToTimestamp(b.timestamp);
      return sort.order === "desc" ? dateB - dateA : dateA - dateB;
    } else {
      // 'number'
      const numA = a.number;
      const numB = b.number;
      return sort.order === "desc" ? numB - numA : numA - numB;
    }
  });

  if (episodes.length === 0) {
    container.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; padding: 1rem;">Aucun épisode ne correspond à votre recherche.</p>`;
  } else {
    container.innerHTML = episodes.map((ep) => renderEpisodeItem(ep)).join("");
  }

  attachEpisodeItemEventListeners(container);
  initMainScrollObserver(".chapters-list-container .chapter-card-list-item");
}

function renderEpisodeItem(episodeData) {
  const seriesSlug = currentSeriesData.slug;
  const episodeId = `ep-S${episodeData.season || 1}-${
    episodeData.number
  }`;
  const interactionKey = `interactions_${seriesSlug}_${episodeId}`;
  const localState = getLocalInteractionState(interactionKey);
  const isLiked = !!localState.liked;

  const episodeStats = currentSeriesStats?.[episodeId] || { likes: 0 };
  let displayLikes = episodeStats.likes || 0;
  if (isLiked) {
    displayLikes++;
  }

  let episodeNumberHtml;
  if (episodeData.season && !isNaN(episodeData.season)) {
    episodeNumberHtml = `
      <span class="volume-prefix">Saison ${episodeData.season}</span>
      <span class="chapter-prefix">Épisode ${episodeData.number}</span>
    `;
  } else {
    episodeNumberHtml = `Épisode ${episodeData.number}`;
  }

  return `
    <a href="/${seriesSlug}/episodes/${
    episodeData.absolute_index
  }" class="chapter-card-list-item" data-episode-id="${
    episodeData.absolute_index
  }">
        <div class="chapter-card-list-top">
            <div class="chapter-card-list-left">
            <span class="chapter-card-list-number">${episodeNumberHtml}</span>
            </div>
        </div>
        <div class="chapter-card-list-bottom">
            <div class="chapter-card-list-left">
            <span class="chapter-card-list-title">${
              episodeData.title || ""
            }</span>
            </div>
            <div class="chapter-card-list-right">
            <span class="chapter-card-list-likes${
              isLiked ? " liked" : ""
            }" data-base-likes="${episodeStats.likes || 0}">
                <i class="fas fa-heart"></i>
                <span class="likes-count">${displayLikes}</span>
            </span>
            </div>
        </div>
    </a>
    `;
}

function attachEpisodeItemEventListeners(container) {
  container
    .querySelectorAll(".chapter-card-list-likes")
    .forEach((likeButton) => {
      likeButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const card = likeButton.closest(".chapter-card-list-item");
        const absoluteEpisodeIndex = card.dataset.episodeId;
        const seriesSlug = currentSeriesData.slug;

        const allEnrichedEpisodes = enrichEpisodesWithAbsoluteIndex(
          currentSeriesData.episodes || []
        );
        const episode = allEnrichedEpisodes.find(
          (ep) => String(ep.absolute_index) === absoluteEpisodeIndex
        );
        if (episode) {
          handleLikeToggle(seriesSlug, episode, likeButton);
        }
      });
    });
}

function handleLikeToggle(seriesSlug, episode, likeButton) {
  const episodeId = `ep-S${episode.season || 1}-${episode.number}`;
  const interactionKey = `interactions_${seriesSlug}_${episodeId}`;
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
    chapter: episodeId,
  });

  console.log(
    `[AnimeView] Action de like mise en file: ${
      !isLiked ? "like" : "unlike"
    } pour ép. ${episode.number}`
  );
}
