// --- File: js/pages/series-detail/shared/coverGallery.js ---

import { qs } from "../../../utils/domUtils.js";

/**
 * Initialise la galerie de couvertures en overlay.
 * @param {HTMLElement} viewContainer - Le conteneur de la vue actuelle (MangaView ou AnimeView).
 * @param {object} seriesData - Les données de la série.
 */
export function initCoverGallery(viewContainer, seriesData) {
  const trigger = qs(".detail-cover-wrapper", viewContainer);
  const overlay = qs("#cover-gallery-overlay");
  const lightbox = qs("#cover-lightbox");

  if (
    !seriesData?.covers_gallery?.length ||
    !trigger ||
    !overlay ||
    !lightbox
  ) {
    return;
  }

  trigger.classList.add("is-clickable");

  const closeBtn = qs(".cover-gallery-close", overlay);
  const gridContainer = qs(".cover-gallery-grid-container", overlay); // Ciblons le conteneur
  const grid = qs(".cover-gallery-grid", overlay);

  const openLightbox = (imageUrl) => {
    lightbox.innerHTML = `<img src="${imageUrl}" alt="Couverture agrandie">`;
    lightbox.classList.add("is-visible");
    if (!document.body.classList.contains("cover-gallery-open")) {
      document.body.classList.add("cover-gallery-open");
    }
  };

  const closeLightbox = () => {
    lightbox.classList.remove("is-visible");
    if (!overlay.classList.contains("is-open")) {
      document.body.classList.remove("cover-gallery-open");
    }
    lightbox.innerHTML = "";
  };

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  const openGallery = () => {
    const triggerWidth = trigger.offsetWidth;
    const triggerHeight = trigger.offsetHeight;

    grid.innerHTML = seriesData.covers_gallery
      .map(
        (cover) => `
          <div class="cover-gallery-item" style="width: ${triggerWidth}px; height: ${triggerHeight}px;" data-hq-src="${cover.url_hq}">
            <img src="${cover.url_lq}" alt="Couverture Volume ${cover.volume}" loading="lazy">
            <div class="cover-info-overlay">
              <span>Volume ${cover.volume}</span>
            </div>
          </div>
        `
      )
      .join("");

    grid.querySelectorAll(".cover-gallery-item").forEach((item) => {
      item.addEventListener("click", () => {
        const imageUrl = item.dataset.hqSrc;
        if (imageUrl) {
          openLightbox(imageUrl);
        }
      });
    });

    document.body.classList.add("cover-gallery-open");
    overlay.classList.add("is-open");
  };

  const closeGallery = () => {
    document.body.classList.remove("cover-gallery-open");
    overlay.classList.remove("is-open");
  };

  trigger.addEventListener("click", openGallery);
  closeBtn.addEventListener("click", closeGallery);

  // - Debut modification
  overlay.addEventListener("click", (e) => {
    // On ferme si la cible du clic est l'overlay lui-même OU le conteneur de la grille
    if (
      e.target.classList.contains("cover-gallery-overlay") ||
      e.target.classList.contains("cover-gallery-grid-container")
    ) {
      closeGallery();
    }
  });
  // - Fin modification

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (lightbox.classList.contains("is-visible")) {
        closeLightbox();
      } else if (overlay.classList.contains("is-open")) {
        closeGallery();
      }
    }
  });
}
