// js/pages/galerie.js
import { fetchData } from "../utils/fetchUtils.js";
import {
  parseDateToTimestamp,
  formatDateForGallery,
} from "../utils/dateUtils.js";
import {
  initLazyLoadObserver,
  initMainScrollObserver,
} from "../components/observer.js";
import { qs, qsa } from "../utils/domUtils.js";

// --- VARIABLES GLOBALES DU MODULE ---
let allColosData = [];
let authorsInfoData = {};
let selectedArtistIds = new Set();
let currentSortMode = "date-desc";
let masonryInstance = null; // On stocke l'instance de Masonry

// --- SÉLECTEURS DOM ---
const galleryGridContainer = qs("#gallery-grid-container");
const totalCountSpan = qs("#colo-total-count");
const customFilter = qs("#custom-artist-filter");
const filterToggleBtn = customFilter
  ? qs(".custom-dropdown-toggle", customFilter)
  : null;
const filterMenu = customFilter
  ? qs(".custom-dropdown-menu", customFilter)
  : null;
const filterText = customFilter
  ? qs("#custom-filter-text", customFilter)
  : null;
const lightboxModal = qs("#lightbox-modal");
const lightboxImg = qs("#lightbox-img");
const lightboxCloseBtn = qs(".lightbox-close");

// --- FONCTIONS DE RENDU ---

function renderColoCard(colo, author) {
  const authorName = author?.username || "Artiste inconnu";
  const previewUrl = `https://cdn.imgchest.com/files/${colo.preview}.webp`;

  return `
    <div class="colo-card" data-colo-id="${colo.id}"> 
      <img class="lazy-load-gallery" 
           src="/img/placeholder_preview.png" 
           alt="Colorisation Chap. ${colo.chapitre || "N/A"} par ${authorName}" 
           data-src="${previewUrl}"> 
      <div class="colo-card-overlay">
        <p>Chap. ${colo.chapitre || "N/A"}${colo.page ? `, Page ${colo.page}` : ""}</p>
        <p>Par ${authorName}</p>
      </div>
    </div>`;
}

function setRandomBannerImage(colos) {
  if (!colos || colos.length === 0) {
    console.warn(
      "[Galerie] Aucune image disponible pour définir la bannière aléatoire."
    );
    return;
  }
  const randomColo = colos[Math.floor(Math.random() * colos.length)];
  const imageUrl = `https://cdn.imgchest.com/files/${randomColo.preview}.webp`;
  const gallerySection = qs(".gallery-section");
  if (gallerySection) {
    gallerySection.style.setProperty(
      "--random-banner-image",
      `url('${imageUrl}')`
    );
  }
}

/**
 * Met à jour la hauteur de l'overlay de fond pour qu'il corresponde à la hauteur de la grille.
 */
function updateBodyBeforeHeight() {
  const gridContainer = qs("#gallery-grid-container");
  const bodyBefore = document.body; // En JS, on cible le body pour manipuler son pseudo-élément

  if (gridContainer && bodyBefore) {
    // On ajoute la position du haut de la grille à sa hauteur pour obtenir la hauteur totale
    const totalHeight =
      gridContainer.offsetTop + gridContainer.offsetHeight + 260;

    // On crée ou met à jour une balise <style> dans le <head> pour appliquer la hauteur
    let styleTag = document.getElementById("dynamic-body-before-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-body-before-style";
      document.head.appendChild(styleTag);
    }

    // On s'assure que la hauteur est au moins celle de la fenêtre visible
    const finalHeight = Math.max(totalHeight, window.innerHeight);

    styleTag.textContent = `
      body.lightbox-is-open::before {
        height: ${finalHeight}px !important;
      }
    `;
    console.log(
      `[Galerie] Hauteur de l'overlay mise à jour à ${finalHeight}px.`
    );
  }
}

// --- LOGIQUE LIGHTBOX ---

function renderSocialLinks(links, type) {
  if (!links || Object.values(links).every((val) => !val)) return "";

  const socialPlatforms = {
    twitter: { icon: "fab fa-twitter", name: "Twitter" },
    instagram: { icon: "fab fa-instagram", name: "Instagram" },
    tiktok: { icon: "fab fa-tiktok", name: "TikTok" },
    reddit: { icon: "fab fa-reddit", name: "Reddit" },
  };

  let html = "";
  for (const [platform, url] of Object.entries(links)) {
    if (url && socialPlatforms[platform]) {
      const { icon, name } = socialPlatforms[platform];
      const linkText = type === "colo" ? ` ${name}` : "";
      html += `
        <a href="${url}" class="social-link" target="_blank" rel="noopener noreferrer" title="${name}">
          <i class="${icon}"></i>${linkText}
        </a>`;
    }
  }
  return html;
}

function displayLightboxInfo(colo, author) {
  const desktopPanel = qs(".lightbox-info-panel-desktop");
  const mobilePanel = qs(".lightbox-info-panel-mobile");
  if (mobilePanel) mobilePanel.style.display = "none";

  if (!desktopPanel) return;

  let panelContent = "<p>Informations non disponibles.</p>";

  if (colo && author) {
    const occurrenceCount = allColosData.filter(
      (c) => String(c.author_id) === String(colo.author_id)
    ).length;
    const artistLinks = {
      twitter: author.twitter,
      tiktok: author.tiktok,
      reddit: author.reddit,
      instagram: author.instagram,
    };
    const artistSocialsHtml = renderSocialLinks(artistLinks, "artist");
    const coloLinks = {
      twitter: colo.twitter,
      tiktok: colo.tiktok,
      reddit: colo.reddit,
      instagram: colo.instagram,
    };
    const coloSocialsHtml = renderSocialLinks(coloLinks, "colo");
    const coloDetailsHtml = `
      <div class="colo-details">
        <div class="detail-line">
          <span class="detail-label">Ch.</span>&nbsp;
          <span class="detail-value">${colo.chapitre || "N/A"}</span>&nbsp;
          ${
            colo.page
              ? `<span class="detail-label">Page</span>&nbsp;<span class="detail-value">${colo.page}</span>`
              : ""
          }
        </div>
        <div class="detail-line">
          <span class="detail-label">Date :</span>&nbsp;
          <span class="detail-value">${formatDateForGallery(colo.date)}</span>
        </div>
      </div>
    `;

    panelContent = `
      <div class="info-artist-section">
        <div class="artist-header">
          <img class="artist-pfp" src="${
            author.profile_img || "/img/profil.png"
          }" alt="Profil de ${author.username}" loading="lazy">
          <div class="artist-details">
            <h3 class="artist-name">${author.username}</h3>
            <p class="artist-colo-count">${occurrenceCount} colo${
              occurrenceCount > 1 ? "s" : ""
            } sur le site</p>
          </div>
        </div>
        ${
          artistSocialsHtml
            ? `<div class="artist-socials">${artistSocialsHtml}</div>`
            : ""
        }
      </div>
      <hr class="info-separator">
      <div class="info-colo-section">
        ${coloDetailsHtml}
        ${
          coloSocialsHtml
            ? `<div class="source-links">${coloSocialsHtml}</div>`
            : ""
        }
      </div>
    `;
  }

  desktopPanel.innerHTML = panelContent;
}

function openLightboxForId(coloId) {
  if (!coloId) return;
  const selectedColo = allColosData.find(
    (c) => c.id.toString() === coloId.toString()
  );
  if (selectedColo && lightboxModal && lightboxImg) {
    lightboxImg.src = `https://cdn.imgchest.com/files/${selectedColo.file}.webp`;
    const author = authorsInfoData[selectedColo.author_id];
    displayLightboxInfo(selectedColo, author);
    lightboxModal.style.display = "flex";

    updateBodyBeforeHeight();
    document.body.classList.add("lightbox-is-open");

    history.replaceState({ coloId: coloId }, "", `/galerie/${coloId}`);
  }
}

function closeLightbox() {
  if (lightboxModal) lightboxModal.style.display = "none";
  if (lightboxImg) lightboxImg.src = "";
  document.body.classList.remove("lightbox-is-open");
  if (
    window.location.pathname !== "/galerie" &&
    window.location.pathname !== "/galerie/"
  ) {
    history.replaceState(null, "", "/galerie");
  }
}

// --- LOGIQUE FILTRE & AFFICHAGE ---

function updateFilterText() {
  if (!filterText) return;
  if (selectedArtistIds.size === 0) {
    filterText.textContent = "Tous les artistes";
  } else if (selectedArtistIds.size === 1) {
    const artistId = selectedArtistIds.values().next().value;
    filterText.textContent =
      authorsInfoData[artistId]?.username || "1 artiste sélectionné";
  } else {
    filterText.textContent = `${selectedArtistIds.size} artistes sélectionnés`;
  }
}

function populateCustomArtistFilter() {
  if (!filterMenu) return;
  const artistCounts = allColosData.reduce((acc, colo) => {
    acc[colo.author_id] = (acc[colo.author_id] || 0) + 1;
    return acc;
  }, {});
  const sortedAuthors = Object.entries(authorsInfoData).sort(([, a], [, b]) =>
    (a.username || "").localeCompare(b.username || "")
  );
  filterMenu.innerHTML = sortedAuthors
    .map(([id, author]) => {
      const count = artistCounts[id] || 0;
      if (count === 0) return "";
      return `
      <div class="custom-dropdown-option" role="option">
        <input type="checkbox" value="${id}" id="artist-filter-${id}">
        <label for="artist-filter-${id}">
          <img src="${
            author.profile_img || "/img/profil.png"
          }" class="artist-pfp" alt="Profil de ${
            author.username
          }" loading="lazy">
          <span class="artist-name">${author.username}</span>
          <span class="artist-count">${count}</span>
        </label>
      </div>`;
    })
    .join("");
  qsa('input[type="checkbox"]', filterMenu).forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const artistId = e.target.value;
      if (e.target.checked) selectedArtistIds.add(artistId);
      else selectedArtistIds.delete(artistId);
      updateFilterText();
      displayColos();
    });
  });
}

function displayColos() {
  if (
    !galleryGridContainer ||
    !allColosData.length ||
    !Object.keys(authorsInfoData).length
  ) {
    if (galleryGridContainer)
      galleryGridContainer.innerHTML = "<p>Aucune colorisation à afficher.</p>";
    return;
  }
  let colosToDisplay = [...allColosData];
  if (selectedArtistIds.size > 0) {
    colosToDisplay = colosToDisplay.filter((c) =>
      selectedArtistIds.has(String(c.author_id))
    );
  }
  switch (currentSortMode) {
    case "date-desc":
      colosToDisplay.sort(
        (a, b) => parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date)
      );
      break;
    case "date-asc":
      colosToDisplay.sort(
        (a, b) => parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date)
      );
      break;
    case "chapter-desc":
      colosToDisplay.sort(
        (a, b) => (parseFloat(b.chapitre) || 0) - (parseFloat(a.chapitre) || 0)
      );
      break;
    case "chapter-asc":
      colosToDisplay.sort(
        (a, b) => (parseFloat(a.chapitre) || 0) - (parseFloat(b.chapitre) || 0)
      );
      break;
  }
  galleryGridContainer.innerHTML = colosToDisplay
    .map((colo) => {
      const author = authorsInfoData[colo.author_id];
      return renderColoCard(colo, author);
    })
    .join("");
  galleryGridContainer.classList.remove("is-ready");
  qsa(".colo-card", galleryGridContainer).forEach((card) => {
    if (!card.dataset.lightboxListenerAttached) {
      card.addEventListener("click", () =>
        openLightboxForId(card.dataset.coloId)
      );
      card.dataset.lightboxListenerAttached = "true";
    }
  });

  masonryInstance = new Masonry(galleryGridContainer, {
    itemSelector: ".colo-card",
    columnWidth: ".colo-card",
    percentPosition: true,
    gutter: 8,
    transitionDuration: 0,
  });

  imagesLoaded(galleryGridContainer).on("always", () => {
    masonryInstance.layout();
    updateBodyBeforeHeight();
  });

  initLazyLoadObserver("img.lazy-load-gallery", masonryInstance);

  setTimeout(() => {
    galleryGridContainer.classList.add("is-ready");
  }, 100);
}

function getSortModeText(mode) {
  const texts = {
    "date-desc": "Date (récent)",
    "date-asc": "Date (ancien)",
    "chapter-desc": "Chapitre (décroissant)",
    "chapter-asc": "Chapitre (croissant)",
  };
  return texts[mode] || "Date (récent)";
}

function updateSortMode(newMode) {
  if (
    ["date-desc", "date-asc", "chapter-desc", "chapter-asc"].includes(newMode)
  ) {
    currentSortMode = newMode;
    const sortText = qs("#custom-sort-text");
    if (sortText) sortText.textContent = getSortModeText(newMode);
    qsa("#custom-sort-filter .custom-dropdown-option").forEach((option) => {
      option.classList.toggle("active", option.dataset.sort === newMode);
    });
    displayColos();
  }
}

// --- FONCTION D'INITIALISATION ---
export async function initGaleriePage() {
  if (!galleryGridContainer) {
    console.warn(
      "[Galerie] Initialisation annulée: conteneur de la galerie non trouvé."
    );
    return;
  }
  try {
    const [colos, authors] = await Promise.all([
      fetchData("/data/colos/colos.json", { noCache: true }),
      fetchData("/data/colos/author_info.json", { noCache: true }),
    ]);
    if (!colos || !authors)
      throw new Error("Données de colos ou d'auteurs manquantes.");
    allColosData = colos;
    authorsInfoData = authors;
    setRandomBannerImage(allColosData);
    if (totalCountSpan) totalCountSpan.textContent = `(${allColosData.length})`;

    const sortFilter = qs("#custom-sort-filter");
    const sortToggleBtn = sortFilter
      ? qs(".custom-dropdown-toggle", sortFilter)
      : null;
    const sortMenu = sortFilter
      ? qs(".custom-dropdown-menu", sortFilter)
      : null;

    if (sortToggleBtn && sortMenu) {
      sortToggleBtn.addEventListener("click", () => {
        const isExpanded =
          sortToggleBtn.getAttribute("aria-expanded") === "true";
        sortToggleBtn.setAttribute("aria-expanded", !isExpanded);
        sortMenu.classList.toggle("show");
      });
      qsa(".custom-dropdown-option", sortMenu).forEach((option) => {
        option.addEventListener("click", () => {
          updateSortMode(option.dataset.sort);
          sortToggleBtn.setAttribute("aria-expanded", "false");
          sortMenu.classList.remove("show");
        });
      });
      document.addEventListener("click", (e) => {
        if (sortFilter && !sortFilter.contains(e.target)) {
          sortToggleBtn.setAttribute("aria-expanded", "false");
          sortMenu.classList.remove("show");
        }
      });
    }

    updateSortMode(currentSortMode);
    populateCustomArtistFilter();

    if (filterToggleBtn && filterMenu) {
      filterToggleBtn.addEventListener("click", () => {
        const isExpanded =
          filterToggleBtn.getAttribute("aria-expanded") === "true";
        filterToggleBtn.setAttribute("aria-expanded", !isExpanded);
        filterMenu.classList.toggle("show");
      });
      document.addEventListener("click", (e) => {
        if (customFilter && !customFilter.contains(e.target)) {
          filterToggleBtn.setAttribute("aria-expanded", "false");
          filterMenu.classList.remove("show");
        }
      });
    }

    if (lightboxModal && lightboxCloseBtn) {
      // Écouteur sur le bouton X, toujours utile
      lightboxCloseBtn.addEventListener("click", closeLightbox);

      // - Debut modification (Logique de fermeture de la lightbox réécrite et fiabilisée)
      lightboxModal.addEventListener("click", (e) => {
        // On vérifie si l'élément cliqué (e.target) n'est PAS l'un des éléments de contenu "protégés"
        // ou un enfant de ces éléments.
        const clickedOnContent = e.target.closest(
          ".lightbox-image-container, .lightbox-info-panel"
        );

        // Si clickedOnContent est null, cela signifie que le clic a eu lieu
        // en dehors des zones protégées (sur le fond ou dans les espaces vides).
        if (!clickedOnContent) {
          closeLightbox();
        }
      });
      // - Fin modification
    }

    window.addEventListener("popstate", () => {
      const path = window.location.pathname;
      const galleryPathMatch = path.match(/^\/galerie\/(\d+)\/?$/);
      if (galleryPathMatch) openLightboxForId(galleryPathMatch[1]);
      else closeLightbox();
    });

    displayColos();

    const galleryPathMatch = window.location.pathname.match(
      /^\/galerie\/(\d+)\/?$/
    );
    if (galleryPathMatch) {
      setTimeout(() => openLightboxForId(galleryPathMatch[1]), 100);
    }

    window.addEventListener("resize", updateBodyBeforeHeight);
  } catch (error) {
    console.error("Erreur d'initialisation de la galerie:", error);
    if (galleryGridContainer) {
      galleryGridContainer.innerHTML = `<p>Erreur lors du chargement de la galerie. Détails : ${error.message}</p>`;
    }
  }
}
