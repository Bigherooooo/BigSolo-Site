// --- File: js/pages/series-detail/shared/listControls.js ---

import { qs } from "../../../utils/domUtils.js";

let currentSort = { type: "number", order: "desc" };
let currentSearch = "";

/**
 * Initialise les contrôles de recherche et de tri pour une liste.
 * @param {HTMLElement} viewContainer - Le conteneur principal de la vue.
 * @param {function} onUpdate - La fonction callback à appeler quand un filtre ou un tri change.
 */
export function initListControls(viewContainer, onUpdate) {
  console.log("[ListControls] Initialisation des contrôles.");
  const searchInput = qs('.search-chapter input[type="text"]', viewContainer);
  const sortBtn = qs("#sort-chapter-btn", viewContainer);

  if (!searchInput || !sortBtn) {
    console.warn("[ListControls] Éléments de recherche ou de tri non trouvés.");
    return;
  }

  currentSort = { type: "number", order: "desc" };
  currentSearch = "";
  searchInput.value = "";
  updateSortButtonUI(sortBtn);

  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    console.log(`[ListControls] Recherche mise à jour : "${currentSearch}"`);
    onUpdate({ sort: currentSort, search: currentSearch });
  });

  sortBtn.addEventListener("click", () => {
    if (currentSort.type === "number" && currentSort.order === "desc") {
      currentSort = { type: "number", order: "asc" };
    } else if (currentSort.type === "number" && currentSort.order === "asc") {
      currentSort = { type: "date", order: "desc" };
    } else if (currentSort.type === "date" && currentSort.order === "desc") {
      currentSort = { type: "date", order: "asc" };
    } else {
      currentSort = { type: "number", order: "desc" };
    }

    updateSortButtonUI(sortBtn);
    console.log("[ListControls] Tri mis à jour :", currentSort);
    onUpdate({ sort: currentSort, search: currentSearch });
  });
}

/**
 * Met à jour l'icône et le texte du bouton de tri en fonction de l'état actuel.
 * @param {HTMLElement} btn - L'élément du bouton de tri.
 */
function updateSortButtonUI(btn) {
  let iconClass = "fas fa-sort";
  let text = "Trier";
  let title = "Trier par";

  if (currentSort.type === "date") {
    if (currentSort.order === "desc") {
      iconClass = "fas fa-calendar-day";
      text = "Date (récent)";
      title = "Trié par date de sortie (plus récent en premier)";
    } else {
      iconClass = "fas fa-calendar-day"; // On pourrait utiliser une icône `fa-arrow-up` mais simple c'est bien aussi
      text = "Date (ancien)";
      title = "Trié par date de sortie (plus ancien en premier)";
    }
  } else {
    // type 'number'
    if (currentSort.order === "desc") {
      iconClass = "fas fa-sort-numeric-down";
      text = "Numéro (décroissant)";
      title = "Trié par numéro (décroissant)";
    } else {
      iconClass = "fas fa-sort-numeric-up";
      text = "Numéro (croissant)";
      title = "Trié par numéro (croissant)";
    }
  }

  // On met à jour le contenu HTML et le titre pour l'accessibilité
  btn.innerHTML = `<i class="${iconClass}"></i><span class="sort-btn-text"> ${text}</span>`;
  btn.title = title;
}
