// --- File: js/pages/series-detail/shared/itemNumberRenderer.js ---

/**
 * Génère le HTML pour l'affichage du numéro d'un item (chapitre, épisode...).
 * Gère les cas spécifiques comme les One-Shots et la présence de volumes.
 * @param {object} itemData - L'objet contenant les données de l'item (doit avoir .id et optionnellement .volume).
 * @returns {string} Le code HTML formaté.
 */
export function renderItemNumber(itemData, isOneShot = false) {
  // Sécurité : si les données sont invalides, on retourne une chaîne vide.
  if (!itemData || typeof itemData.id === "undefined") return "";

  if (isOneShot && itemData.id == 0) {
    return "One-shot";
  } else if (isOneShot) {
    return `One-shot ${itemData.id}`;
  }

  if (itemData.volume) {
    return `
      <span class="volume-prefix">Vol. ${itemData.volume}</span>
      <span class="chapter-prefix">Ch. ${itemData.id}</span>
    `;
  }

  return `Chapitre ${itemData.id}`;
}
