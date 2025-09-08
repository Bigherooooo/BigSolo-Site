// js/utils/domUtils.js

/**
 * Charge un composant HTML depuis une URL et l'insère dans un placeholder.
 * @param {HTMLElement} placeholder - L'élément où insérer le HTML.
 * @param {string} url - L'URL du fichier HTML à charger.
 */
export async function loadComponent(placeholder, url) {
  if (placeholder) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        placeholder.innerHTML = await response.text();
      } else {
        console.error(`Failed to load component ${url}:`, response.status);
        placeholder.innerHTML = `<p>Erreur de chargement du composant: ${url}.</p>`;
      }
    } catch (error) {
      console.error(`Error loading component ${url}:`, error);
      placeholder.innerHTML = `<p>Erreur de chargement du composant: ${url}.</p>`;
    }
  }
}

/**
 * Crée un slug à partir d'un texte.
 * @param {string} text - Le texte à slugifier.
 * @returns {string} Le slug.
 */
export function slugify(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

/**
 * Ajoute un badge "NOUVEAU" si la date est récente.
 * @param {string|number} dateInput - La date de publication.
 * @param {function} parseDateToTimestampFn - La fonction pour parser la date en timestamp.
 * @returns {string} Le HTML du badge ou une chaîne vide.
 */
export function maybeNewBadge(dateInput, parseDateToTimestampFn) {
  const timestamp = parseDateToTimestampFn(dateInput);
  if (isNaN(timestamp)) return "";
  // 3 jours en millisecondes
  return Date.now() - timestamp < 3 * 24 * 60 * 60 * 1000
    ? '<span class="new-badge">NOUVEAU</span>'
    : "";
}

/**
 * Helper pour querySelector
 * @param {string} selector
 * @param {Document|Element} [context=document]
 * @returns {Element|null}
 */
export function qs(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Helper pour querySelectorAll
 * @param {string} selector
 * @param {Document|Element} [context=document]
 * @returns {NodeListOf<Element>}
 */
export function qsa(selector, context = document) {
  return context.querySelectorAll(selector);
}

/**
 * Limite le nombre de tags visibles dans un conteneur et ajoute un tag "..." ou "+N" si nécessaire.
 * @param {HTMLElement} tagsContainer - L'élément conteneur des tags (ex: .series-tags).
 * @param {number} [maxVisibleTags=3] - Le nombre maximum de tags à afficher avant le tag "suite".
 * @param {string} [moreTagType="plusN"] - Type de tag "suite" : "ellipsis" pour "..." ou "plusN" pour "+N".
 */
export function limitVisibleTags(
  tagsContainer,
  maxVisibleTags = 3,
  moreTagType = "plusN"
) {
  if (!tagsContainer) return;

  // Sélectionne uniquement les tags qui ne sont PAS déjà un tag "more"
  const tags = Array.from(
    tagsContainer.querySelectorAll(".tag:not(.tag-more)")
  );

  // Supprimer un éventuel ancien tag "more" avant de recalculer
  const existingMoreTag = tagsContainer.querySelector(".tag.tag-more");
  if (existingMoreTag) {
    existingMoreTag.remove();
  }

  // Rendre tous les tags potentiellement visibles avant de décider lesquels cacher
  // (utile si cette fonction est appelée plusieurs fois avec des maxVisibleTags différents)
  tags.forEach((tag) => {
    tag.style.display = ""; // Réinitialise à la valeur par défaut (flex item, inline-block, etc.)
  });

  if (tags.length > maxVisibleTags) {
    // Cacher les tags excédentaires
    for (let i = maxVisibleTags; i < tags.length; i++) {
      tags[i].style.display = "none";
    }

    // Créer et ajouter le tag "suite"
    const moreTag = document.createElement("span");
    moreTag.classList.add("tag", "tag-more");

    if (moreTagType === "ellipsis") {
      moreTag.textContent = "...";
    } else {
      // Par défaut "plusN"
      const hiddenCount = tags.length - maxVisibleTags;
      moreTag.textContent = `+${hiddenCount}`;
      moreTag.title = `${hiddenCount} tag(s) supplémentaire(s)`;
    }

    tagsContainer.appendChild(moreTag);
  }
  // Pas besoin de 'else' pour remettre display='', car on l'a fait au début pour tous les tags réels.
}
