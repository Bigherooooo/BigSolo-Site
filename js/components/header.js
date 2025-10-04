import { qs, qsa, slugify } from "../utils/domUtils.js";
import { fetchAllSeriesData } from "../utils/fetchUtils.js";

const mainNavLinksConfig = [
  { text: "Accueil", href: "/", icon: "fas fa-home", id: "home" },
  {
    text: "Colorisations",
    href: "/galerie",
    icon: "fa-solid fa-palette",
    id: "gallery",
  },
  { text: "À propos", href: "/presentation", icon: "fas fa-user", id: "about" },
];

const subNavTitlesConfig = {
  homepage: "Sur cette page",
  seriesdetailpage: "Navigation série",
  seriescoverspage: "Navigation série",
};

const subNavLinksConfig = {
  homepage: [
    { text: "À la une", href: "#hero-section", id: "hero" },
    { text: "Séries", href: "#on-going-section", id: "series" },
    { text: "One-shot", href: "#one-shot-section", id: "oneshots" },
  ],
  galeriepage: [],
  presentationpage: [],
  seriesdetailpage: [],
  seriescoverspage: [],
};

function updateAllNavigation() {
  populateDesktopNavigation();
  populateMobileNavigation(); // Assure la cohérence si le menu mobile est ouvert pendant la navigation
  updateActiveNavLinks();
}

function getCurrentPageId() {
  return document.body.id || null;
}

function getCurrentSeriesSlugFromPath() {
  const path = window.location.pathname;
  const segments = path.split("/").filter(Boolean);
  if (segments.length > 0) {
    return segments[0];
  }
  return null;
}

function getCurrentSeriesViewFromPath() {
  const path = window.location.pathname;
  if (path.includes("/episodes")) {
    return "anime";
  }
  return "manga";
}

function renderNavLinks(container, links, isMobile = false) {
  if (!container) return;
  container.innerHTML = "";

  links.forEach((link) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = link.href;
    if (link.id) {
      a.id = `navlink-${link.id}${isMobile ? "-mobile" : "-desktop"}`;
    }

    if (link.icon) {
      const i = document.createElement("i");
      i.className = link.icon;
      a.appendChild(i);
      a.appendChild(document.createTextNode(" "));
    }
    a.appendChild(document.createTextNode(link.text));
    li.appendChild(a);
    container.appendChild(li);
  });
}

function getSubNavLinksForPage(pageId) {
  let baseLinks = [...(subNavLinksConfig[pageId] || [])];

  if (pageId === "seriesdetailpage") {
    const seriesSlug = getCurrentSeriesSlugFromPath();
    if (seriesSlug) {
      const currentView = getCurrentSeriesViewFromPath();

      if (currentView === "anime") {
        baseLinks = [
          {
            text: "Informations",
            href: `#series-detail-section`,
            id: "series-info",
          },
          {
            text: "Épisodes",
            href: `#chapters-list-section`,
            id: "series-episodes",
          },
        ];
      } else {
        baseLinks = [
          {
            text: "Informations",
            href: `#series-detail-section`,
            id: "series-info",
          },
          {
            text: "Chapitres",
            href: `#chapters-list-section`,
            id: "series-chapters",
          },
        ];
      }
    }
  }
  return baseLinks;
}

function populateDesktopNavigation() {
  const mainNavContainer = qs("#desktop-nav-main");
  const subNavContainer = qs("#desktop-nav-sub");
  const separator = qs("#nav-separator");
  const currentPageId = getCurrentPageId();

  renderNavLinks(mainNavContainer, mainNavLinksConfig, false);

  const subLinksForCurrentPage = getSubNavLinksForPage(currentPageId);
  renderNavLinks(subNavContainer, subLinksForCurrentPage, false);

  if (mainNavContainer && subNavContainer && separator) {
    if (
      mainNavContainer.children.length > 0 &&
      subNavContainer.children.length > 0
    ) {
      separator.style.display = "inline-block";
    } else {
      separator.style.display = "none";
    }
  }
}

function populateMobileNavigation() {
  const mobileMainNavContainer = qs("#mobile-nav-main");
  if (!mobileMainNavContainer) return;

  mobileMainNavContainer.innerHTML = ""; // Vider le conteneur
  const currentPageId = getCurrentPageId();
  const subLinksForCurrentPage = getSubNavLinksForPage(currentPageId);

  mainNavLinksConfig.forEach((link) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = link.href;
    a.innerHTML = `<i class="${link.icon}"></i> ${link.text}`;
    li.appendChild(a);

    // Vérifier si ce lien correspond à la page actuelle
    const isCurrentPageLink =
      (link.href === "/" && window.location.pathname === "/") ||
      (link.href !== "/" && window.location.pathname.startsWith(link.href));

    if (isCurrentPageLink) {
      li.classList.add("active-parent-link");

      // Si c'est la page active ET qu'il y a des sous-liens, on les imbrique
      if (subLinksForCurrentPage.length > 0) {
        const subUl = document.createElement("ul");
        subUl.className = "mobile-sub-nav";
        subLinksForCurrentPage.forEach((subLink) => {
          const subLi = document.createElement("li");
          const subA = document.createElement("a");
          subA.href = subLink.href;
          subA.textContent = subLink.text;
          subLi.appendChild(subA);
          subUl.appendChild(subLi);
        });
        li.appendChild(subUl);
      }
    }
    mobileMainNavContainer.appendChild(li);
  });
}

function updateThemeToggleIcon() {
  const toggleBtn = qs("#theme-toggle");
  if (toggleBtn) {
    const icon = toggleBtn.querySelector("i");
    if (icon && window.themeUtils) {
      icon.className =
        window.themeUtils.getCurrentTheme() === "dark"
          ? "fas fa-sun"
          : "fas fa-moon";
    }
  }
}

function setupThemeToggle() {
  const toggleBtn = qs("#theme-toggle");
  if (toggleBtn && window.themeUtils) {
    updateThemeToggleIcon();
    toggleBtn.addEventListener("click", () => {
      window.themeUtils.toggleTheme();
      updateThemeToggleIcon();
    });
  } else if (toggleBtn) {
    console.warn(
      "themeUtils non trouvé, le bouton de thème ne sera pas fonctionnel."
    );
  }
}

function handleAnchorLinkClick(e, linkElement) {
  const href = linkElement.getAttribute("href");
  if (!href.startsWith("#")) return;

  const targetId = href.substring(1);
  const targetElement = document.getElementById(targetId);

  if (targetElement) {
    e.preventDefault();
    const headerHeight = qs("#main-header")?.offsetHeight || 60;
    const elementPosition = targetElement.getBoundingClientRect().top;
    const offsetPosition =
      elementPosition + window.pageYOffset - headerHeight - 20;

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });

    if (history.pushState) {
      history.pushState(null, null, href);
    } else {
      window.location.hash = href;
    }
  }
}

function initAnchorLinks() {
  document.addEventListener("click", function (e) {
    const linkElement = e.target.closest("a");
    if (linkElement && linkElement.getAttribute("href")?.startsWith("#")) {
      handleAnchorLinkClick(e, linkElement);
    }
  });

  window.addEventListener("load", () => {
    if (window.location.hash) {
      const targetElement = document.getElementById(
        window.location.hash.substring(1)
      );
      if (targetElement) {
        setTimeout(() => {
          const headerHeight = qs("#main-header")?.offsetHeight || 60;
          const elementPosition = targetElement.getBoundingClientRect().top;
          const offsetPosition =
            elementPosition + window.pageYOffset - headerHeight - 20;
          window.scrollTo({ top: offsetPosition, behavior: "auto" });
        }, 100);
      }
    }
  });
}

function updateActiveNavLinks() {
  // Normalise un chemin : supprime ".html", et transforme "/index.html" en "/"
  const normalizePath = (p) =>
    p.replace(/\/index\.html$/, "/").replace(/\.html$/, "");

  const currentPath = normalizePath(window.location.pathname);
  const navLinks = qsa("#desktop-nav-main a, #mobile-nav-main a");

  navLinks.forEach((a) => {
    const linkHref = a.getAttribute("href");
    if (linkHref) {
      const linkPath = normalizePath(linkHref);
      // La page d'accueil ('/') est active même si on est sur une sous-page qui n'a pas son propre bouton de nav
      if (linkPath === "/" && currentPath === "/") {
        a.classList.add("active-nav-link");
      } else if (linkPath !== "/" && currentPath.startsWith(linkPath)) {
        a.classList.add("active-nav-link");
      } else {
        a.classList.remove("active-nav-link");
      }
    }
  });
}

function setupMobileMenuInteractions() {
  const hamburgerBtn = qs(".hamburger-menu-btn");
  const mobileMenuOverlayContainer = qs("#main-mobile-menu-overlay");
  if (!hamburgerBtn || !mobileMenuOverlayContainer) return;

  let savedScrollY = 0;

  const openMobileMenu = () => {
    // 1. Sauvegarder la position de scroll actuelle de la page
    savedScrollY = window.scrollY;

    populateMobileNavigation();

    // 2. Positionner dynamiquement l'overlay (en position: absolute)
    // pour qu'il commence en haut de la fenêtre visible actuelle
    mobileMenuOverlayContainer.style.top = `${savedScrollY}px`;
    mobileMenuOverlayContainer.classList.add("open");

    // 3. Bloquer le scroll du body
    document.body.classList.add("mobile-menu-is-open");

    hamburgerBtn.setAttribute("aria-expanded", "true");
  };

  const closeMobileMenu = () => {
    mobileMenuOverlayContainer.classList.remove("open");

    // 4. Restaurer le scroll du body
    document.body.classList.remove("mobile-menu-is-open");

    hamburgerBtn.setAttribute("aria-expanded", "false");
  };

  // Clic sur le hamburger pour ouvrir/fermer
  hamburgerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mobileMenuOverlayContainer.classList.contains("open")) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  // Clic sur l'overlay (le fond) pour fermer
  mobileMenuOverlayContainer.addEventListener("click", (e) => {
    // On ferme uniquement si le clic est sur l'overlay lui-même
    // et non sur le contenu du menu qui est à l'intérieur.
    if (e.target === mobileMenuOverlayContainer) {
      closeMobileMenu();
    }
  });

  // Clic sur un lien à l'intérieur du menu pour fermer (après un court délai)
  const menuContent = qs(".mobile-menu-content", mobileMenuOverlayContainer);
  if (menuContent) {
    menuContent.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        setTimeout(closeMobileMenu, 150);
      }
    });
  }
}

/**
 * Initialise et gère le panneau d'historique.
 */
function initHistoryPanel() {
  const toggleBtn = qs("#history-toggle");
  const panel = qs("#history-panel");
  const closeBtn = qs("#history-close-btn");
  const content = qs("#history-content");

  if (!toggleBtn || !panel || !closeBtn || !content) return;

  const showPanel = async () => {
    panel.style.display = "flex";
    await populateHistoryPanel();
    setTimeout(() => panel.classList.add("visible"), 10);
  };

  const hidePanel = () => {
    panel.classList.remove("visible");
    setTimeout(() => {
      panel.style.display = "none";
      content.innerHTML = '<p class="history-empty">Chargement...</p>';
    }, 200);
  };

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.classList.contains("visible")) {
      hidePanel();
    } else {
      showPanel();
    }
  });

  closeBtn.addEventListener("click", hidePanel);

  document.addEventListener("click", (e) => {
    if (
      panel.classList.contains("visible") &&
      !panel.contains(e.target) &&
      !toggleBtn.contains(e.target)
    ) {
      hidePanel();
    }
  });
}

/**
 * Récupère les données et remplit le panneau d'historique.
 */
async function populateHistoryPanel() {
  const content = qs("#history-content");
  content.innerHTML = '<p class="history-empty">Chargement...</p>';

  try {
    const allSeries = await fetchAllSeriesData();
    const historyData = {};

    // 1. Scanner le localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith("reading-progress-")) {
        const slug = key.replace("reading-progress-", "");
        if (!historyData[slug]) historyData[slug] = {};
        historyData[slug].progress = localStorage.getItem(key);
      } else if (key.startsWith("series-rating-")) {
        const slug = key.replace("series-rating-", "");
        if (!historyData[slug]) historyData[slug] = {};
        historyData[slug].rating = localStorage.getItem(key);
      }
    }

    if (Object.keys(historyData).length === 0) {
      content.innerHTML =
        '<p class="history-empty">Votre historique est vide.</p>';
      return;
    }

    // 2. Enrichir les données
    const enrichedHistory = Object.entries(historyData)
      .map(([slug, data]) => {
        const series = allSeries.find((s) => slugify(s.title) === slug);
        if (!series) return null;

        // - Debut modification
        const chapterKeys = Object.keys(series.chapters || {}).filter(
          (k) => series.chapters[k]?.groups?.Big_herooooo
        );
        const totalChapters =
          chapterKeys.length > 0
            ? Math.max(...chapterKeys.map((k) => parseFloat(k)))
            : 0;
        // - Fin modification

        return {
          slug,
          title: series.title,
          cover: series.cover_low || series.cover_hq,
          progress: data.progress ? parseFloat(data.progress) : null,
          rating: data.rating ? parseFloat(data.rating) : null,
          totalChapters: totalChapters,
          os: series.os, // On ajoute la propriété 'os'
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.title.localeCompare(b.title)); // Tri alphabétique

    if (enrichedHistory.length === 0) {
      content.innerHTML =
        '<p class="history-empty">Votre historique est vide.</p>';
      return;
    }

    // 3. Générer le HTML
    content.innerHTML = enrichedHistory.map(renderHistoryCard).join("");
  } catch (error) {
    console.error("Erreur lors de la construction de l'historique:", error);
    content.innerHTML = '<p class="history-empty">Erreur de chargement.</p>';
  }
}

/**
 * Génère le HTML pour une carte d'historique.
 * @param {object} item - Un objet d'historique enrichi.
 * @returns {string} Le HTML de la carte.
 */
function renderHistoryCard(item) {
  let detailsHtml = "";
  let ratingHtml = "";

  // 1. Construit le HTML pour la note si elle existe
  if (item.rating) {
    ratingHtml = `
      <span class="history-card-rating">
        <i class="fas fa-star"></i>
        <span>${item.rating}/10</span>
      </span>
    `;
  }

  // 2. Construit le HTML pour la section sous le titre (progression ou rien)
  if (item.os) {
    // Si c'est un one-shot, toujours afficher la barre de progression pleine
    detailsHtml = `
      <div class="history-progress">
        <div class="history-progress-bar">
          <div class="history-progress-bar-inner" style="width: 100%;"></div>
        </div>
        <span class="history-progress-text">One-shot (1/1)</span>
      </div>
    `;
  } else if (item.progress && item.totalChapters > 0) {
    // Si ce n'est pas un one-shot, afficher la progression normale
    const progressPercent = Math.min(
      (item.progress / item.totalChapters) * 100,
      100
    );
    detailsHtml = `
      <div class="history-progress">
        <div class="history-progress-bar">
          <div class="history-progress-bar-inner" style="width: ${progressPercent}%;"></div>
        </div>
        <span class="history-progress-text">Ch. ${item.progress} / ${item.totalChapters}</span>
      </div>
    `;
  }
  // Si ni one-shot ni progression, detailsHtml reste une chaîne vide, ce qui est correct.

  // 3. Assemble la carte finale avec la nouvelle structure
  return `
    <a href="/${item.slug}" class="history-card">
      <img src="${
        item.cover || "/img/placeholder_preview.png"
      }" class="history-card-cover" alt="Couverture de ${
    item.title
  }" loading="lazy">
      <div class="history-card-info">
        <div class="history-card-title-line">
            <span class="history-card-title">${item.title}</span>
            ${ratingHtml}
        </div>
        ${detailsHtml}
      </div>
    </a>
  `;
}

export function initHeader() {
  setupThemeToggle();
  populateDesktopNavigation();
  initAnchorLinks();
  initHistoryPanel(); // Ajout de l'initialisation du panneau d'historique
  document.body.addEventListener("routeChanged", () => {
    console.log(
      "Header a détecté un changement de route. Mise à jour de la navigation..."
    );
    updateAllNavigation();
  });
}

export { setupMobileMenuInteractions };
