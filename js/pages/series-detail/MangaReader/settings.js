// --- File: js/pages/series-detail/MangaReader/settings.js ---

import { state } from "./state.js";

// Configuration centralisée des options de paramètres.
export const settingsConfig = {
  mode: {
    options: [
      { value: "single", text: "Simple", icon: "fas fa-file" },
      { value: "double", text: "Double", icon: "fas fa-book-open" },
      { value: "webtoon", text: "Webtoon", icon: "fas fa-scroll" },
    ],
  },
  fit: {
    options: [
      { value: "height", text: "Hauteur", icon: "fas fa-arrows-alt-v" },
      { value: "width", text: "Largeur", icon: "fas fa-arrows-alt-h" },
      { value: "custom", text: "Personnalisé", icon: "fas fa-ruler-combined" },
    ],
  },
  direction: {
    options: [
      { value: "ltr", text: "Gauche à Droite" },
      { value: "rtl", text: "Droite à Gauche" },
    ],
  },
};

/**
 * Charge les paramètres de l'utilisateur depuis le localStorage.
 */
export function loadSettings() {
  const savedSettings = localStorage.getItem("bigsolo_reader_settings_v6");

  if (savedSettings) {
    // Cas 1 : L'utilisateur a déjà des préférences sauvegardées. On les charge.
    try {
      Object.assign(state.settings, JSON.parse(savedSettings));
      console.log(
        "Paramètres du lecteur chargés depuis le localStorage :",
        state.settings
      );
    } catch (e) {
      console.error(
        "Impossible de parser les paramètres sauvegardés. Utilisation des défauts.",
        e
      );
      // En cas d'erreur de parsing, on ne fait rien, les défauts de state.js seront utilisés.
    }
  } else {
    // Cas 2 : Nouvel utilisateur, aucun paramètre sauvegardé.
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // On applique les valeurs par défaut spécifiques au mobile.
      console.log(
        "Nouvel utilisateur sur mobile : application des paramètres par défaut pour mobile."
      );
      state.settings.mode = "webtoon";
      state.settings.fit = "height"; // Comme demandé
      // Les autres paramètres (direction, etc.) gardent leur valeur de state.js
    } else {
      // Pour le desktop, les valeurs par défaut sont déjà celles définies dans state.js.
      // On peut ajouter un log pour la clarté.
      console.log(
        "Nouvel utilisateur sur desktop : les paramètres par défaut de state.js sont utilisés."
      );
    }
  }
}

/**
 * Sauvegarde les paramètres actuels de l'utilisateur dans le localStorage.
 */
export function saveSettings() {
  try {
    localStorage.setItem(
      "bigsolo_reader_settings_v6",
      JSON.stringify(state.settings)
    );
  } catch (e) {
    console.error("Erreur lors de la sauvegarde des paramètres:", e);
  }
}
