// js/pages/series-detail/MangaReader/state.js

// L'état global du lecteur, exporté pour être modifiable par les autres modules.
export let state = {
  seriesData: null,
  currentChapter: null,
  allChapterKeys: [],
  pages: [],
  spreads: [],
  pageToSpreadMap: [],
  currentSpreadIndex: 0,
  chapterStats: { likes: 0, comments: [] }, // AJOUT : Pour stocker les stats du chapitre actuel
  settings: {
    mode: "webtoon",
    fit: "width",
    direction: "ltr",
    doublePageOffset: false,
    stretchSmallPages: false,
    limitWidth: true,
    limitHeight: false,
    customMaxWidth: 1200,
    customMaxHeight: 1080,
    sidebarCollapsed: false, // <-- AJOUTÉ : Par défaut, la sidebar n'est pas réduite
  },
};

// Les références aux éléments du DOM, centralisées ici.
export const dom = {};

// Les éléments <img> des pages, pour le préchargement et l'affichage.
export let domImages = [];

// Fonction pour mettre à jour la liste des images
export function setDomImages(images) {
  domImages = images;
}
