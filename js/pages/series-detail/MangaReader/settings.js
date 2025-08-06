// js/pages/series-detail/MangaReader/settings.js
import { qs, qsa, slugify } from "../../../utils/domUtils.js";
import { state, dom } from "./state.js";
import { render, renderViewer } from "./ui.js";
import { goToPage, goToSpread } from "./navigation.js";
import { calculateSpreads } from "./data.js";

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

export function saveSettings() {
  localStorage.setItem(
    "bigsolo_reader_settings_v5",
    JSON.stringify(state.settings)
  );
}

export function loadSettings() {
  const saved = localStorage.getItem("bigsolo_reader_settings_v5");
  if (saved) {
    try {
      Object.assign(state.settings, JSON.parse(saved));
    } catch (e) {
      console.error("Impossible de charger les paramètres du lecteur.", e);
    }
  }
}

export function cycleFitMode() {
  const modes = ["width", "height", "both", "original", "custom"];
  const current = modes.indexOf(state.settings.fit);
  const nextIndex = current >= modes.length - 1 ? 0 : current + 1;
  state.settings.fit = modes[nextIndex];
  saveSettings();
  render();
}

export function updateFitButton() {
  const btn = qs("#fit-mode-btn");
  if (!btn) return;
  const icons = {
    height: "fas fa-arrows-alt-v",
    width: "fas fa-arrows-alt-h",
    both: "fas fa-compress-arrows-alt",
    original: "fas fa-search",
  };
  const text = {
    height: "Hauteur",
    width: "Largeur",
    both: "Les Deux",
    original: "Originale",
  };
  const currentFit = state.settings.fit;
  if (currentFit === "custom")
    btn.innerHTML = `<i class="fas fa-ruler-combined"></i> Personnalisé`;
  else
    btn.innerHTML = `<i class="${icons[currentFit]}"></i> ${text[currentFit]}`;
}

export function updateSliderStates() {
  if (dom.customWidthSlider)
    dom.customWidthSlider.disabled = !state.settings.limitWidth;
  if (dom.customWidthInput)
    dom.customWidthInput.disabled = !state.settings.limitWidth;
  if (dom.customHeightSlider)
    dom.customHeightSlider.disabled = !state.settings.limitHeight;
  if (dom.customHeightInput)
    dom.customHeightInput.disabled = !state.settings.limitHeight;
}

export function setupDropdown(id) {
  const dropdown = qs(`#${id}`);
  if (!dropdown) return;
  const toggle = qs(".dropdown-toggle", dropdown);
  const menu = qs(".dropdown-menu", dropdown);
  if (!toggle || !menu) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = toggle.classList.contains("open");
    qsa(".custom-dropdown .dropdown-toggle.open").forEach((otherToggle) => {
      if (otherToggle !== toggle) {
        otherToggle.classList.remove("open");
        otherToggle.nextElementSibling?.classList.remove("open");
      }
    });
    toggle.classList.toggle("open", !wasOpen);
    menu.classList.toggle("open", !wasOpen);
  });

  // La logique de clic est maintenant gérée dans events.js pour une meilleure séparation
}

export function populateChapterSelect() {
  const menu = qs("#chapter-dropdown .dropdown-menu");
  const textSpan = qs("#chapter-dropdown .chapter-text");
  if (!menu || !textSpan) return;

  // MODIFICATION : Inclure le titre et tronquer
  const fullTitle = `Ch. ${state.currentChapter.number} : ${
    state.currentChapter.title || "Titre inconnu"
  }`;
  textSpan.textContent = truncateText(fullTitle, 28);

  menu.innerHTML = state.allChapterKeys
    .slice()
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .map((key) => {
      const data = state.seriesData.chapters[key];
      const itemTitle = `Ch. ${key} : ${data.title || "Titre inconnu"}`;
      return `<div class="dropdown-item ${
        key === state.currentChapter.number ? "active" : ""
      }" data-chapter="${key}" title="${itemTitle}">${truncateText(
        itemTitle,
        35
      )}</div>`;
    })
    .join("");
}

export function populatePageSelect() {
  const menu = qs("#page-dropdown .dropdown-menu");
  const textSpan = qs("#page-dropdown .page-text");
  if (!menu || !textSpan) return;

  const currentSpread = state.spreads[state.currentSpreadIndex] || [];
  const firstPageInSpread = currentSpread.length > 0 ? currentSpread[0] + 1 : 0;
  const lastPageInSpread =
    currentSpread.length > 0 ? currentSpread[currentSpread.length - 1] + 1 : 0;
  let pageText = `${firstPageInSpread}`;
  if (lastPageInSpread > firstPageInSpread) pageText += `-${lastPageInSpread}`;

  textSpan.textContent = `${pageText} / ${state.pages.length}`;

  menu.innerHTML = state.spreads
    .map((spread, i) => {
      const isActive = i === state.currentSpreadIndex;
      const firstPage = spread[0] + 1;
      const lastPage = spread[spread.length - 1] + 1;
      let pageLabel = `Page ${firstPage}`;
      if (lastPage > firstPage) pageLabel += `-${lastPage}`;
      return `<div class="dropdown-item ${
        isActive ? "active" : ""
      }" data-spread-index="${i}">${pageLabel}</div>`;
    })
    .join("");
}

export function updateActiveButtons() {
  qsa(".setting-options", dom.sidebar).forEach((group) => {
    const setting = group.dataset.setting;
    if (state.settings.hasOwnProperty(setting)) {
      const value = String(state.settings[setting]);
      qsa("button", group).forEach((btn) =>
        btn.classList.toggle("active", btn.dataset.value === value)
      );
    }
  });

  const isWebtoon = state.settings.mode === "webtoon";
  if (dom.modeOptionsGroup)
    dom.modeOptionsGroup.classList.toggle("visible", !isWebtoon);
  if (dom.modeOptionsGroup)
    dom.modeOptionsGroup.classList.toggle(
      "double-mode-active",
      state.settings.mode === "double"
    );
  if (dom.customFitControls)
    dom.customFitControls.classList.toggle(
      "visible",
      state.settings.fit === "custom"
    );

  updateFitButton();
}
