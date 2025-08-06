// js/pages/series-detail/MangaReader/navigation.js
import { slugify } from '../../../utils/domUtils.js';
import { state, dom, domImages } from './state.js';
import { render, updateUIOnPageChange } from './ui.js';

let urlUpdateTimeout = null;

export function getInitialPageNumberFromUrl() {
    if (window.location.hash === '#last') return 'last';
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    if (pathSegments.length === 3) {
        const pageNumber = parseInt(pathSegments[2], 10);
        if (!isNaN(pageNumber) && pageNumber > 0) return pageNumber;
    }
    return 1;
}

export function updateUrlForCurrentPage() {
    clearTimeout(urlUpdateTimeout);
    urlUpdateTimeout = setTimeout(() => {
        const seriesSlug = slugify(state.seriesData.title);
        const chapterNumber = state.currentChapter.number;
        const currentSpread = state.spreads[state.currentSpreadIndex];
        if (!currentSpread || currentSpread.length === 0) return;

        const firstPageIndexInSpread = currentSpread[0];
        const pageNumberForUrl = firstPageIndexInSpread + 1;
        const newPath = `/${seriesSlug}/${chapterNumber}/${pageNumberForUrl}`;

        if (window.location.pathname !== newPath) {
            history.replaceState({ page: pageNumberForUrl }, "", newPath);
        }
    }, 150);
}

export function goToPage(pageIndex, isInitializing = false) {
    if (state.settings.mode === 'webtoon') {
        const targetImage = domImages[pageIndex];
        if (targetImage) {
            const behavior = isInitializing ? 'auto' : 'smooth';
            targetImage.scrollIntoView({ behavior, block: 'start' });
            if (!isInitializing) {
                state.currentSpreadIndex = pageIndex;
                updateUIOnPageChange();
            }
        }
    } else {
        const spreadIndex = state.pageToSpreadMap[pageIndex];
        if (spreadIndex !== undefined) goToSpread(spreadIndex, isInitializing);
    }
}

export function goToSpread(spreadIndex, isInitializing = false) {
    state.currentSpreadIndex = Math.max(0, Math.min(spreadIndex, state.spreads.length - 1));

    if (state.settings.mode === 'webtoon') {
        const pageIndex = state.spreads[state.currentSpreadIndex]?.[0];
        if (pageIndex !== undefined && domImages[pageIndex]) {
            const behavior = isInitializing ? 'auto' : 'smooth';
            domImages[pageIndex].scrollIntoView({ behavior, block: 'start' });
        }
    }
    
    render(isInitializing);
    updateUrlForCurrentPage();
}

export function changeSpread(delta) {
    const isLastSpread = state.currentSpreadIndex >= state.spreads.length - 1;
    if (delta > 0 && isLastSpread) {
        navigateToChapter(1);
    } else if (delta < 0 && state.currentSpreadIndex === 0) {
        navigateToChapter(-1, true);
    } else {
        goToSpread(state.currentSpreadIndex + delta);
    }
}

export function navigateToChapter(delta, goToLastPage = false) {
    const currentChapterIndex = state.allChapterKeys.indexOf(state.currentChapter.number);
    const nextChapterIndex = currentChapterIndex + delta;
    if (nextChapterIndex >= 0 && nextChapterIndex < state.allChapterKeys.length) {
        const nextChapterKey = state.allChapterKeys[nextChapterIndex];
        let url = `/${slugify(state.seriesData.title)}/${nextChapterKey}`;
        if (goToLastPage) url += '#last';
        window.location.href = url;
    }
}

export function preloadImages() {
    const nextSpreadIndex = state.currentSpreadIndex + 1;
    if (nextSpreadIndex < state.spreads.length) {
        state.spreads[nextSpreadIndex].forEach(pageIndex => {
            // L'image est déjà en cours de chargement par `fetchAndLoadPages`,
            // cette fonction sert de placeholder si on veut une logique de préchargement plus avancée.
        });
    }
}