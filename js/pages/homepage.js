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

// CORRECTION : La fonction est maintenant à la racine du module
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

  let latestEpisodeButtonHtml = "";
  if (seriesData.episodes && seriesData.episodes.length > 0) {
    const latestEpisode = [...seriesData.episodes].sort(
      (a, b) => b.indice_ep - a.indice_ep
    )[0];
    if (latestEpisode) {
      latestEpisodeButtonHtml = `<a href="/${seriesSlug}/episodes/${latestEpisode.indice_ep}" class="hero-cta-button-anime">Dernier Épisode</a>`;
    }
  }

  const backgroundImageUrl = seriesData.cover || "/img/placeholder_preview.png";
  const characterImageUrl = `/img/reco/${jsonFilename.replace(
    ".json",
    ".png"
  )}`;
  const description = seriesData.description
    ? seriesData.description.replace(/"/g, "&quot;")
    : "Aucune description.";

  const typeTag = seriesData.os
    ? `<span class="tag" style="background-color: rgba(${heroColorRgb}, 0.25); border-color: rgba(${heroColorRgb}, 0.5); color: ${heroColor};">One-Shot</span>`
    : `<span class="tag" style="background-color: rgba(${heroColorRgb}, 0.25); border-color: rgba(${heroColorRgb}, 0.5); color: ${heroColor};">Série</span>`;

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
            <p class="hero-description">${description}</p>
          </div>
          <div class="hero-actions">
            <a href="/${seriesSlug}" class="hero-cta-button">Découvrir la série</a>
            ${latestEpisodeButtonHtml}
            ${
              latestChapter
                ? `
              <div class="hero-latest-info">
                Chapitre ${latestChapter.chapter}
                <span class="status">• ${
                  seriesData.release_status || "En cours"
                }</span>
              </div>
            `
                : ""
            }
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
      autoPlayInterval = setInterval(next, 5000);
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
          ? `/${seriesSlug}/${String(chapNum).replaceAll(".", "-")}`
          : null,
    }))
    .filter((chap) => chap.url)
    .sort((a, b) => b.last_updated_ts - a.last_updated_ts);

  let latestChapterAsButton = "",
    latestThreeChaptersHtml = "";
  if (chaptersArray.length > 0) {
    const latestChap = chaptersArray[0];
    const chapterTitleMobile = latestChap.title || "Titre inconnu";
    const truncatedTitleMobile = truncateText(chapterTitleMobile, 25);

    latestChapterAsButton = `
      <div class="series-latest-chapters-container-mobile">
        <a href="${latestChap.url}" class="series-chapter-item">
          <div class="series-chapter-item-main-info-mobile">
            <span class="chapter-number-small">Ch. ${latestChap.chapter}</span>
            <span class="chapter-title-small" title="${chapterTitleMobile}">${truncatedTitleMobile}</span>
          </div>
          <span class="chapter-date-small-mobile">${timeAgo(
            latestChap.last_updated_ts
          )}</span>
        </a>
      </div>`;

    latestThreeChaptersHtml = `
      <div class="series-latest-chapters-container-desktop">
        ${chaptersArray
          .slice(0, 3)
          .map((chap) => {
            const chapterTitleDesktop = chap.title || "Titre inconnu";
            const truncatedTitleDesktop = truncateText(chapterTitleDesktop, 30);
            return `
            <a href="${chap.url}" class="series-chapter-item-desktop">
              <span class="chapter-number-desktop">Ch. ${chap.chapter}</span>
              <span class="chapter-title-desktop" title="${chapterTitleDesktop}">${truncatedTitleDesktop}</span>
              <span class="chapter-date-desktop">${timeAgo(
                chap.last_updated_ts
              )}</span>
            </a>`;
          })
          .join("")}
      </div>`;
  }

  const descriptionHtml = series.description
    ? `<div class="series-description">${series.description}</div>`
    : "";
  let authorString = "";
  if (series.author && series.artist && series.author !== series.artist)
    authorString = `<strong>Auteur :</strong> ${series.author} / <strong>Dess. :</strong> ${series.artist}`;
  else if (series.author)
    authorString = `<strong>Auteur :</strong> ${series.author}`;
  else if (series.artist)
    authorString = `<strong>Dess. :</strong> ${series.artist}`;
  let yearString = series.release_year
    ? `<strong>Année :</strong> ${series.release_year}`
    : "";
  let authorYearLineHtml =
    authorString || yearString
      ? `<div class="meta series-author-year-line">${
          authorString
            ? `<span class="series-author-info">${authorString}</span>`
            : ""
        }${
          authorString && yearString
            ? `<span class="meta-separator-card"></span>`
            : ""
        }${
          yearString
            ? `<span class="series-year-info">${yearString}</span>`
            : ""
        }</div>`
      : "";
  let tagsHtml =
    Array.isArray(series.tags) && series.tags.length > 0
      ? `<div class="tags series-tags">${series.tags
          .map((t) => `<span class="tag">${t}</span>`)
          .join("")}</div>`
      : "";
  const detailPageUrl = `/${seriesSlug}`;
  const imageUrl = series.cover
    ? series.cover.includes("comick.pictures")
      ? `${series.cover.slice(0, -4)}-s.jpg`
      : series.cover
    : "img/placeholder_preview.png";
  return `<div class="series-card" data-url="${detailPageUrl}"><div class="series-cover"><img src="${imageUrl}" alt="${series.title} – Cover" loading="lazy"></div><div class="series-info"><div class="series-title">${series.title}</div>${authorYearLineHtml}${tagsHtml}${descriptionHtml}${latestChapterAsButton}${latestThreeChaptersHtml}</div></div>`;
}

function makeSeriesCardsClickable() {
  qsa(".series-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (
        e.target.closest(".series-chapter-item, .series-chapter-item-desktop")
      )
        return;
      const url = card.dataset.url;
      if (url) window.location.href = url;
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
        seriesGridOneShot.innerHTML = "<p>Aucun one-shot.</p>";
      return;
    }
    if (seriesGridOngoing) {
      const onGoingSeries = allSeries.filter((s) => s && !s.os);
      seriesGridOngoing.innerHTML =
        onGoingSeries.length > 0
          ? onGoingSeries.map(renderSeriesCard).join("")
          : "<p>Aucune série en cours.</p>";
      qsa(".series-card .series-tags", seriesGridOngoing).forEach((c) =>
        limitVisibleTags(c, 3, "plusN")
      );
    }
    if (seriesGridOneShot) {
      const oneShots = allSeries.filter((s) => s && s.os);
      seriesGridOneShot.innerHTML =
        oneShots.length > 0
          ? oneShots.map(renderSeriesCard).join("")
          : "<p>Aucun one-shot.</p>";
      qsa(".series-card .series-tags", seriesGridOneShot).forEach((c) =>
        limitVisibleTags(c, 3, "plusN")
      );
    }
    makeSeriesCardsClickable();
  } catch (error) {
    console.error(
      "🚨 Erreur lors de l'initialisation des grilles de séries:",
      error
    );
    if (seriesGridOngoing)
      seriesGridOngoing.innerHTML = "<p>Erreur chargement séries.</p>";
    if (seriesGridOneShot)
      seriesGridOneShot.innerHTML = "<p>Erreur chargement one-shots.</p>";
  }
}
