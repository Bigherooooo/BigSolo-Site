// --- File: js/pages/series-detail/AnimePlayer/components/infoSidebar.js ---

import { qs, qsa } from "../../../../utils/domUtils.js";
import { state } from "../state.js";
import { timeAgo } from "../../../../utils/dateUtils.js";
import { getLocalInteractionState } from "../../../../utils/interactions.js";

export function attachAccordionListeners() {
  const sidebar = qs("#info-sidebar");
  if (!sidebar) return;

  sidebar.addEventListener("click", (event) => {
    const header = event.target.closest(".group-title.collapsible");
    if (header) {
      const allHeaders = qsa(".group-title.collapsible", sidebar);
      const contentWrapper = header.nextElementSibling;
      const isAlreadyOpen = header.classList.contains("is-open");

      allHeaders.forEach((otherHeader) => {
        if (otherHeader !== header) {
          otherHeader.classList.remove("is-open");
          otherHeader.nextElementSibling.style.maxHeight = null;
        }
      });

      if (isAlreadyOpen) {
        header.classList.remove("is-open");
        contentWrapper.style.maxHeight = null;
      } else {
        header.classList.add("is-open");
        contentWrapper.style.maxHeight = contentWrapper.scrollHeight + "px";
      }
    }

    // Ajout de l'écouteur pour le bouton de fermeture
    if (event.target.closest(".close-sidebar-btn")) {
      document.dispatchEvent(new CustomEvent("close-sidebars"));
    }
  });
}

export function init() {}

export function render() {
  const sidebar = qs("#info-sidebar");
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sidebar-content-wrapper">
        <div id="info-series-link-group" class="control-group">
            <a id="info-series-link" href="/${state.seriesData.slug}/episodes">
                <i class="fas fa-arrow-left"></i> ${state.seriesData.title}
            </a>
        </div>
        <div id="seasons-container">
            <p>Chargement des saisons...</p>
        </div>
    </div>
    `;
}

export function updateEpisodeList() {
  const seasonsContainer = qs("#seasons-container");
  if (!seasonsContainer) return;

  const episodesBySeason = state.allEpisodes.reduce((acc, episode) => {
    const season = episode.saison_ep || 1;
    if (!acc[season]) acc[season] = [];
    acc[season].push(episode);
    return acc;
  }, {});

  const sortedSeasons = Object.keys(episodesBySeason).sort(
    (a, b) => parseInt(b) - parseInt(a)
  );

  seasonsContainer.innerHTML = sortedSeasons
    .map((seasonNum) => {
      const episodes = episodesBySeason[seasonNum].sort(
        (a, b) => b.indice_ep - a.indice_ep
      );

      return `
            <div class="control-group">
                <h4 class="group-title collapsible">Saison ${seasonNum} <i class="fas fa-chevron-down volume-arrow"></i></h4>
                <div class="chapter-list-wrapper">
                    <div class="chapter-list">
                        ${episodes
                          .map((ep) =>
                            renderEpisodeItem(
                              ep,
                              ep.absolute_index ===
                                state.currentEpisode.absolute_index
                            )
                          )
                          .join("")}
                    </div>
                </div>
            </div>
        `;
    })
    .join("");

  updateActiveEpisodeInList(state.currentEpisode.absolute_index, true);
}

function renderEpisodeItem(ep, isActive) {
  const episodeId = `ep-S${ep.saison_ep || 1}-${ep.indice_ep}`;
  const interactionKey = `interactions_${state.seriesData.slug}_${episodeId}`;
  const localState = getLocalInteractionState(interactionKey);
  const isLiked = !!localState.liked;

  const episodeStats = state.seriesStats[episodeId] || { likes: 0 };
  let displayLikes = episodeStats.likes || 0;
  if (isLiked) {
    displayLikes = (state.seriesStats[episodeId] || { likes: 0 }).likes + 1;
  }

  const statsHtml = isActive
    ? `
        <div class="chapter-stats-details">
            <span class="detail-chapter-likes ${
              isLiked ? "liked" : ""
            }"><i class="fas fa-heart"></i><span class="likes-count">${displayLikes}</span></span>
            <span class="detail-chapter-date"><i class="fas fa-clock"></i> ${timeAgo(
              ep.date_ep
            )}</span>
        </div>
    `
    : "";

  return `
        <a href="/${state.seriesData.slug}/episodes/${
    ep.absolute_index
  }" class="${isActive ? "active" : ""}" title="Saison ${
    ep.saison_ep || 1
  }, Épisode ${ep.indice_ep} : ${ep.title_ep}" data-episode-id="${
    ep.absolute_index
  }">
            <div class="chapter-info-main">
                <span class="chapter-number">${String(ep.indice_ep).padStart(
                  2,
                  "0"
                )}</span>
                <span class="chapter-title">${ep.title_ep || ""}</span>
            </div>
            ${statsHtml}
        </a>
    `;
}

export function updateActiveEpisodeInList(
  newAbsoluteIndex,
  isInitialLoad = false
) {
  const sidebar = qs("#info-sidebar");
  if (!sidebar) return;

  const oldActive = qs("a.active", sidebar);
  if (oldActive) {
    const oldEpisode = state.allEpisodes.find(
      (ep) => String(ep.absolute_index) === oldActive.dataset.episodeId
    );
    if (oldEpisode) oldActive.outerHTML = renderEpisodeItem(oldEpisode, false);
  }

  const newActive = qs(`a[data-episode-id="${newAbsoluteIndex}"]`, sidebar);
  if (newActive) {
    const newEpisode = state.allEpisodes.find(
      (ep) => String(ep.absolute_index) === String(newAbsoluteIndex)
    );
    if (newEpisode) newActive.outerHTML = renderEpisodeItem(newEpisode, true);
  }

  if (isInitialLoad) {
    const activeSeasonGroup = qs(`#info-sidebar .control-group:has(a.active)`);
    if (activeSeasonGroup) {
      const header = qs(".group-title", activeSeasonGroup);
      if (header && !header.classList.contains("is-open")) {
        header.click();
      } else {
        const activeLink = qs("a.active", activeSeasonGroup);
        if (activeLink)
          setTimeout(() => {
            activeLink.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 400);
      }
    }
  }
}

export function updateStatsInList() {
  const activeLink = qs("#info-sidebar a.active");
  if (!activeLink) return;

  const likesSpan = qs(".detail-chapter-likes", activeLink);
  const likesCount = qs(".likes-count", likesSpan);
  if (!likesSpan || !likesCount) return;

  const ep = state.currentEpisode;
  const episodeId = `ep-S${ep.saison_ep || 1}-${ep.indice_ep}`;
  const interactionKey = `interactions_${state.seriesData.slug}_${episodeId}`;
  const isLiked = !!getLocalInteractionState(interactionKey).liked;

  const episodeStats = state.seriesStats[episodeId] || { likes: 0 };
  let displayLikes = episodeStats.likes;
  if (isLiked) {
    displayLikes = (state.seriesStats[episodeId] || { likes: 0 }).likes + 1;
  }

  likesSpan.classList.toggle("liked", isLiked);
  likesCount.textContent = displayLikes;
}
