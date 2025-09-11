// js/pages/homepage.js
import { fetchData, fetchAllSeriesData } from "../utils/fetchUtils.js";
import { slugify, qs, qsa, limitVisibleTags } from "../utils/domUtils.js";
import { parseDateToTimestamp, timeAgo } from "../utils/dateUtils.js";

/**
 * Convertit une couleur HEX en une chaîne de valeurs R, G, B.
 * @param {string} hex - La couleur au format #RRGGBB.
 * @returns {string} Une chaîne comme "255, 100, 50".
 */
function hexToRgb(hex) {
  let c = hex.substring(1).split("");
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  c = "0x" + c.join("");
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(",");
}

/**
 * Tronque un texte s'il dépasse une longueur maximale.
 * @param {string} text - Le texte à tronquer.
 * @param {number} maxLength - La longueur maximale.
 * @returns {string} Le texte tronqué ou original.
 */
function truncateText(text, maxLength) {
  if (typeof text !== "string") return "";
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text;
}

// --- LOGIQUE DU HERO CAROUSEL ---

function renderHeroSlide(series) {
  const seriesData = series.data;
  const jsonFilename = series.filename;
  const heroColor = series.color;
  const heroColorRgb = hexToRgb(heroColor);

  const seriesSlug = slugify(seriesData.title);

  const chaptersArray = Object.entries(seriesData.chapters)
    .map(([chapNum, chapData]) => ({ chapter: chapNum, ...chapData }))
    .filter((chap) => chap.groups && chap.groups.Big_herooooo)
    .sort(
      (a, b) =>
        parseFloat(String(b.chapter).replace(",", ".")) -
        parseFloat(String(a.chapter).replace(",", "."))
    );
  const latestChapter = chaptersArray.length > 0 ? chaptersArray[0] : null;

  // Boutons
  let latestEpisodeButtonHtml = "";
  if (seriesData.episodes && seriesData.episodes.length > 0) {
    const latestEpisode = [...seriesData.episodes].sort(
      (a, b) => b.indice_ep - a.indice_ep
    )[0];
    if (latestEpisode) {
      latestEpisodeButtonHtml = `<a href="/${seriesSlug}/episodes/${latestEpisode.indice_ep}" class="hero-cta-button-anime">Épisode ${latestEpisode.indice_ep}</a>`;
    }
  }
  let latestChapterButtonHtml = "";
  if (latestEpisodeButtonHtml) {
    latestChapterButtonHtml = `<a href="/${seriesSlug}/${String(latestChapter.chapter)}" class="hero-cta-button">Chapitre ${latestChapter.chapter}</a>`;
  }
  else if (latestChapter && latestChapter.chapter > 0) {
    latestChapterButtonHtml = `<a href="/${seriesSlug}/${String(latestChapter.chapter)}" class="hero-cta-button">Dernier chapitre (Ch. ${latestChapter.chapter})</a>`;
  } else if (latestChapter && latestChapter.chapter == 0) {
    latestChapterButtonHtml = `<a href="/${seriesSlug}" class="hero-cta-button">Lire le One-shot</a>`;
  }

  // Statut + pastille (desktop)
  let statusText = seriesData.release_status || "En cours";
  let statusDotClass = statusText.toLowerCase().includes("fini")
    ? "status-dot finished"
    : "status-dot";
  let statusHtml = `
    <span class="status">
      <span class="${statusDotClass}"></span>
      ${statusText}
    </span>
  `;

  // Bloc info desktop
  let latestInfoHtml = "";
  if (latestChapterButtonHtml || latestEpisodeButtonHtml) {
    latestInfoHtml = `
      <div class="hero-latest-info">
        ${latestChapterButtonHtml}
        ${latestEpisodeButtonHtml}
        ${statusHtml}
      </div>
    `;
  }

  // Bloc info mobile (statut sous tags, boutons en bas)
  let mobileStatusHtml = `
    <div class="hero-mobile-status">
      <span class="status">
        <span class="${statusDotClass}"></span>
        ${statusText}
      </span>
    </div>
  `;
  let mobileActionsHtml = `
    <div class="hero-mobile-actions">
      ${latestChapterButtonHtml}
      ${latestEpisodeButtonHtml}
    </div>
  `;

  const backgroundImageUrl = seriesData.cover || "/img/placeholder_preview.png";
  const characterImageUrl = `/img/reco/${jsonFilename.replace(
    ".json",
    ".png"
  )}`;
  const description = seriesData.description
    ? seriesData.description.replace(/"/g, "&quot;")
    : "Aucune description.";

  const typeTag = seriesData.os
    ? `<span class="tag" style="background-color: rgba(${heroColorRgb}, 0.25); border-color: rgba(${heroColorRgb}, 0.5); color: ${heroColor};">One-shot</span>`
    : "";

  return `
    <div class="hero-slide" style="--bg-image: url('${backgroundImageUrl}'); --hero-color: ${heroColor}; --hero-color-rgb: ${heroColorRgb};">
      <div class="hero-slide-content">
        <div class="hero-info">
          <div class="hero-info-top">
            <p class="recommended-title">Recommandé</p>
            <a href="/${seriesSlug}" class="hero-title-link">
              <h2 class="hero-series-title">${seriesData.title}</h2>
            </a>
            <div class="hero-tags">
              ${typeTag}
              ${(seriesData.tags || [])
                .slice(0, 4)
                .map((tag) => `<span class="tag">${tag}</span>`)
                .join("")}
            </div>
            <div class="hero-mobile-status mobile-only">
              ${mobileStatusHtml}
            </div>
            <p class="hero-description">${description}</p>
          </div>
          <div class="hero-actions">
            ${latestInfoHtml}
          </div>
          <div class="hero-mobile-actions mobile-only">
            ${mobileActionsHtml}
          </div>
        </div>
        <div class="hero-image">
          <img src="${characterImageUrl}" alt="${
    seriesData.title
  }" onerror="this.style.display='none'">
        </div>
      </div>
    </div>
  `;
}

async function initHeroCarousel() {
  const track = qs(".hero-carousel-track");
  const navContainer = qs(".hero-carousel-nav");
  const nextBtn = qs(".hero-carousel-arrow.next");
  const prevBtn = qs(".hero-carousel-arrow.prev");

  if (!track || !navContainer || !nextBtn || !prevBtn) return;

  try {
    const recommendedItems = await fetchData("/data/reco.json");
    if (!recommendedItems || recommendedItems.length === 0)
      throw new Error("reco.json est vide ou introuvable.");

    const seriesDataPromises = recommendedItems.map(async (item) => {
      const data = await fetchData(`/data/series/${item.file}`);
      return { data, filename: item.file, color: item.color };
    });
    const recommendedSeries = await Promise.all(seriesDataPromises);

    track.innerHTML = recommendedSeries.map(renderHeroSlide).join("");
    navContainer.innerHTML = recommendedSeries
      .map(
        (_, index) => `<div class="hero-nav-dot" data-index="${index}"></div>`
      )
      .join("");

    const slides = qsa(".hero-slide");
    const dots = qsa(".hero-nav-dot");
    if (slides.length <= 1) {
      nextBtn.style.display = "none";
      prevBtn.style.display = "none";
      navContainer.style.display = "none";
      if (slides.length === 1) slides[0].classList.add("active");
      return;
    }

    let currentIndex = 0;
    let autoPlayInterval = null;

    function goToSlide(index) {
      slides.forEach((slide) => slide.classList.remove("active"));
      dots.forEach((dot) => dot.classList.remove("active"));
      slides[index].classList.add("active");
      dots[index].classList.add("active");
    }

    function next() {
      currentIndex = (currentIndex + 1) % slides.length;
      goToSlide(currentIndex);
    }

    function prev() {
      currentIndex = (currentIndex - 1 + slides.length) % slides.length;
      goToSlide(currentIndex);
    }

    function startAutoPlay() {
      if (autoPlayInterval) clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(next, 7500);
    }

    function stopAutoPlay() {
      clearInterval(autoPlayInterval);
    }

    nextBtn.addEventListener("click", () => {
      next();
      stopAutoPlay();
      startAutoPlay();
    });
    prevBtn.addEventListener("click", () => {
      prev();
      stopAutoPlay();
      startAutoPlay();
    });
    navContainer.addEventListener("click", (e) => {
      const dot = e.target.closest(".hero-nav-dot");
      if (dot) {
        currentIndex = parseInt(dot.dataset.index);
        goToSlide(currentIndex);
        stopAutoPlay();
        startAutoPlay();
      }
    });

    qs(".hero-carousel").addEventListener("mouseenter", stopAutoPlay);
    qs(".hero-carousel").addEventListener("mouseleave", startAutoPlay);

    goToSlide(0);
    startAutoPlay();
  } catch (error) {
    console.error("Erreur lors de l'initialisation du hero carousel:", error);
    qs("#hero-section").innerHTML =
      '<p style="text-align: center; padding: 2rem;">Impossible de charger les recommandations.</p>';
  }
}

// --- LOGIQUE EXISTANTE POUR LES GRILLES DE SÉRIES ---

function renderSeriesCard(series) {
  if (!series || !series.chapters || !series.title || !series.cover) return "";

  const seriesSlug = slugify(series.title);

  const chaptersArray = Object.entries(series.chapters)
    .map(([chapNum, chapData]) => ({
      chapter: chapNum,
      ...chapData,
      last_updated_ts: parseDateToTimestamp(chapData.last_updated || 0),
      url:
        chapData.groups && chapData.groups.Big_herooooo !== ""
          ? `/${seriesSlug}/${String(chapNum)}`
          : null,
    }))
    .filter((chap) => chap.url)
    .sort((a, b) => b.last_updated_ts - a.last_updated_ts);

  const hasAnime = series.episodes && series.episodes.length > 0;
  const lastChapterUrl =
    chaptersArray.length > 0 ? chaptersArray[0].url : `/${seriesSlug}`;
  const lastChapterNum =
    chaptersArray.length > 0 ? chaptersArray[0].chapter : null;

  let lastEpisodeUrl = null;
  let lastEpisodeNum = null;
  if (hasAnime && series.episodes.length > 0) {
    const lastEpisode = [...series.episodes].sort(
      (a, b) => b.indice_ep - a.indice_ep
    )[0];
    if (lastEpisode) {
      lastEpisodeUrl = `/${seriesSlug}/episodes/${lastEpisode.indice_ep}`;
      lastEpisodeNum = lastEpisode.indice_ep;
    }
  }

  let tagsHtml =
    Array.isArray(series.tags) && series.tags.length > 0
      ? `<div class="series-tags">${series.tags
          .map((t) => `<span class="tag">${t}</span>`)
          .join("")}</div>`
      : "";

  const imageUrl = series.cover || "img/placeholder_preview.png";
  const description = series.description || "Pas de description disponible.";

  let actionsHtml = "";
  if (lastChapterNum && lastEpisodeNum) {
    actionsHtml = `<div class="series-actions">
      <a href="${lastChapterUrl}" class="series-action-btn">Ch. ${lastChapterNum}</a>
      <a href="${lastEpisodeUrl}" class="series-action-btn">Ép. ${lastEpisodeNum}</a>
    </div>`;
  } else if (lastChapterNum > 0) {
    actionsHtml = `<div class="series-actions">
      <a href="${lastChapterUrl}" class="series-action-btn">Dernier chapitre (Ch. ${lastChapterNum})</a>
    </div>`;
  } else if (lastEpisodeNum) {
    actionsHtml = `<div class="series-actions">
      <a href="${lastEpisodeUrl}" class="series-action-btn">Dernier épisode (Ép. ${lastEpisodeNum})</a>
    </div>`;
  } else if (lastChapterNum == 0) {
    actionsHtml = `<div class="series-actions">
      <a href="/${seriesSlug}" class="series-action-btn">Lire le One-shot</a>
    </div>`;
  }

  return `
    <div class="series-card" style="background-image: url('${imageUrl}');" data-url="/${seriesSlug}" data-description="${description.replace(
    /"/g,
    "&quot;"
  )}">
      <div class="series-content">
        <h3 class="series-title">${series.title}</h3>
        <div class="series-extra">
          ${tagsHtml}
          ${actionsHtml}
        </div>
      </div>
    </div>
  `;
}

function makeSeriesCardsClickable() {
  qsa(".series-card").forEach((card) => {
    card.addEventListener("mousedown", (e) => {
      if (e.button === 2) return;
      const actionButton = e.target.closest(".series-action-btn");
      e.preventDefault();
      card.addEventListener(
        "mouseup",
        (upEvent) => {
          if (upEvent.button !== e.button) return;
          let url;
          const finalTargetIsButton =
            upEvent.target.closest(".series-action-btn");
          if (finalTargetIsButton) {
            url = finalTargetIsButton.getAttribute("href");
          } else {
            // Sinon, on prend le data-url de la carte
            url = card.getAttribute("data-url");
          }
          if (!url) return;
          const openInNewTab = e.button === 1 || e.ctrlKey || e.metaKey;
          if (openInNewTab) {
            window.open(url, "_blank");
          } else {
            window.location.href = url;
          }
        },
        { once: true }
      );
    });
    card.querySelectorAll("a").forEach((link) => {
      link.addEventListener("dragstart", (e) => e.preventDefault());
    });
  });
}

function setupSeriesCardDescriptionTooltip() {
  let tooltip = document.querySelector(".series-tooltip-description");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "series-tooltip-description";
    document.body.appendChild(tooltip);
  }
  let showTimer = null;
  let activeCard = null;
  let lastMouseEvent = null;

  function showTooltip(card) {
    tooltip.textContent =
      card.dataset.description || "Pas de description disponible.";
    tooltip.classList.add("visible");
    if (lastMouseEvent) {
      positionTooltip(lastMouseEvent);
    }
  }

  function hideTooltip() {
    tooltip.classList.remove("visible");
    tooltip.textContent = "";
    activeCard = null;
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  }

  function positionTooltip(e) {
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = e.clientX + 24;
    let top = e.clientY;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) top = 8;
    if (top + tooltipRect.height > window.innerHeight - 8) {
      top = window.innerHeight - tooltipRect.height - 8;
    }
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  document.addEventListener("mousemove", (e) => {
    lastMouseEvent = e;
    if (activeCard && tooltip.classList.contains("visible")) {
      positionTooltip(e);
    }
  });

  qsa(".series-card").forEach((card) => {
    card.addEventListener("mouseenter", (e) => {
      lastMouseEvent = e;
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        activeCard = card;
        showTooltip(card);
      }, 600);
    });
    card.addEventListener("mousemove", (e) => {
      lastMouseEvent = e;
      if (e.target.closest(".series-action-btn")) {
        hideTooltip();
        return;
      }
      if (activeCard === card && tooltip.classList.contains("visible")) {
        positionTooltip(e);
      }
    });
    card.addEventListener("mouseleave", () => {
      hideTooltip();
    });
    card.addEventListener("mousedown", () => {
      hideTooltip();
    });
    card.querySelectorAll(".series-action-btn").forEach((btn) => {
      btn.addEventListener("mouseenter", hideTooltip);
      btn.addEventListener("mousemove", hideTooltip);
    });
  });
}

export async function initHomepage() {
  const seriesGridOngoing = qs(".series-grid.on-going");
  const seriesGridOneShot = qs(".series-grid.one-shot");

  await initHeroCarousel();

  try {
    const allSeries = await fetchAllSeriesData();
    if (!Array.isArray(allSeries) || allSeries.length === 0) {
      if (seriesGridOngoing)
        seriesGridOngoing.innerHTML = "<p>Aucune série en cours.</p>";
      if (seriesGridOneShot)
        seriesGridOneShot.innerHTML = "<p>Aucun One-shot.</p>";
      return;
    }

    if (seriesGridOngoing) {
      const onGoingSeries = allSeries.filter((s) => s && !s.os);
      seriesGridOngoing.innerHTML =
        onGoingSeries.length > 0
          ? onGoingSeries.map(renderSeriesCard).join("")
          : "<p>Aucune série en cours.</p>";
    }

    if (seriesGridOneShot) {
      const oneShots = allSeries.filter((s) => s && s.os);
      seriesGridOneShot.innerHTML =
        oneShots.length > 0
          ? oneShots.map(renderSeriesCard).join("")
          : "<p>Aucun One-shot.</p>";
    }

    makeSeriesCardsClickable();
    setupSeriesCardDescriptionTooltip();
  } catch (error) {
    console.error(
      "🚨 Erreur lors de l'initialisation des grilles de séries:",
      error
    );
    if (seriesGridOngoing)
      seriesGridOngoing.innerHTML = "<p>Erreur chargement séries.</p>";
    if (seriesGridOneShot)
      seriesGridOneShot.innerHTML = "<p>Erreur chargement One-shots.</p>";
  }
}
