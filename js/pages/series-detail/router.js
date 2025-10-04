// --- File: js/pages/series-detail/router.js ---

import { slugify } from "../../utils/domUtils.js";

/**
 * Gère le routage et l'affichage de la fiche série en fonction de l'URL.
 * C'est le point d'entrée principal pour la page series-detail.
 * @param {object} seriesData - Les données complètes de la série.
 */
export async function handleRouteChange(seriesData) {
  const main = document.getElementById("series-detail-main");
  if (!main) {
    console.error(
      "[Router] Élément <main> #series-detail-main introuvable. Arrêt."
    );
    return;
  }

  // Ajoute le slug aux données de la série pour un accès facile
  if (!seriesData.slug) {
    seriesData.slug = slugify(seriesData.title);
  }

  const path = window.location.pathname;
  console.log(`[Router] Gestion de la route : ${path}`);

  // --- NOUVELLE LOGIQUE D'ANIMATION ---
  // 1. Démarrer l'animation de fondu de sortie
  main.classList.add("is-fading-out");

  // 2. Attendre la fin de l'animation avant de changer le contenu
  setTimeout(async () => {
    try {
      // Afficher un état de chargement pendant le fetch (sera invisible au début)
      main.innerHTML = '<p class="loading-message">Chargement de la vue...</p>';

      const isAnimeView = path.includes("/episodes");

      // 3. Charger le template HTML de base
      const response = await fetch("/templates/MangaList.html");
      if (!response.ok)
        throw new Error(
          "Impossible de charger le template de la page de détail."
        );
      const templateHtml = await response.text();
      main.innerHTML = templateHtml;

      if (isAnimeView) {
        const downloadActions = main.querySelector(".download-actions");
        if (downloadActions) {
          downloadActions.style.display = "none";
        }
      }

      // 4. Appeler le module de rendu approprié pour remplir le template
      if (isAnimeView) {
        console.log("[Router] Rendu de la vue Anime.");
        const { render: renderAnimeView } = await import("./AnimeView.js");
        await renderAnimeView(main, seriesData);
      } else {
        console.log("[Router] Rendu de la vue Manga.");
        const { render: renderMangaView } = await import("./MangaView.js");
        await renderMangaView(main, seriesData);
      }

      // 5. Gérer l'état des onglets
      const chaptersTab = main.querySelector(
        '.chapter-tab-btn[data-tab="chapters"]'
      );
      const episodesTab = main.querySelector(
        '.chapter-tab-btn[data-tab="episodes"]'
      );

      if (chaptersTab && episodesTab) {
        const hasAnime = seriesData.episodes && seriesData.episodes.length > 0;
        episodesTab.style.display = hasAnime ? "flex" : "none";

        chaptersTab.classList.toggle("active", !isAnimeView);
        episodesTab.classList.toggle("active", isAnimeView);

        chaptersTab.href = `/${seriesData.slug}`;
        episodesTab.href = `/${seriesData.slug}/episodes`;

        const sortBtn = main.querySelector(".sort-chapter-btn");
        if (sortBtn && isAnimeView) {
          sortBtn.parentElement.previousElementSibling.querySelector(
            "input"
          ).placeholder = "Rechercher un épisode...";
        }
      }

      // 6. Démarrer l'animation de fondu d'entrée
      main.classList.remove("is-fading-out");

      // 7. Envoyer un événement pour que le header mette à jour sa navigation
      document.body.dispatchEvent(
        new CustomEvent("routeChanged", { detail: { path } })
      );
    } catch (error) {
      console.error(
        "[Router] Erreur critique lors du rendu de la vue :",
        error
      );
      main.innerHTML = `<p class="loading-message">Erreur : ${error.message}</p>`;
      main.classList.remove("is-fading-out");
    }
  }, 250); // Doit correspondre à la durée de la transition CSS
}
