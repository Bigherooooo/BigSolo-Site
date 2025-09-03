// --- File: js/pages/series-detail/shared/infoRenderer.js ---

import { qs } from "../../../utils/domUtils.js";
import {
  getLocalSeriesRating,
  setLocalSeriesRating,
} from "../../../utils/interactions.js";

/**
 * Affiche l'ensemble des informations principales de la série (partie haute).
 * @param {HTMLElement} viewContainer - L'élément conteneur principal de la vue.
 * @param {object} seriesData - Les données complètes de la série.
 * @param {object} seriesStats - Les statistiques d'interaction de la série.
 * @param {'manga' | 'anime'} viewType - Le type de vue à rendre ('manga' ou 'anime').
 */
export function renderSeriesInfo(
  viewContainer,
  seriesData,
  seriesStats,
  viewType
) {
  console.log(
    `[InfoRenderer] Rendu des informations pour la vue : ${viewType}`
  );

  const animeData = seriesData.anime?.[0];

  renderBannerAndCover(viewContainer, seriesData, viewType);
  renderTitlesAndTags(viewContainer, seriesData, animeData, viewType);
  renderCreatorInfo(viewContainer, seriesData, animeData, viewType);
  renderDescription(viewContainer, seriesData, viewType);
  renderRatingComponent(viewContainer, seriesData, seriesStats);

  if (viewType === "anime") {
    renderOpEdButtons(viewContainer, animeData);
  }
}

// --- Fonctions de rendu spécifiques ---

function renderBannerAndCover(container, seriesData, viewType) {
  const banner = qs("#hero-banner-section", container);
  const coverImg = qs(".detail-cover", container);
  const seriesSlug = seriesData.slug;

  const mangaCoverUrl = seriesData.cover;
  let primaryCoverUrl;

  if (viewType === "anime") {
    primaryCoverUrl = `/img/anime/${seriesSlug}/cover.jpg`;
  } else {
    primaryCoverUrl = mangaCoverUrl;
  }

  if (banner) {
    banner.style.setProperty("--hero-banner-bg", `url('${primaryCoverUrl}')`);
  }
  if (coverImg) {
    coverImg.src = primaryCoverUrl;
    coverImg.alt = `Couverture de ${seriesData.title}`;

    if (viewType === "anime") {
      coverImg.onerror = () => {
        console.warn(
          `Image de couverture anime non trouvée à ${primaryCoverUrl}. Utilisation du fallback manga.`
        );
        coverImg.src = mangaCoverUrl;
        if (banner) {
          banner.style.setProperty(
            "--hero-banner-bg",
            `url('${mangaCoverUrl}')`
          );
        }
        coverImg.onerror = null;
      };
    } else {
      coverImg.onerror = null;
    }
  }
}

function renderTitlesAndTags(container, seriesData, animeData, viewType) {
  const data = viewType === "anime" ? animeData : seriesData;

  const jpTitleElem = qs(".detail-jp-title", container);
  if (jpTitleElem) jpTitleElem.textContent = seriesData.jp_title || "";

  const titleElem = qs(".detail-title", container);
  if (titleElem) titleElem.textContent = seriesData.title || "";

  const tagsDiv = qs(".detail-tags", container);
  if (tagsDiv) {
    tagsDiv.innerHTML = (data.tags || [])
      .map((tag) => `<span class="detail-tag">${tag}</span>`)
      .join("");
  }

  const statusElem = qs(".status-indicator", container);
  if (statusElem) {
    const statusText =
      (viewType === "anime"
        ? animeData?.status_an
        : seriesData.release_status) || "?";
    const isFinished = statusText.toLowerCase().includes("fini");
    let dateText =
      (viewType === "anime"
        ? animeData?.date_start_an
        : seriesData.release_year) || "";
    statusElem.innerHTML = `<span class="status-dot${
      isFinished ? " finished" : ""
    }"></span>${statusText} ${dateText ? `- ${dateText}` : ""}`;
  }

  const yearElem = qs(".release-year", container);
  if (yearElem) {
    yearElem.style.display = "none";
    const separator = qs(".year-separator", container);
    if (separator) separator.style.display = "none";
  }
}

function renderCreatorInfo(container, seriesData, animeData, viewType) {
  const metaElem = qs(".detail-meta.detail-creator-info", container);
  if (!metaElem) return;

  if (viewType === "anime") {
    const studio = animeData?.studios_an?.join(", ") || "?";
    metaElem.innerHTML = `Studio : ${studio}`;
  } else {
    if (
      seriesData.author &&
      seriesData.artist &&
      seriesData.author === seriesData.artist
    ) {
      metaElem.innerHTML = `Auteur & Artiste : ${seriesData.author}`;
    } else {
      metaElem.innerHTML = `Auteur : ${
        seriesData.author || "?"
      }<span class="creator-separator"></span>Dessinateur : ${
        seriesData.artist || "?"
      }`;
    }
  }
}

// - Debut modification (Fonction entièrement réécrite)
function renderDescription(container, seriesData, viewType) {
  const animeData = seriesData.anime?.[0];
  const descData = viewType === "anime" ? animeData : seriesData;

  const descElem = qs(".detail-description", container);
  if (descElem) {
    descElem.textContent =
      descData.description || "Aucune description disponible.";
  }

  const btnRow = qs(".series-see-more-row", container);
  const moreInfos = qs(".series-more-infos", container);

  // Si la vue est 'anime', on cache toute la section "plus d'infos" (bouton et contenu).
  if (viewType === "anime") {
    if (btnRow) btnRow.style.display = "none";
    if (moreInfos) moreInfos.style.display = "none";
  } else {
    // Si la vue est 'manga', on s'assure que le bouton est visible
    // et on se contente de remplir le contenu. L'accordéon JS/CSS gère le reste.
    if (btnRow) btnRow.style.display = "flex";
    if (moreInfos) {
      const altTitles = (seriesData.alternative_titles || []).join(", ");
      moreInfos.innerHTML = `
              <div><strong>Type :</strong> ${seriesData.manga_type || "?"}</div>
              <div><strong>Magazine :</strong> ${
                seriesData.magazine || "?"
              }</div>
              <div><strong>Titres alternatifs :</strong> ${
                altTitles || "—"
              }</div>
            `;
    }
  }
}
// - Fin modification

function renderOpEdButtons(container, animeData) {
  if (!animeData || (!animeData.op_an && !animeData.ed_an)) return;

  const actionsContainer = qs("#reading-actions-container", container);
  if (!actionsContainer) return;

  const opEdWrapper = document.createElement("div");
  opEdWrapper.className = "op-ed-buttons-wrapper";

  const createButton = (item, type, index) => {
    const btn = document.createElement("a");
    btn.href = item.youtube_url_op_an;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.className = "detail-action-btn op-ed-btn";
    btn.title = `${item.title_op_fr_an} - ${item.author_op_an}`;
    btn.innerHTML = `<i class="fab fa-youtube"></i> ${type} ${
      (animeData.op_an.length > 1 || animeData.ed_an.length > 1) && index > 0
        ? index + 1
        : ""
    }`;
    return btn;
  };

  (animeData.op_an || []).forEach((op, i) =>
    opEdWrapper.appendChild(createButton(op, "Opening", i))
  );
  (animeData.ed_an || []).forEach((ed, i) =>
    opEdWrapper.appendChild(createButton(ed, "Ending", i))
  );

  actionsContainer.appendChild(opEdWrapper);
}

function renderRatingComponent(container, seriesData, seriesStats) {
  const ratingContainer = qs("#series-rating-container", container);
  if (!ratingContainer) {
    console.warn("[InfoRenderer] Conteneur de notation introuvable.");
    return;
  }
  const seriesSlug = seriesData.slug;
  const serverRating = seriesStats?.stats?.ratings || { average: 0, count: 0 };
  const userRating = getLocalSeriesRating(seriesSlug);
  ratingContainer.innerHTML = `
        <button id="series-rating-btn" class="detail-action-btn detail-action-btn--rate" type="button" data-slug="${seriesSlug}">
            <i class="fa-solid fa-star rating-star"></i>
            <span class="series-rating-average">...</span>
        </button>
        <div id="series-rating-tooltip" class="series-rating-tooltip"></div>
        <div id="series-rating-menu" class="series-rating-menu">
            <ul>
                ${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
                  .map(
                    (score) =>
                      `<li data-score="${score}">(${score}) ${getRatingLabel(
                        score
                      )}</li>`
                  )
                  .join("")}
                <li data-score="remove" class="remove-rating">Retirer la note</li>
            </ul>
        </div>
    `;
  setupRatingComponentLogic(seriesSlug, serverRating, userRating);
}

function getRatingLabel(score) {
  const labels = {
    10: "Chef-d'œuvre",
    9: "Excellent",
    8: "Très bon",
    7: "Bon",
    6: "Correct",
    5: "Moyen",
    4: "Mauvais",
    3: "Très mauvais",
    2: "Horrible",
    1: "Affligeant",
  };
  return labels[score] || "";
}

function setupRatingComponentLogic(
  seriesSlug,
  serverRating,
  initialUserRating
) {
  const btn = qs("#series-rating-btn");
  const tooltip = qs("#series-rating-tooltip");
  const menu = qs("#series-rating-menu");
  const avgSpan = qs(".series-rating-average", btn);
  let currentServerRating = { ...serverRating };
  let currentUserRating = initialUserRating;
  function updateDisplay() {
    let totalVotes = currentServerRating.count || 0;
    let totalScore = (currentServerRating.average || 0) * totalVotes;
    if (currentUserRating !== null) {
      totalVotes++;
      totalScore += currentUserRating;
    }

    if (totalVotes === 0) {
      avgSpan.textContent = "—";
      tooltip.textContent = "Aucun vote";
    } else {
      const displayAvg = totalScore / totalVotes;
      avgSpan.textContent = (Math.round(displayAvg * 10) / 10).toLocaleString(
        "fr-FR",
        { minimumFractionDigits: 1, maximumFractionDigits: 1 }
      );
      tooltip.textContent = `${totalVotes} vote${totalVotes > 1 ? "s" : ""}`;
    }

    btn.classList.toggle("accent", currentUserRating !== null);
  }
  btn.addEventListener("mouseenter", (e) => {
    tooltip.classList.add("visible");
    positionTooltip(e);
  });
  btn.addEventListener("mousemove", positionTooltip);
  btn.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
  function positionTooltip(e) {
    const tRect = tooltip.getBoundingClientRect();
    let left = e.clientX + 16;
    let top = e.clientY - 18;
    if (left + tRect.width > window.innerWidth - 8)
      left = window.innerWidth - tRect.width - 8;
    if (top < 8) top = 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  let menuOpen = false;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.classList.toggle("visible", menuOpen);
    if (menuOpen) {
      const rect = btn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${rect.left}px`;
    }
  });
  document.addEventListener("click", (e) => {
    if (menuOpen && !menu.contains(e.target)) {
      menuOpen = false;
      menu.classList.remove("visible");
    }
  });
  menu.querySelectorAll("li[data-score]").forEach((li) => {
    li.addEventListener("click", () => {
      const scoreValue = li.dataset.score;
      if (scoreValue === "remove") {
        currentUserRating = null;
      } else {
        currentUserRating = parseInt(scoreValue, 10);
      }
      setLocalSeriesRating(seriesSlug, currentUserRating);
      updateDisplay();
      menuOpen = false;
      menu.classList.remove("visible");
    });
  });
  updateDisplay();
}
