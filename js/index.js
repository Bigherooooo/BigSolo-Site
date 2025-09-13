// --- File: js/index.js ---

import { loadComponent, qs } from "./utils/domUtils.js";
import {
  initHeader,
  setupMobileMenuInteractions,
} from "./components/header.js";
import { initMainScrollObserver } from "./components/observer.js";

async function initCommonComponents() {
  const headerPlaceholder = qs("#main-header");
  const mobileMenuPlaceholder = qs("#main-mobile-menu-overlay");
  const loadPromises = [];

  if (headerPlaceholder) {
    loadPromises.push(
      loadComponent(headerPlaceholder, "/includes/header.html")
    );
  } else {
    console.warn("Placeholder #main-header not found. Cannot load header.");
  }

  if (mobileMenuPlaceholder) {
    loadPromises.push(
      loadComponent(mobileMenuPlaceholder, "/includes/mobile-menu.html")
    );
  } else {
    console.warn(
      "Placeholder #main-mobile-menu-overlay not found. Cannot load mobile menu."
    );
  }

  if (loadPromises.length > 0) {
    try {
      await Promise.all(loadPromises);
      console.log("Common components (header/menu) loaded.");
    } catch (error) {
      console.error("Error loading one or more common components:", error);
    }
  }

  if (headerPlaceholder && headerPlaceholder.innerHTML.trim() !== "") {
    try {
      initHeader();
    } catch (e) {
      console.error("Error initializing header:", e);
    }
  }

  if (mobileMenuPlaceholder && mobileMenuPlaceholder.innerHTML.trim() !== "") {
    if (typeof setupMobileMenuInteractions === "function") {
      try {
        setupMobileMenuInteractions();
      } catch (e) {
        console.error("Error setting up mobile menu interactions:", e);
      }
    } else {
      console.error(
        "setupMobileMenuInteractions is not available or was not loaded correctly."
      );
    }
  }
}

function getSeriesData() {
  const dataElement = document.getElementById("series-data-placeholder");
  if (
    dataElement &&
    dataElement.textContent.trim() !== "<!-- SERIES_DATA_PLACEHOLDER -->"
  ) {
    try {
      return JSON.parse(dataElement.textContent);
    } catch (e) {
      console.error("Erreur lors du parsing des données JSON de la série.", e);
      return null;
    }
  }
  return null;
}

/**
 * Gère la navigation interne pour la SPA sur la page de détail.
 * @param {Event} event - L'événement de clic.
 * @param {object} seriesData - Les données de la série.
 */
function handleInternalNavigation(event, seriesData) {
  if (event.target.closest(".chapter-card-list-likes")) {
    return;
  }

  const link = event.target.closest("a, .chapter-tab-btn");
  if (!link) return;

  const isReaderLink =
    link.classList.contains("chapter-card-list-item") ||
    link.classList.contains("detail-action-btn");
  if (isReaderLink) {
    console.log(
      "[Index] Clic sur un lien de lecture, rechargement de page autorisé."
    );
    return;
  }

  if (link.classList.contains("chapter-tab-btn")) {
    event.preventDefault();
    if (!link.classList.contains("active")) {
      history.pushState({}, "", link.href);
      console.log("[Index] Navigation SPA (onglet) vers :", link.href);
      import("./pages/series-detail/router.js").then(
        ({ handleRouteChange }) => {
          handleRouteChange(seriesData);
        }
      );
    }
    return;
  }

  const isInternal =
    link.href.startsWith(window.location.origin) &&
    !link.hasAttribute("target");
  if (isInternal) {
    console.log(
      "[Index] Clic sur un autre lien interne, rechargement autorisé:",
      link.href
    );
  }
}

async function routeAndInitPage() {
  const path = window.location.pathname;
  const bodyId = document.body.id;
  console.log(`[Index] Routing for path: "${path}", bodyId: "${bodyId}"`);

  // Si on est sur la nouvelle page admin, on ne fait rien ici.
  // Le script /js/admin/main.js gère tout.
  if (bodyId === "admin-page") {
    console.log("[Index] Page admin détectée, le routeur principal l'ignore.");
    return;
  }

  switch (bodyId) {
    case "homepage":
      console.log("[Index] Initializing homepage.");
      const { initHomepage } = await import("./pages/homepage.js");
      await initHomepage();
      initMainScrollObserver();
      break;

    case "galeriepage":
      console.log("[Index] Initializing galerie page.");
      const { initGaleriePage } = await import("./pages/galerie.js");
      await initGaleriePage();
      initMainScrollObserver();
      break;

    case "presentationpage":
      console.log("[Index] Initializing presentation page.");
      const { initPresentationPage } = await import("./pages/presentation.js");
      initPresentationPage();
      initMainScrollObserver();
      break;

    case "seriescoverspage":
      console.log("[Index] Initializing series covers page.");
      const { initSeriesCoversPage } = await import("./pages/series-covers.js");
      await initSeriesCoversPage();
      initMainScrollObserver();
      break;

    case "seriesdetailpage":
      console.log("[Index] Initializing series detail page (SPA routing).");
      const seriesData = getSeriesData();
      if (seriesData) {
        const { handleRouteChange } = await import(
          "./pages/series-detail/router.js"
        );
        handleRouteChange(seriesData);

        document.body.addEventListener("click", (e) =>
          handleInternalNavigation(e, seriesData)
        );
        window.addEventListener("popstate", () =>
          handleRouteChange(seriesData)
        );
      } else {
        const mainContainer = document.getElementById("series-detail-main");
        if (mainContainer) {
          mainContainer.innerHTML =
            "<p class='loading-message'>Erreur: Impossible de charger les informations de la série.</p>";
        }
      }
      break;

    case "readerpage":
      console.log("[Index] Initializing Manga Reader page.");
      const { initMangaReader } = await import(
        "./pages/series-detail/MangaReader/reader.js"
      );
      await initMangaReader();
      break;

    case "playerpage":
      console.log("[Index] Initializing Anime Player page.");
      const { initAnimePlayer } = await import(
        "./pages/series-detail/AnimePlayer/player.js"
      );
      await initAnimePlayer();
      break;

    default:
      console.log(
        `[Index] No specific JS logic for bodyId "${bodyId}" or route not recognized.`
      );
      initMainScrollObserver();
      break;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const bodyId = document.body.id;
  console.log("[Index] DOMContentLoaded event fired.");

  if ("scrollRestoration" in history) {
    if (bodyId !== "readerpage") {
      history.scrollRestoration = "manual";
      // On force la position en haut de la page au cas où le navigateur
      // aurait déjà tenté de restaurer le scroll avant l'exécution de ce script.
      window.scrollTo(0, 0);
      console.log(
        "[Scroll] Restauration du scroll désactivée pour cette page."
      );
    } else {
      // Pour le lecteur, on laisse le navigateur gérer (ou on le force en 'auto')
      history.scrollRestoration = "auto";
      console.log("[Scroll] Restauration du scroll activée pour le lecteur.");
    }
  }

  const isAdminPage = bodyId === "admin-page";

  try {
    if (!isAdminPage) {
      await initCommonComponents();
    }
    await routeAndInitPage();
    console.log("[Index] Page initialization complete.");
  } catch (error) {
    console.error("[Index] Error during page initialization process:", error);
  }
});
