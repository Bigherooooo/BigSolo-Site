// --- File: js/pages/series-detail/shared/actionButtons.js ---

import { qs } from "../../../utils/domUtils.js";

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
 * Affiche les boutons d'action de lecture/visionnage.
 * @param {HTMLElement} viewContainer - Le conteneur principal de la vue.
 * @param {object} seriesData - Les données de la série.
 * @param {'manga' | 'anime'} viewType - Le type de vue.
 */
export function renderActionButtons(viewContainer, seriesData, viewType) {
  console.log(`[ActionButtons] Rendu des boutons pour la vue : ${viewType}`);
  const actionsDiv = qs("#reading-actions-container", viewContainer);
  if (!actionsDiv) {
    console.warn(
      "[ActionButtons] Conteneur #reading-actions-container introuvable."
    );
    return;
  }

  Array.from(actionsDiv.children).forEach((child) => {
    if (child.id !== "series-rating-container") {
      child.remove();
    }
  });

  const seriesSlug = seriesData.slug;

  const isOneShot = seriesData.os && Object.keys(seriesData.chapters).length === 1 && seriesData.chapters.hasOwnProperty("0");
  const isOneShotCollection = seriesData.os;
  console.log("[ActionButtons] Série One-shot :", isOneShot);

  const localKey =
    viewType === "manga"
      ? `reading-progress-${seriesSlug}`
      : `watching-progress-${seriesSlug}`;
  const savedProgress = localStorage.getItem(localKey);

  const labels = {
    manga: { singular: "chapitre", plural: "chapitres", prefix: "Ch." },
    anime: { singular: "épisode", plural: "épisodes", prefix: "Ép." },
  };
  const currentLabels = labels[viewType];
  const urlPath = viewType === "manga" ? "" : "/episodes";

  let lastItemKey = null;
  let itemsExist = false;
  let lastItemLabel = "";
  let continueItemLabel = "";

  if (viewType === "manga") {
    const chapterKeys = Object.keys(seriesData.chapters || {});
    if (chapterKeys.length > 0) {
      itemsExist = true;
      chapterKeys.sort((a, b) => parseFloat(b) - parseFloat(a));
      lastItemKey = chapterKeys[0];
      lastItemLabel = `${currentLabels.prefix} ${lastItemKey}`;
      if (savedProgress) {
        continueItemLabel = `${currentLabels.prefix} ${savedProgress}`;
      }
    }
  } else {
    const enrichedEpisodes = enrichEpisodesWithAbsoluteIndex(
      seriesData.episodes
    );
    if (enrichedEpisodes.length > 0) {
      itemsExist = true;
      const lastEpisode = enrichedEpisodes[enrichedEpisodes.length - 1];
      lastItemKey = lastEpisode.absolute_index;
      lastItemLabel = `S${lastEpisode.season} ${currentLabels.prefix} ${lastEpisode.number}`;

      if (savedProgress) {
        const continueEpisode = enrichedEpisodes.find(
          (e) => e.absolute_index.toString() === savedProgress
        );
        if (continueEpisode) {
          continueItemLabel = `S${continueEpisode.season} ${currentLabels.prefix} ${continueEpisode.number}`;
        }
      }
    }
  }

  if (!itemsExist) {
    console.log(
      `[ActionButtons] Aucun ${currentLabels.plural} à afficher, pas de boutons.`
    );
    return;
  }

  if (!savedProgress) {
    if (isOneShot) {
      const oneShotBtn = createButton(
        `Lire le One-shot`,
        `/${seriesSlug}${urlPath}/${lastItemKey}`
      );
      actionsDiv.appendChild(oneShotBtn);
      return;
    } else if (isOneShotCollection) {
      const collectionBtn = createButton(
        `Dernier One-shot (${lastItemKey})`,
        `/${seriesSlug}${urlPath}/${lastItemKey}`
      );
      actionsDiv.appendChild(collectionBtn);
      return;
    }
    const lastBtn = createButton(
      `Dernier ${currentLabels.singular} (${lastItemLabel})`,
      `/${seriesSlug}${urlPath}/${lastItemKey}`
    );
    actionsDiv.appendChild(lastBtn);
  } else {
    const isUpToDate = savedProgress.toString() === lastItemKey.toString();
    if (isUpToDate) {
      const upToDateBtn = createDisabledButton("À jour");
      actionsDiv.appendChild(upToDateBtn);
    } else {
      const lastBtn = createButton(
        `Dernier ${currentLabels.singular} (${lastItemLabel})`,
        `/${seriesSlug}${urlPath}/${lastItemKey}`
      );
      const continueBtn = createButton(
        `Continuer (${continueItemLabel})`,
        `/${seriesSlug}${urlPath}/${savedProgress}`,
        true
      );

      actionsDiv.appendChild(lastBtn);
      actionsDiv.appendChild(continueBtn);
    }
  }
}

function createButton(text, href, isContinue = false) {
  const btn = document.createElement("a");
  btn.href = href;
  btn.className = "detail-action-btn";
  if (isContinue) {
    btn.classList.add("detail-action-btn--continue");
  }
  btn.textContent = text;
  return btn;
}

function createDisabledButton(text) {
  const btn = document.createElement("span");
  btn.className = "detail-action-btn detail-action-btn--disabled";
  btn.textContent = text;
  return btn;
}
