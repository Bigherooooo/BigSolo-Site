// js/components/observer.js
import { qs, qsa } from "../utils/domUtils.js";

let mainScrollObserverInstance; // Instance unique pour l'animation d'apparition
let galleryImageObserverInstance; // Instance unique pour le lazy load

/**
 * Initialise ou met à jour l'IntersectionObserver pour l'animation d'apparition générale.
 * Si l'observer n'existe pas, il est créé.
 * Si un sélecteur est fourni, seuls les nouveaux éléments correspondant à ce sélecteur sont ajoutés à l'observation.
 * Si aucun sélecteur n'est fourni, il essaie d'observer les éléments par défaut.
 *
 * @param {string|null} [specificSelector=null] - Un sélecteur CSS pour les nouveaux éléments à observer.
 */
export function initMainScrollObserver(specificSelector = null) {
  const defaultSelectors =
    ".chapter-card, .series-card, .section-title, .presentation-content, .profile-pic, .gallery-controls, .series-detail-container, .colo-card";

  const elementsToObserve = qsa(specificSelector || defaultSelectors);

  if (elementsToObserve.length === 0 && !specificSelector) {
    return;
  }
  if (elementsToObserve.length === 0 && specificSelector) {
    return;
  }

  if (!mainScrollObserverInstance) {
    mainScrollObserverInstance = new IntersectionObserver(
      (entries, observerInstance) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0px)";
            observerInstance.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
  }

  elementsToObserve.forEach((el) => {
    mainScrollObserverInstance.observe(el);
  });
}

/**
 * Initialise l'IntersectionObserver pour le lazy loading des images.
 * @param {string} selector - Le sélecteur pour les images lazy.
 * @param {object|null} masonryInstance - Une instance de Masonry à mettre à jour après le chargement.
 */
export function initLazyLoadObserver(
  selector = "img.lazy-load-gallery",
  masonryInstance = null
) {
  if (galleryImageObserverInstance) {
    galleryImageObserverInstance.disconnect();
  }

  const lazyImages = qsa(selector);
  if (!lazyImages.length) {
    return;
  }

  const lazyLoadOptions = {
    rootMargin: "0px 0px 200px 0px",
    threshold: 0.01,
  };

  galleryImageObserverInstance = new IntersectionObserver(
    (entries, observerInstance) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const src = img.dataset.src;
          if (!src) {
            observerInstance.unobserve(img);
            return;
          }

          img.onload = () => {
            img.classList.add("image-loaded-fade-in");
            // C'est la correction clé : on dit à Masonry de se recalculer !
            if (masonryInstance) {
              masonryInstance.layout();
            }
          };
          img.onerror = () => {
            console.warn(`[LazyLoad] Échec du chargement de l'image: ${src}`);
          };
          img.src = src;
          img.removeAttribute("data-src");
          observerInstance.unobserve(img);
        }
      });
    },
    lazyLoadOptions
  );

  lazyImages.forEach((img) => {
    galleryImageObserverInstance.observe(img);
  });
}
