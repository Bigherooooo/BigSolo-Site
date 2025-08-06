// js/components/observer.js
import { qs, qsa } from '../utils/domUtils.js';

let mainScrollObserverInstance; // Instance unique pour l'animation d'apparition
let galleryImageObserverInstance; // Instance unique pour le lazy load

/**
 * Initialise ou met à jour l'IntersectionObserver pour l'animation d'apparition générale.
 * Si l'observer n'existe pas, il est créé.
 * Si un sélecteur est fourni, seuls les nouveaux éléments correspondant à ce sélecteur sont ajoutés à l'observation.
 * Si aucun sélecteur n'est fourni, il essaie d'observer les éléments par défaut (ceux définis dans la liste).
 *
 * @param {string|null} [specificSelector=null] - Un sélecteur CSS pour les nouveaux éléments à observer.
 *                                                Si null, observe les éléments par défaut.
 */
export function initMainScrollObserver(specificSelector = null) {
  const defaultSelectors = ".chapter-card, .series-card, .section-title, .presentation-content, .profile-pic, .gallery-controls, .series-detail-container, .colo-card";

  const elementsToObserve = qsa(specificSelector || defaultSelectors);

  if (elementsToObserve.length === 0 && !specificSelector) {
    // console.warn("[Observer] Aucun élément par défaut trouvé à observer initialement.");
    return;
  }
  if (elementsToObserve.length === 0 && specificSelector) {
    // console.warn(`[Observer] Aucun élément trouvé pour le sélecteur spécifique: ${specificSelector}`);
    return;
  }

  // Crée l'instance de l'observer si elle n'existe pas
  if (!mainScrollObserverInstance) {
    // console.log("[Observer] Création de mainScrollObserverInstance.");
    mainScrollObserverInstance = new IntersectionObserver(
      (entries, observerInstance) => { // Renommé 'observer' en 'observerInstance' pour éviter conflit
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // console.log("[Observer] Element intersecting:", entry.target);
            entry.target.style.opacity = 1;
            // entry.target.style.transform = "translateY(0px)"; // Ou "none", "initial", "unset"
            observerInstance.unobserve(entry.target); // Arrêter d'observer une fois animé
          }
        });
      },
      { threshold: 0.1 }
    );
  }

  // Observer les éléments
  elementsToObserve.forEach((el) => {
    // S'assurer que les styles initiaux sont appliqués par CSS (opacity: 0, transform: translateY(20px))
    // On ne réapplique pas les styles ici pour éviter de forcer l'opacité à 0 sur des éléments déjà visibles.
    // Le CSS doit être la source de vérité pour l'état initial "caché".
    // console.log("[Observer] Observation de l'élément:", el);
    mainScrollObserverInstance.observe(el);
  });
}

/**
 * Initialise l'IntersectionObserver pour le lazy loading des images.
 * @param {string} selector - Le sélecteur pour les images lazy. Default 'img.lazy-load-gallery'
 */
export function initLazyLoadObserver(selector = 'img.lazy-load-gallery') {
  if (galleryImageObserverInstance) {
    // console.log("[LazyLoad] Déconnexion de l'ancien galleryImageObserverInstance.");
    galleryImageObserverInstance.disconnect(); // Nettoyer l'ancien pour éviter les observations multiples du même élément
  }

  const lazyImages = qsa(selector);
  if (!lazyImages.length) {
    // console.warn("[LazyLoad] Aucune image lazy à observer.");
    return;
  }
  // console.log(`[LazyLoad] Initialisation de l'observer pour ${lazyImages.length} images.`);

  const lazyLoadOptions = {
    rootMargin: '0px 0px 200px 0px',
    threshold: 0.01
  };

  galleryImageObserverInstance = new IntersectionObserver((entries, observerInstance) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (!src) {
          // console.warn("[LazyLoad] Image sans data-src:", img);
          observerInstance.unobserve(img); // Arrêter d'observer si pas de source
          return;
        }

        // console.log("[LazyLoad] Image intersecting, chargement de:", src);
        img.onload = () => {
          img.classList.add('image-loaded-fade-in');
          // console.log("[LazyLoad] Image chargée:", src);
        };
        img.onerror = () => {
          console.warn(`[LazyLoad] Échec du chargement de l'image: ${src}`);
          // img.src = 'img/placeholder_error.png'; // Optionnel: image d'erreur
        };
        img.src = src;
        img.removeAttribute('data-src');
        observerInstance.unobserve(img);
      }
    });
  }, lazyLoadOptions);

  lazyImages.forEach(img => {
    galleryImageObserverInstance.observe(img);
  });
}