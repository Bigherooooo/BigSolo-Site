import { qs, qsa, slugify } from "../utils/domUtils.js";

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
    { text: "One-Shot", href: "#one-shot-section", id: "oneshots" },
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

  if (pageId === "seriesdetailpage" || pageId === "seriescoverspage") {
    const seriesSlug = getCurrentSeriesSlugFromPath();
    if (seriesSlug) {
      if (pageId === "seriescoverspage") {
        baseLinks = [
          {
            text: "Retour à la Série",
            href: `/${seriesSlug}`,
            id: "back-to-series",
          },
        ];
      } else if (pageId === "seriesdetailpage") {
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
              text: "Couvertures",
              href: `/${seriesSlug}/cover`,
              id: "series-covers-gallery",
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
  const mobileSubNavContainer = qs("#mobile-nav-sub");
  const mobileSubNavTitleElement = qs("#mobile-sub-nav-title");
  const mobileSubNavSection = qs("#mobile-sub-nav-section");

  const currentPageId = getCurrentPageId();

  renderNavLinks(mobileMainNavContainer, mainNavLinksConfig, true);

  const subLinksForCurrentPage = getSubNavLinksForPage(currentPageId);
  if (subLinksForCurrentPage.length > 0) {
    renderNavLinks(mobileSubNavContainer, subLinksForCurrentPage, true);
    if (mobileSubNavTitleElement) {
      mobileSubNavTitleElement.textContent =
        subNavTitlesConfig[currentPageId] || "Navigation rapide";
      mobileSubNavTitleElement.style.display = "block";
    }
    if (mobileSubNavSection) mobileSubNavSection.style.display = "block";
  } else {
    if (mobileSubNavTitleElement)
      mobileSubNavTitleElement.style.display = "none";
    if (mobileSubNavContainer) mobileSubNavContainer.innerHTML = "";
    if (mobileSubNavSection) mobileSubNavSection.style.display = "none";
  }
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

  function openMobileMenu() {
    if (mobileMenuOverlayContainer) {
      populateMobileNavigation();
      updateActiveNavLinks();
      mobileMenuOverlayContainer.classList.add("open");
      document.body.classList.add("mobile-menu-open");
    }
    if (hamburgerBtn) hamburgerBtn.setAttribute("aria-expanded", "true");
  }

  function closeMobileMenu() {
    if (mobileMenuOverlayContainer)
      mobileMenuOverlayContainer.classList.remove("open");
    if (hamburgerBtn) hamburgerBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("mobile-menu-open");
  }

  if (hamburgerBtn && mobileMenuOverlayContainer) {
    hamburgerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (mobileMenuOverlayContainer.classList.contains("open")) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });

    mobileMenuOverlayContainer.addEventListener("click", (e) => {
      if (e.target === mobileMenuOverlayContainer) closeMobileMenu();
    });

    mobileMenuOverlayContainer.addEventListener("click", (e) => {
      if (e.target.closest(".close-mobile-menu-btn")) {
        closeMobileMenu();
      } else if (e.target.closest("a")) {
        setTimeout(closeMobileMenu, 150);
      }
    });
  }
}

export function initHeader() {
  setupThemeToggle();
  populateDesktopNavigation();
  initAnchorLinks();
  document.body.addEventListener("routeChanged", () => {
    console.log(
      "Header a détecté un changement de route. Mise à jour de la navigation..."
    );
    updateAllNavigation();
  });
}

export { setupMobileMenuInteractions };