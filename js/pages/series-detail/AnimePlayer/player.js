// --- File: js/pages/series-detail/AnimePlayer/player.js ---

import { qs, slugify } from "../../../utils/domUtils.js";
import { state, dom } from "./state.js";
import * as infoSidebar from "./components/infoSidebar.js";
import * as playerFrame from "./components/playerFrame.js";
import {
  fetchSeriesStats,
  queueAction,
  getLocalInteractionState,
  setLocalInteractionState,
} from "../../../utils/interactions.js";

let isMobileView = false;
let savedScrollY = 0;

export async function initAnimePlayer() {
  const dataPlaceholder = qs("#player-data-placeholder");
  if (
    !dataPlaceholder?.textContent ||
    dataPlaceholder.textContent.includes("PLAYER_DATA_PLACEHOLDER")
  ) {
    return handleError("Les données du lecteur n'ont pas été trouvées.");
  }

  try {
    const playerData = JSON.parse(dataPlaceholder.textContent);
    state.seriesData = playerData.series;
    state.seriesData.slug = slugify(state.seriesData.title);

    state.allEpisodes = enrichEpisodesWithAbsoluteIndex(
      state.seriesData.episodes || []
    );

    state.currentEpisode = state.allEpisodes.find(
      (ep) => String(ep.absolute_index) === String(playerData.episodeNumber)
    );

    if (!state.currentEpisode) {
      throw new Error(
        `Épisode avec l'index absolu ${playerData.episodeNumber} non trouvé.`
      );
    }

    state.seriesStats = await fetchSeriesStats(state.seriesData.slug);

    isMobileView = window.innerWidth <= 768;

    setupBaseLayout();
    initializeGlobalEvents();
    infoSidebar.render();
    infoSidebar.attachAccordionListeners();

    updatePlayerState(playerData.episodeNumber, true);
  } catch (error) {
    handleError(`Impossible de charger le lecteur : ${error.message}`);
    console.error(error);
  }
}

function updatePlayerState(absoluteEpisodeIndex, isFirstLoad = false) {
  state.currentEpisode = state.allEpisodes.find(
    (ep) => String(ep.absolute_index) === String(absoluteEpisodeIndex)
  );
  if (!state.currentEpisode) return;

  const seasonText = state.currentEpisode.saison_ep
    ? `S${state.currentEpisode.saison_ep}`
    : "";
  document.title = `${state.seriesData.title} - ${seasonText} ÉP.${state.currentEpisode.indice_ep} | BigSolo`;

  if (isFirstLoad) {
    infoSidebar.updateEpisodeList();
  } else {
    infoSidebar.updateActiveEpisodeInList(absoluteEpisodeIndex);
  }

  playerFrame.render();
  updateAllLikeButtons();

  if (isMobileView) {
    updateMobileControlsUI();
  }
}

function handleGlobalLike() {
  const ep = state.currentEpisode;
  const episodeId = `ep-S${ep.saison_ep || 1}-${ep.indice_ep}`;
  const interactionKey = `interactions_${state.seriesData.slug}_${episodeId}`;
  let localState = getLocalInteractionState(interactionKey);
  const isLiked = !!localState.liked;

  localState.liked = !isLiked;
  setLocalInteractionState(interactionKey, localState);

  queueAction(state.seriesData.slug, {
    type: !isLiked ? "like" : "unlike",
    chapter: episodeId,
  });

  const episodeStats = state.seriesStats[episodeId] || { likes: 0 };
  if (!isLiked) {
    episodeStats.likes = (episodeStats.likes || 0) + 1;
  } else {
    episodeStats.likes = Math.max(0, (episodeStats.likes || 0) - 1);
  }
  state.seriesStats[episodeId] = episodeStats;

  updateAllLikeButtons();
}

function updateAllLikeButtons() {
  const ep = state.currentEpisode;
  const episodeId = `ep-S${ep.saison_ep || 1}-${ep.indice_ep}`;
  const interactionKey = `interactions_${state.seriesData.slug}_${episodeId}`;
  const isLiked = !!getLocalInteractionState(interactionKey).liked;

  if (dom.toggleLikeBtn) {
    dom.toggleLikeBtn.classList.toggle("liked", isLiked);
  }
  if (dom.mobileLikeStat) {
    dom.mobileLikeStat.classList.toggle("liked", isLiked);
    const likesCount = dom.mobileLikeStat.querySelector(".mrc-likes-count");
    if (likesCount) {
      const stats = state.seriesStats[episodeId] || { likes: 0 };
      likesCount.textContent = stats.likes || 0;
    }
  }
  infoSidebar.updateStatsInList();
}

function setupBaseLayout() {
  dom.root = qs("#anime-player-root");

  if (isMobileView) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <div id="reader-bars-wrapper" class="mobile-only">
          <div id="mobile-reader-controls"></div>
        </div>
        <div class="mobile-sidebar-overlay mobile-only"></div>
    `
    );
    const header = qs("body > #main-header");
    if (header) qs("#reader-bars-wrapper").prepend(header);

    dom.root.innerHTML = `
      <div class="reader-layout-container">
          <aside id="info-sidebar" class="reader-sidebar"></aside>
          <div class="reader-container"></div>
      </div>
    `;
  } else {
    dom.root.innerHTML = `
      <div id="global-reader-controls">
          <button id="toggle-info-sidebar-btn" title="Liste des épisodes"><i class="fas fa-info-circle"></i></button>
          <button id="toggle-episode-like" title="J'aime cet épisode"><i class="fas fa-heart"></i></button>
      </div>
      <div class="reader-layout-container">
          <aside id="info-sidebar" class="reader-sidebar"></aside>
          <div class="reader-container"></div>
      </div>
    `;
  }

  Object.assign(dom, {
    infoSidebar: qs("#info-sidebar"),
  });
}

function initializeGlobalEvents() {
  if (isMobileView) {
    initializeMobileEvents();
  } else {
    initializeDesktopEvents();
  }
}

function initializeDesktopEvents() {
  Object.assign(dom, {
    toggleInfoBtn: qs("#toggle-info-sidebar-btn"),
    toggleLikeBtn: qs("#toggle-episode-like"),
  });
  dom.toggleInfoBtn.addEventListener("click", () => {
    state.infoSidebarOpen = !state.infoSidebarOpen;
    dom.toggleInfoBtn.classList.toggle("active", state.infoSidebarOpen);
    updateLayout();
  });
  dom.toggleLikeBtn.addEventListener("click", handleGlobalLike);
  updateLayout();
}

function initializeMobileEvents() {
  renderMobileControls();
  Object.assign(dom, {
    mobileSidebarOverlay: qs(".mobile-sidebar-overlay"),
  });

  dom.mobileToggleSidebarBtn.addEventListener("click", () =>
    toggleSidebar(dom.infoSidebar)
  );
  dom.mobileLikeStat.addEventListener("click", handleGlobalLike);
  dom.mobileSidebarOverlay.addEventListener("click", closeAllSidebars);
  document.addEventListener("close-sidebars", closeAllSidebars);
}

function renderMobileControls() {
  const container = qs("#mobile-reader-controls");
  if (!container) return;

  container.innerHTML = `
      <button id="mobile-toggle-sidebar-btn" title="Liste des épisodes">
          <i class="fas fa-bars"></i>
      </button>
      <div class="mrc-info-wrapper">
          <div class="mrc-top-row">
              <span class="mrc-series-title"></span>
              <span class="mrc-page-counter"></span>
          </div>
          <div class="mrc-bottom-row">
              <div class="mrc-chapter-details">
                  <span class="mrc-chapter-number"></span>
                  <span class="mrc-chapter-title"></span>
              </div>
              <div class="mrc-stats-group">
                  <span id="mobile-like-stat" class="mrc-stat-item" title="J'aime cet épisode">
                      <i class="fas fa-heart"></i>
                      <span class="mrc-likes-count">0</span>
                  </span>
              </div>
          </div>
      </div>
    `;

  Object.assign(dom, {
    mobileToggleSidebarBtn: qs("#mobile-toggle-sidebar-btn"),
    mobileLikeStat: qs("#mobile-like-stat"),
  });
}

function updateMobileControlsUI() {
  qs(".mrc-series-title").textContent = state.seriesData.title;
  qs(".mrc-page-counter").textContent = `Saison ${
    state.currentEpisode.saison_ep || 1
  }`;
  qs(".mrc-chapter-number").textContent = state.currentEpisode.indice_ep;
  qs(".mrc-chapter-title").textContent = state.currentEpisode.title_ep;
}

function toggleSidebar(sidebarToOpen) {
  const isAlreadyOpen = sidebarToOpen.classList.contains("is-open");
  sidebarToOpen.classList.toggle("is-open", !isAlreadyOpen);
  dom.mobileSidebarOverlay.classList.toggle("is-visible", !isAlreadyOpen);
  document.body.classList.toggle("sidebar-is-open", !isAlreadyOpen);
}

function closeAllSidebars() {
  if (dom.infoSidebar) dom.infoSidebar.classList.remove("is-open");
  if (dom.mobileSidebarOverlay)
    dom.mobileSidebarOverlay.classList.remove("is-visible");
  document.body.classList.remove("sidebar-is-open");
}

function updateLayout() {
  if (isMobileView) return;
  let infoWidth = 0;
  const rootStyle = getComputedStyle(document.documentElement);
  const infoWidthRem = parseFloat(
    rootStyle.getPropertyValue("--sidebar-info-width")
  );
  const baseFontSize = parseFloat(rootStyle.fontSize);

  if (state.infoSidebarOpen && dom.infoSidebar) {
    infoWidth = infoWidthRem * baseFontSize;
    dom.infoSidebar.style.transform = "translateX(0)";
  } else if (dom.infoSidebar) {
    dom.infoSidebar.style.transform = "translateX(-100%)";
  }

  const readerContainer = qs(".reader-container");
  if (readerContainer) {
    readerContainer.style.marginLeft = `${infoWidth}px`;
  }
}

function handleEpisodeNavigation(event) {
  const link = event.target.closest("a");
  if (link && link.dataset.episodeId) {
    event.preventDefault();
    if (link.classList.contains("active")) {
      return;
    }

    const absoluteEpisodeIndex = link.dataset.episodeId;
    history.pushState({ episodeNumber: absoluteEpisodeIndex }, "", link.href);
    updatePlayerState(absoluteEpisodeIndex);
    closeAllSidebars();
  }
}

function handleError(message) {
  console.error(message);
  const root = qs("#anime-player-root");
  if (root) {
    root.innerHTML = `<p style="padding: 2rem; text-align: center; color: var(--clr-text-sub);">${message}</p>`;
  }
}

function enrichEpisodesWithAbsoluteIndex(episodes) {
  if (!episodes) return [];

  const episodesWithSeason = episodes.map((ep) => ({
    ...ep,
    saison_ep: ep.saison_ep || 1,
  }));

  const episodesBySeason = episodesWithSeason.reduce((acc, ep) => {
    const season = ep.saison_ep;
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
      (a, b) => a.indice_ep - b.indice_ep
    );
    seasonEpisodes.forEach((ep) => {
      enrichedEpisodes.push({ ...ep, absolute_index: absoluteIndexCounter });
      absoluteIndexCounter++;
    });
  });
  return enrichedEpisodes;
}
