// js/pages/series-detail.js
import { slugify, qs } from "../utils/domUtils.js";
import { renderMangaView } from "./series-detail/mangaView.js";
import {
  renderEpisodesListView,
  renderEpisodePlayerView,
} from "./series-detail/animeView.js";

export async function initSeriesDetailPage() {
  const seriesDetailSection = qs("#series-detail-section");
  if (!seriesDetailSection) return;

  try {
    const dataPlaceholder = qs("#series-data-placeholder");
    if (
      !dataPlaceholder ||
      !dataPlaceholder.textContent ||
      dataPlaceholder.textContent.includes("SERIES_DATA_PLACEHOLDER")
    ) {
      throw new Error(
        "Les données de la série n'ont pas été injectées dans la page."
      );
    }
    const currentSeriesData = JSON.parse(dataPlaceholder.textContent);
    const seriesSlug = slugify(currentSeriesData.title);

    if (!currentSeriesData) {
      seriesDetailSection.innerHTML = `<p>Données de la série non valides.</p>`;
      document.title = `BigSolo – Série non trouvée`;
      return;
    }

    const initialPath = window.location.pathname;

    function handleRouting(path) {
      const segments = path.split("/").filter((p) => p !== "");
      let view = "manga";
      let subViewIdentifier = null;

      if (segments.length > 1) {
        if (segments[1] === "episodes") {
          view = "episodes_list";
          if (segments.length > 2) {
            view = "episode_player";
            subViewIdentifier = segments[2];
          }
        } else if (segments[1] !== "cover") {
          view = "chapter_redirect";
          subViewIdentifier = segments[1];
        }
      }

      switch (view) {
        case "manga":
          renderMangaView(currentSeriesData, seriesSlug);
          break;
        case "episodes_list":
          renderEpisodesListView(currentSeriesData, seriesSlug);
          break;
        case "episode_player":
          renderEpisodePlayerView(
            currentSeriesData,
            seriesSlug,
            subViewIdentifier
          );
          break;
        case "chapter_redirect":
          // Redirection gérée par le lecteur interne maintenant
          window.location.href = `/${seriesSlug}/${subViewIdentifier}`;
          break;
      }
      const routeChangeEvent = new CustomEvent("routeChanged", {
        detail: { path: path },
        bubbles: true,
        cancelable: true,
      });
      // Envoyer l'événement pour que d'autres parties du site (comme le header) puissent réagir
      document.body.dispatchEvent(routeChangeEvent);
    }

    // --- GESTION DES ÉVÉNEMENTS DE NAVIGATION ---
    seriesDetailSection.addEventListener("click", (e) => {
      const link = e.target.closest("a");
      if (!link) return;

      const href = link.getAttribute("href");
      // On ne gère que les liens internes qui ne commencent pas par #
      if (!href || href.startsWith("#") || link.target === "_blank") {
        return;
      }

      // Si le lien a une des classes gérées pour la navigation SPA
      const isSpaLink =
        link.classList.contains("detail-nav-button") ||
        link.classList.contains("player-episode-item") ||
        link.classList.contains("episode-nav-button") ||
        link.classList.contains("detail-episode-item");

      if (isSpaLink) {
        e.preventDefault();
        if (href !== window.location.pathname) {
          history.pushState({ path: href }, "", href);
          handleRouting(href);
          window.scrollTo(0, 0);
        }
      }
    });

    window.addEventListener("popstate", () => {
      handleRouting(window.location.pathname);
    });

    // --- CHARGEMENT INITIAL ---
    handleRouting(initialPath);
  } catch (error) {
    console.error(
      "🚨 Erreur lors de l'initialisation de la page de détail de série:",
      error
    );
    seriesDetailSection.innerHTML = `<p>Erreur lors du chargement des détails de la série. ${error.message}</p>`;
  }
}
