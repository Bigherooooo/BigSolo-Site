// js/pages/series-detail/MangaReader/events.js
import { qs, qsa, slugify } from "../../../utils/domUtils.js";
import { state, dom, domImages } from "./state.js";
import {
  render,
  renderViewer,
  updateUIOnPageChange,
  renderInteractionsSection,
} from "./ui.js";
import { calculateSpreads } from "./data.js";
import {
  goToPage,
  goToSpread,
  changeSpread,
  navigateToChapter,
} from "./navigation.js";
import { saveSettings, cycleFitMode, updateSliderStates } from "./settings.js";
import {
  queueAction,
  getLocalInteractionState,
  setLocalInteractionState,
  addPendingComment,
} from "../../../utils/interactions.js";
// MODIFIÉ : Import de la nouvelle fonction
import { assignUserIdentityForChapter } from "../../../utils/usernameGenerator.js";

let scrollTimeout = null;
let isSpoilerRevealed = false; // Pour se souvenir de l'état du flou

function handleKeyDown(e) {
  if (state.isModalOpen) return;
  const isLtr = state.settings.direction === "ltr";
  if (e.key === "ArrowRight") changeSpread(isLtr ? 1 : -1);
  if (e.key === "ArrowLeft") changeSpread(isLtr ? -1 : 1);
}
function handleWebtoonScroll() {
  if (state.settings.mode !== "webtoon") return;
  if (scrollTimeout) window.cancelAnimationFrame(scrollTimeout);
  scrollTimeout = window.requestAnimationFrame(() => {
    const triggerPoint = window.innerHeight * 0.2;
    let closestImageIndex = -1;
    let minDistance = Infinity;
    domImages.forEach((img, index) => {
      const rect = img.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const distance = Math.abs(rect.top - triggerPoint);
        if (distance < minDistance) {
          minDistance = distance;
          closestImageIndex = index;
        }
      }
    });
    if (closestImageIndex !== -1) {
      const newSpreadIndex = state.pageToSpreadMap[closestImageIndex];
      if (
        newSpreadIndex !== undefined &&
        newSpreadIndex !== state.currentSpreadIndex
      ) {
        state.currentSpreadIndex = newSpreadIndex;
        updateUIOnPageChange();
      }
    }
  });
}
function handleSliderChange(e, setting, otherInput) {
  if (e.target.disabled) return;
  const value = parseInt(e.target.value, 10) || 0;
  state.settings[setting] = value;
  otherInput.value = value;
  renderViewer();
  if (e.type === "change") saveSettings();
}
function handleDropdownClick(e) {
  const chapterItem = e.target.closest("#chapter-dropdown .dropdown-item");
  if (chapterItem && chapterItem.dataset.chapter) {
    window.location.href = `/${slugify(state.seriesData.title)}/${
      chapterItem.dataset.chapter
    }`;
    return;
  }
  const pageItem = e.target.closest("#page-dropdown .dropdown-item");
  if (pageItem) {
    if (pageItem.dataset.pageIndex) {
      goToPage(parseInt(pageItem.dataset.pageIndex, 10));
    } else if (pageItem.dataset.spreadIndex) {
      goToSpread(parseInt(pageItem.dataset.spreadIndex, 10));
    }
  }
}

export function attachInteractionListeners() {
  const seriesSlug = slugify(state.seriesData.title);
  const chapterNumber = state.currentChapter.number;
  const interactionKey = `interactions_${seriesSlug}_${chapterNumber}`;
  const container = qs(".chapter-interactions-container");
  if (!container) return;

  // NOUVEAU : Gestion du clic sur l'overlay de spoil
  const spoilerSection = qs(".comments-section", container);
  if (spoilerSection) {
    if (isSpoilerRevealed) {
      spoilerSection.classList.remove("spoiler-hidden");
    }

    spoilerSection.addEventListener("click", (e) => {
      if (spoilerSection.classList.contains("spoiler-hidden")) {
        spoilerSection.classList.remove("spoiler-hidden");
        isSpoilerRevealed = true;
      }
    });
  }

  const commentForm = qs(".comment-form", container);
  if (commentForm) {
    const textarea = qs("textarea", commentForm);
    textarea.addEventListener("input", () => {
      const lines = textarea.value.split("\n");
      if (lines.length > 5) {
        // Un peu plus de lignes permises
        textarea.value = lines.slice(0, 5).join("\n");
      }
    });
    commentForm.addEventListener("submit", async (e) => {
      // La fonction devient async
      e.preventDefault();
      const commentText = textarea.value.trim();
      if (commentText.length === 0) return;

      // MODIFIÉ : Utilisation du nouveau système d'identité
      const userIdentity = await assignUserIdentityForChapter(interactionKey);
      const newComment = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        username: userIdentity.username,
        avatarUrl: userIdentity.avatarUrl,
        comment: commentText,
        timestamp: Date.now(),
        likes: 0,
      };

      addPendingComment(interactionKey, newComment);

      let localState = getLocalInteractionState(interactionKey);
      state.chapterStats.comments.unshift(newComment);

      renderInteractionsSection(localState);
      qs(".comments-section")?.classList.remove("spoiler-hidden");
      isSpoilerRevealed = true;

      attachInteractionListeners();
      updateUIOnPageChange();

      queueAction(seriesSlug, {
        type: "add_comment",
        chapter: chapterNumber,
        payload: newComment,
      });
    });
    const chapterLikeBtn = qs(".chapter-like-button", commentForm);
    if (chapterLikeBtn) {
      chapterLikeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        let localState = getLocalInteractionState(interactionKey);
        const wasLiked = localState.hasLiked || false;
        state.chapterStats.likes += wasLiked ? -1 : 1;
        chapterLikeBtn.classList.toggle("liked", !wasLiked);
        updateUIOnPageChange();
        queueAction(seriesSlug, {
          type: wasLiked ? "unlike" : "like",
          chapter: chapterNumber,
        });
        localState.hasLiked = !wasLiked;
        setLocalInteractionState(interactionKey, localState);
      });
    }
  }
  const commentList = qs(".comment-list", container);
  if (commentList) {
    commentList.addEventListener("click", (e) => {
      const likeButton = e.target.closest(".comment-like-button");
      if (!likeButton) return;
      const commentItem = e.target.closest(".comment-item");
      const commentId = commentItem.dataset.commentId;
      const likeCountSpan = qs(".comment-like-count", likeButton);
      let localState = getLocalInteractionState(interactionKey);
      if (!localState.likedComments) localState.likedComments = {};
      const wasLiked = localState.likedComments[commentId] || false;
      const actionType = wasLiked ? "unlike_comment" : "like_comment";
      const currentLikes = parseInt(likeCountSpan.textContent, 10);
      likeCountSpan.textContent = wasLiked
        ? currentLikes - 1
        : currentLikes + 1;
      likeButton.classList.toggle("liked", !wasLiked);
      queueAction(seriesSlug, {
        type: actionType,
        chapter: chapterNumber,
        payload: { commentId },
      });
      localState.likedComments[commentId] = !wasLiked;
      setLocalInteractionState(interactionKey, localState);
    });
  }
}

export function initializeEvents() {
  isSpoilerRevealed = false; // Réinitialiser l'état du flou à chaque initialisation de chapitre

  if (dom.readerSidebarToggle) {
    dom.readerSidebarToggle.addEventListener("click", () => {
      dom.root.classList.toggle("sidebar-collapsed");

      // Mettre à jour le titre du bouton pour l'accessibilité
      const isCollapsed = dom.root.classList.contains("sidebar-collapsed");
      dom.readerSidebarToggle.setAttribute(
        "title",
        isCollapsed ? "Afficher les contrôles" : "Masquer les contrôles"
      );

      // ↓↓↓ MODIFICATION : Sauvegarder l'état dans les paramètres ↓↓↓
      state.settings.sidebarCollapsed = isCollapsed;
      saveSettings();
      // ↑↑↑ FIN DE LA MODIFICATION ↑↑↑
    });
  }

  document.addEventListener("keydown", handleKeyDown);
  dom.mobileSettingsBtn.addEventListener("click", () => {
    const isOpen = dom.sidebar.classList.contains("open");
    dom.sidebar.classList.toggle("open", !isOpen);
    dom.sidebarOverlay.classList.toggle("open", !isOpen);
    dom.root.classList.toggle("sidebar-is-open", !isOpen);
  });
  dom.sidebarOverlay.addEventListener("click", () => {
    dom.sidebar.classList.remove("open");
    dom.sidebarOverlay.classList.remove("open");
    dom.root.classList.remove("sidebar-is-open");
  });
  dom.sidebar.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    handleDropdownClick(e);
    if (!button || button.closest(".custom-dropdown")) return;
    const actionMap = {
      "first-page-btn": () => goToSpread(0),
      "prev-page-btn": () => changeSpread(-1),
      "next-page-btn": () => changeSpread(1),
      "last-page-btn": () => goToSpread(state.spreads.length - 1),
      "prev-chapter-btn": () => navigateToChapter(-1),
      "next-chapter-btn": () => navigateToChapter(1),
      "fit-mode-btn": cycleFitMode,
    };
    if (actionMap[button.id]) actionMap[button.id]();
    else if (button.closest(".setting-options")) {
      const group = button.closest(".setting-options");
      const setting = group.dataset.setting,
        value = button.dataset.value;
      const currentPageIndex = (state.spreads[state.currentSpreadIndex] || [
        0,
      ])[0];
      state.settings[setting] =
        value === "true" ? true : value === "false" ? false : value;
      if (setting === "mode" || setting === "doublePageOffset") {
        calculateSpreads();
        const newSpreadIndex = state.pageToSpreadMap[currentPageIndex];
        if (newSpreadIndex !== undefined)
          state.currentSpreadIndex = newSpreadIndex;
        renderInteractionsSection(
          getLocalInteractionState(
            `interactions_${slugify(state.seriesData.title)}_${
              state.currentChapter.number
            }`
          )
        );
        attachInteractionListeners();
      }
      if (setting === "direction") {
        dom.sidebar.classList.remove("ltr-mode", "rtl-mode");
        dom.sidebar.classList.add(`${value}-mode`);
      }
      saveSettings();
      render();
      if (setting === "mode" && state.settings.mode === "webtoon")
        goToSpread(state.currentSpreadIndex, true);
    }
  });
  dom.viewerContainer.addEventListener("click", (e) => {
    if (state.settings.mode === "webtoon") return;
    const rect = dom.viewerContainer.getBoundingClientRect();
    const zone = (e.clientX - rect.left) / rect.width;
    if (zone < 0.35) changeSpread(state.settings.direction === "ltr" ? -1 : 1);
    else if (zone > 0.65)
      changeSpread(state.settings.direction === "ltr" ? 1 : -1);
  });
  const scrollTarget = window.innerWidth > 992 ? dom.viewerContainer : window;
  scrollTarget.addEventListener("scroll", handleWebtoonScroll, {
    passive: true,
  });
  dom.progressBar.addEventListener("click", (e) => {
    if (e.target.matches(".progress-tick"))
      goToSpread(parseInt(e.target.dataset.spreadIndex, 10));
  });
  dom.stretchToggle.addEventListener("change", (e) => {
    state.settings.stretchSmallPages = e.target.checked;
    saveSettings();
    qs(".reader-viewer", dom.viewerContainer)?.classList.toggle(
      "stretch",
      e.target.checked
    );
  });
  dom.limitWidthToggle.addEventListener("change", (e) => {
    state.settings.limitWidth = e.target.checked;
    updateSliderStates();
    render();
    saveSettings();
  });
  dom.limitHeightToggle.addEventListener("change", (e) => {
    state.settings.limitHeight = e.target.checked;
    updateSliderStates();
    render();
    saveSettings();
  });
  ["input", "change"].forEach((evt) => {
    dom.customWidthSlider.addEventListener(evt, (e) =>
      handleSliderChange(e, "customMaxWidth", dom.customWidthInput)
    );
    dom.customWidthInput.addEventListener(evt, (e) =>
      handleSliderChange(e, "customMaxWidth", dom.customWidthSlider)
    );
    dom.customHeightSlider.addEventListener(evt, (e) =>
      handleSliderChange(e, "customMaxHeight", dom.customHeightInput)
    );
    dom.customHeightInput.addEventListener(evt, (e) =>
      handleSliderChange(e, "customMaxHeight", dom.customHeightSlider)
    );
  });
  dom.stretchToggle.checked = state.settings.stretchSmallPages;
  dom.limitWidthToggle.checked = state.settings.limitWidth;
  dom.limitHeightToggle.checked = state.settings.limitHeight;
  dom.customWidthSlider.value = state.settings.customMaxWidth;
  dom.customWidthInput.value = state.settings.customMaxWidth;
  dom.customHeightSlider.value = state.settings.customMaxHeight;
  dom.customHeightInput.value = state.settings.customMaxHeight;
  updateSliderStates();
  document.addEventListener("click", () => {
    qsa(".custom-dropdown .dropdown-toggle.open").forEach((toggle) => {
      toggle.classList.remove("open");
      toggle.nextElementSibling?.classList.remove("open");
    });
  });
}
