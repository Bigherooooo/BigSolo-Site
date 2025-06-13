// js/pages/series-detail.js
import { fetchAllSeriesData } from '../utils/fetchUtils.js';
import { slugify, qs, qsa } from '../utils/domUtils.js';
import { timeAgo, parseDateToTimestamp } from '../utils/dateUtils.js';

let currentSeriesAllChaptersRaw = [];
let currentVolumeSortOrder = 'desc';
const CHAPTER_SEPARATOR = '__';

/**
 * Récupère (via scraping) le nombre de vues pour un post ImgChest donné via une fonction proxy.
 * @param {string} imgchestPostId - L'ID du post ImgChest.
 * @param {string} chapterElementDomId - L'ID de l'élément DOM du chapitre où afficher les vues.
 */
async function fetchChapterViews(imgchestPostId, chapterElementDomId) {
  const viewsSpan = qs(`#${chapterElementDomId} .detail-chapter-views`);
  if (!viewsSpan) {
    console.warn(`[fetchChapterViews] Views span not found for DOM ID: ${chapterElementDomId}`);
    return;
  }

  viewsSpan.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`; // Indicateur de chargement

  try {
    // L'URL de notre fonction proxy Cloudflare Pages qui fera le scraping
    const proxyUrl = `/api/imgchest-views?id=${imgchestPostId}`; 
    console.log(`[fetchChapterViews] Calling proxy: ${proxyUrl} for ImgChest ID: ${imgchestPostId}`);
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
      let errorText = `Erreur API: ${response.status}`;
      try { 
        const errorJson = await response.json();
        errorText = errorJson.error || errorText;
      } catch (e) { /* ignore si pas JSON */ }
      console.warn(`[fetchChapterViews] Failed to fetch views for ${imgchestPostId} from ${proxyUrl}. Status: ${response.status}. Message: ${errorText}`);
      viewsSpan.innerHTML = `<i class="fas fa-eye-slash" title="Vues non disponibles (${errorText})"></i>`;
      return;
    }

    let data;
    try {
        data = await response.json();
    } catch (e) {
        console.error(`[fetchChapterViews] Error parsing JSON from proxy for ${imgchestPostId}. Response may not have been valid JSON.`, e);
        viewsSpan.innerHTML = `<i class="fas fa-exclamation-circle" title="Réponse invalide du serveur de vues"></i>`;
        return;
    }
    
    if (data && typeof data.views !== 'undefined') {
      viewsSpan.innerHTML = `<i class="fas fa-eye"></i> ${data.views.toLocaleString('fr-FR')}`;
    } else {
      console.warn(`[fetchChapterViews] Unexpected view data structure for ${imgchestPostId}. Data:`, data, "Error from proxy:", data.error);
      viewsSpan.innerHTML = `<i class="fas fa-eye-slash" title="${data.error || 'Données de vues incorrectes'}"></i>`;
    }
  } catch (error) {
    console.error(`[fetchChapterViews] Network or other error fetching views for ${imgchestPostId}:`, error);
    viewsSpan.innerHTML = `<i class="fas fa-exclamation-circle" title="Erreur réseau chargement des vues"></i>`;
  }
}

function renderChaptersListForVolume(chaptersToRender, seriesBase64Url, seriesSlug) {
  const chapterViewsFetchQueue = []; // Stocker les infos pour les fetches à faire après le rendu

  const chaptersHtml = chaptersToRender.map((c, index) => {
    const isLicensed = c.licencied && c.licencied.length > 0 && (!c.groups || c.groups.Big_herooooo === '');
    const chapterClass = isLicensed ? 'detail-chapter-item licensed-chapter-item' : 'detail-chapter-item';
    let clickAction = '';
    let dataHref = '';
    let viewsHtmlPlaceholder = ''; // Sera remplacé par le nombre de vues ou restera un spinner

    // Générer un ID DOM unique pour chaque élément de chapitre pour pouvoir cibler le span des vues
    const chapterElementDomId = `ch-item-${seriesSlug}-${String(c.chapter).replace(/\./g, '_')}-${index}`;

    if (!isLicensed && c.groups && c.groups.Big_herooooo) {
      const chapterNumberForLink = String(c.chapter).replaceAll(".", "-");
      dataHref = `/series-detail/${seriesSlug}/${chapterNumberForLink}`;
      clickAction = `data-internal-redirect-href="${dataHref}"`;

      // Vérifier si c'est un lien ImgChest et extraire l'ID
      if (c.groups.Big_herooooo.includes('/proxy/api/imgchest/chapter/')) {
        const parts = c.groups.Big_herooooo.split('/');
        const imgchestPostId = parts[parts.length - 1];
        if (imgchestPostId) {
          viewsHtmlPlaceholder = `<span class="detail-chapter-views"><i class="fas fa-circle-notch fa-spin"></i></span>`;
          // Ajouter à la file d'attente pour fetch après le rendu du DOM
          chapterViewsFetchQueue.push({ imgchestPostId, chapterElementDomId });
        }
      }
    }

    const collabHtml = c.collab ? `<span class="detail-chapter-collab">${c.collab}</span>` : '';
    return `
      <div class="${chapterClass}" ${clickAction} ${dataHref ? `data-href="${dataHref}"` : ''} role="link" tabindex="0" id="${chapterElementDomId}">
        <div class="chapter-main-info">
          <span class="detail-chapter-number">Chapitre ${c.chapter}</span>
          <span class="detail-chapter-title">${c.title || 'Titre inconnu'}</span>
        </div>
        <div class="chapter-side-info">
          ${viewsHtmlPlaceholder}
          ${collabHtml}
          <span class="detail-chapter-date">${timeAgo(c.last_updated_ts)}</span>
        </div>
      </div>`;
  }).join('');

  // Lancer les fetches après un court délai pour s'assurer que le DOM est mis à jour
  // et que les éléments avec les ID cibles existent.
  if (chapterViewsFetchQueue.length > 0) {
    setTimeout(() => {
      chapterViewsFetchQueue.forEach(item => {
        fetchChapterViews(item.imgchestPostId, item.chapterElementDomId);
      });
    }, 10); // Un petit délai peut suffire, ajustable si besoin
  }

  return chaptersHtml;
}

function displayGroupedChapters(seriesBase64Url, seriesSlug) {
  const chaptersContainer = qs(".chapters-accordion-container");
  if (!chaptersContainer) {
      console.error("'.chapters-accordion-container' not found in displayGroupedChapters.");
      return;
  }
  if (!currentSeriesAllChaptersRaw || currentSeriesAllChaptersRaw.length === 0) {
    chaptersContainer.innerHTML = "<p>Aucun chapitre à afficher pour cette série.</p>";
    return;
  }
  let grouped = new Map();
  let volumeLicenseInfo = new Map();
  currentSeriesAllChaptersRaw.forEach(chap => {
    const volKey = chap.volume && String(chap.volume).trim() !== '' ? String(chap.volume).trim() : 'hors_serie';
    if (!grouped.has(volKey)) grouped.set(volKey, []);
    grouped.get(volKey).push(chap);
    if (chap.licencied && chap.licencied.length > 0 && (!chap.groups || chap.groups.Big_herooooo === '')) {
      if (!volumeLicenseInfo.has(volKey)) volumeLicenseInfo.set(volKey, chap.licencied);
    }
  });
  for (const [, chapters] of grouped.entries()) {
    chapters.sort((a, b) => {
      const chapA = parseFloat(String(a.chapter).replace(',', '.'));
      const chapB = parseFloat(String(b.chapter).replace(',', '.'));
      let comparison = currentVolumeSortOrder === 'desc' ? chapB - chapA : chapA - chapB;
      if (comparison === 0) return (a.title || "").localeCompare(b.title || "");
      return comparison;
    });
  }
  let sortedVolumeKeys = [...grouped.keys()].sort((a, b) => {
    const isAHorsSerie = a === 'hors_serie';
    const isBHorsSerie = b === 'hors_serie';
    if (currentVolumeSortOrder === 'asc') {
      if (isAHorsSerie && !isBHorsSerie) return 1;
      if (!isAHorsSerie && isBHorsSerie) return -1;
    } else {
      if (isAHorsSerie && !isBHorsSerie) return -1;
      if (!isAHorsSerie && isBHorsSerie) return 1;
    }
    if (isAHorsSerie && isBHorsSerie) return 0;
    const numA = parseFloat(String(a).replace(',', '.'));
    const numB = parseFloat(String(b).replace(',', '.'));
    return currentVolumeSortOrder === 'desc' ? numB - numA : numA - numB;
  });
  let html = '';
  sortedVolumeKeys.forEach(volKey => {
    const volumeDisplayName = volKey === 'hors_serie' ? 'Hors-série' : `Volume ${volKey}`;
    const chaptersInVolume = grouped.get(volKey);
    const licenseDetails = volumeLicenseInfo.get(volKey);
    const isActiveByDefault = true;
    let volumeHeaderContent = `<h4 class="volume-title-main">${volumeDisplayName}</h4>`;
    if (licenseDetails) {
      volumeHeaderContent += `
        <div class="volume-license-details">
            <span class="volume-license-text">Ce volume est disponible en format papier, vous pouvez le commander</span>
            <a href="${licenseDetails[0]}" target="_blank" rel="noopener noreferrer" class="volume-license-link">juste ici !</a>
            ${licenseDetails[1] ? `<span class="volume-release-date">${licenseDetails[1]}</span>` : ''}
        </div>`;
    }
    html += `
      <div class="volume-group">
        <div class="volume-header ${isActiveByDefault ? 'active' : ''}" data-volume="${volKey}">
          ${volumeHeaderContent}
          <i class="fas fa-chevron-down volume-arrow ${isActiveByDefault ? 'rotated' : ''}"></i>
        </div>
        <div class="volume-chapters-list">
          ${renderChaptersListForVolume(chaptersInVolume, seriesBase64Url, seriesSlug)}
        </div>
      </div>`;
  });
  chaptersContainer.innerHTML = html;

  qsa('.volume-group', chaptersContainer).forEach(group => {
    const header = group.querySelector('.volume-header');
    const content = group.querySelector('.volume-chapters-list');
    const arrow = header.querySelector('.volume-arrow');
    if (!header || !content) return;
    if (header.classList.contains('active')) content.style.maxHeight = content.scrollHeight + "px";
    else content.style.maxHeight = "0px";
    header.addEventListener('click', () => {
      header.classList.toggle('active');
      if (arrow) arrow.classList.toggle('rotated');
      if (header.classList.contains('active')) content.style.maxHeight = content.scrollHeight + "px";
      else content.style.maxHeight = "0px";
    });
  });
}

function renderSeriesDetailPageContent(s, seriesSlug) {
  const seriesDetailSection = qs("#series-detail-section");
  if (!seriesDetailSection || !s || !s.chapters) {
    if (seriesDetailSection) seriesDetailSection.innerHTML = "<p>Données de série invalides ou série non trouvée.</p>";
    return;
  }
  currentSeriesAllChaptersRaw = Object.entries(s.chapters).map(([chapNum, chapData]) => ({
    chapter: chapNum, ...chapData, last_updated_ts: parseDateToTimestamp(chapData.last_updated || 0),
  }));
  const titleHtml = `<h1 class="detail-title">${s.title}</h1>`;
  let coversGalleryLinkHtml = '';
  const tagsHtml = (Array.isArray(s.tags) && s.tags.length > 0) ? `<div class="detail-tags">${s.tags.map(t => `<span class="detail-tag">${t}</span>`).join("")}</div>` : "";
  let authorArtistHtml = '';
  const authorText = s.author ? `<strong>Auteur :</strong> ${s.author}` : '';
  const artistText = s.artist ? `<strong>Dessinateur :</strong> ${s.artist}` : '';
  if (s.author && s.artist) authorArtistHtml = `<p class="detail-meta">${authorText}${s.author !== s.artist ? `<span class="detail-artist-spacing">${artistText}</span>` : ''}</p>`;
  else if (s.author) authorArtistHtml = `<p class="detail-meta">${authorText}</p>`;
  else if (s.artist) authorArtistHtml = `<p class="detail-meta">${artistText}</p>`;
  let yearStatusHtmlMobile = '', typeMagazineHtmlMobile = '', alternativeTitlesMobileHtml = '';
  if (s.release_year || s.release_status) {
    let yearPart = s.release_year ? `<strong>Année :</strong> ${s.release_year}` : '';
    let statusPart = s.release_status ? `<strong>Statut :</strong> ${s.release_status}` : '';
    yearStatusHtmlMobile = `<p class="detail-meta detail-meta-flex-line detail-year-status-mobile"><span class="detail-meta-flex-prefix">${yearPart || statusPart}</span>`;
    if (yearPart && statusPart) yearStatusHtmlMobile += `<span class="detail-meta-flex-suffix">${statusPart.replace('Statut : ', '')}</span>`;
    yearStatusHtmlMobile += `</p>`;
  }
  if (s.manga_type || s.magazine) {
    let typePart = s.manga_type ? `<strong>Type :</strong> ${s.manga_type}` : '';
    let magazinePart = s.magazine ? `<strong>Magazine :</strong> ${s.magazine}` : '';
    typeMagazineHtmlMobile = `<p class="detail-meta detail-meta-flex-line detail-type-magazine-mobile"><span class="detail-meta-flex-prefix">${typePart || magazinePart}</span>`;
    if (typePart && magazinePart) typeMagazineHtmlMobile += `<span class="detail-meta-flex-suffix">${magazinePart.replace('Magazine : ', '')}</span>`;
    typeMagazineHtmlMobile += `</p>`;
  }
  if (s.alternative_titles && s.alternative_titles.length > 0) {
    alternativeTitlesMobileHtml = `<p class="detail-meta"><strong>Titres alt. :</strong> ${s.alternative_titles.join(', ')}</p>`;
  }
  let additionalMetadataForDesktop = [];
  if (s.release_year) additionalMetadataForDesktop.push(`<p><strong>Année :</strong> ${s.release_year}</p>`);
  if (s.release_status) additionalMetadataForDesktop.push(`<p><strong>Statut :</strong> ${s.release_status}</p>`);
  if (s.manga_type) additionalMetadataForDesktop.push(`<p><strong>Type :</strong> ${s.manga_type}</p>`);
  if (s.magazine) additionalMetadataForDesktop.push(`<p><strong>Magazine :</strong> ${s.magazine}</p>`);
  if (s.alternative_titles && s.alternative_titles.length > 0) additionalMetadataForDesktop.push(`<p><strong>Titres alternatifs :</strong> ${s.alternative_titles.join(', ')}</p>`);
  const additionalMetadataCombinedHtmlForDesktop = additionalMetadataForDesktop.length > 0 ? `<div class="detail-additional-metadata">${additionalMetadataForDesktop.join('')}</div>` : "";
  const descriptionHtmlText = s.description || 'Pas de description disponible.';
  const chaptersSectionHtml = `
    <div class="chapters-main-header">
      <h3 class="section-title">Liste des Chapitres</h3>
      <div class="chapter-sort-filter">
        <button id="sort-volumes-btn" class="sort-button" title="Trier les volumes">
          <i class="fas fa-sort-numeric-down-alt"></i>
        </button>
      </div>
    </div>
    <div class="chapters-accordion-container"></div>`;
  const finalHtmlStructure = `
    <div class="series-detail-container">
      <div class="detail-top-layout-wrapper">
        <div class="detail-cover-wrapper">
          <img src="${s.cover || 'img/placeholder_preview.png'}" alt="${s.title} Cover" class="detail-cover" loading="lazy">
        </div>
        <div class="detail-all-info-column">
          <div class="detail-primary-info-wrapper">
            ${titleHtml}
            ${tagsHtml}
            ${authorArtistHtml}
          </div>
          <div class="detail-secondary-info-wrapper detail-secondary-desktop">
            ${additionalMetadataCombinedHtmlForDesktop}
          </div>
        </div>
      </div>
      <div class="detail-secondary-info-wrapper detail-secondary-mobile">
        ${yearStatusHtmlMobile}
        ${typeMagazineHtmlMobile}
        ${alternativeTitlesMobileHtml}
      </div>
      ${coversGalleryLinkHtml}
      <p class="detail-description">${descriptionHtmlText}</p>
      ${chaptersSectionHtml}
    </div>`;
  seriesDetailSection.innerHTML = finalHtmlStructure;
  document.title = `BigSolo – ${s.title}`;
  displayGroupedChapters(s.base64Url, seriesSlug);
  const sortButton = qs('#sort-volumes-btn');
  if (sortButton) {
    const icon = sortButton.querySelector('i');
    if (icon) icon.className = (currentVolumeSortOrder === 'desc') ? "fas fa-sort-numeric-down-alt" : "fas fa-sort-numeric-up-alt";
    if (!sortButton.dataset.listenerAttached) {
      sortButton.addEventListener('click', function () {
        currentVolumeSortOrder = (currentVolumeSortOrder === 'desc') ? 'asc' : 'desc';
        const currentIcon = this.querySelector('i');
        if (currentIcon) currentIcon.className = (currentVolumeSortOrder === 'desc') ? "fas fa-sort-numeric-down-alt" : "fas fa-sort-numeric-up-alt";
        displayGroupedChapters(s.base64Url, seriesSlug);
      });
      sortButton.dataset.listenerAttached = 'true';
    }
  }
}

async function handleChapterRedirect(internalId, allSeries) {
  const parts = internalId.split(CHAPTER_SEPARATOR);
  if (parts.length < 2 || !parts[1]) {
    console.warn("[handleChapterRedirect] internalId n'a pas le format slug__chapitre ou chapitre manquant:", internalId);
    return false;
  }
  const seriesSlugForLookup = parts[0];
  const chapterNumber = parts[1];
  const seriesData = allSeries.find(s => slugify(s.title) === seriesSlugForLookup);

  if (seriesData && seriesData.base64Url && chapterNumber) {
    const chapterNumberFormattedForCubari = String(chapterNumber).replaceAll(".", "-");
    const cubariUrl = `https://cubari.moe/read/gist/${seriesData.base64Url}/${chapterNumberFormattedForCubari}/1/`;
    console.log(`[handleChapterRedirect] Redirecting to Cubari: ${cubariUrl}`);
    window.location.href = cubariUrl;
    return true;
  }
  console.warn(`[handleChapterRedirect] Could not find series data or base64Url for Cubari redirect. Slug: ${seriesSlugForLookup}, Chapter: ${chapterNumber}`);
  return false;
}

export async function initSeriesDetailPage() {
  const seriesDetailSection = qs("#series-detail-section");
  if (!seriesDetailSection) {
    console.error("[SeriesDetail] #series-detail-section not found.");
    return;
  }
  seriesDetailSection.innerHTML = '<p class="loading-message">Chargement des informations de la série...</p>'; 
  
  let internalIdToProcess;
  const pathname = window.location.pathname;
  console.log("[SeriesDetail] Current pathname:", pathname);
  const pathSegments = pathname.split('/').filter(Boolean);
  console.log("[SeriesDetail] Path segments:", pathSegments);

  if (pathSegments.length === 3 && pathSegments[0] === 'series-detail' && pathSegments[2] !== 'cover') {
    const slug = pathSegments[1];
    const chapter = pathSegments[2];
    internalIdToProcess = `${slug}${CHAPTER_SEPARATOR}${chapter}`;
    console.log(`[SeriesDetail] Parsed from path (slug & chapter): ${internalIdToProcess}`);
  } 
  else if (pathSegments.length === 2 && pathSegments[0] === 'series-detail') {
    internalIdToProcess = pathSegments[1];
    console.log(`[SeriesDetail] Parsed from path (slug only): ${internalIdToProcess}`);
  }

  if (!internalIdToProcess) {
    console.warn("[SeriesDetail] Could not determine ID to process. Pathname:", pathname, "Segments:", pathSegments);
    // Ne pas afficher d'erreur ici si c'est potentiellement une page /cover
    // seriesDetailSection.innerHTML = "<p>Aucune série spécifiée dans l'URL.</p>";
    return; 
  }

  try {
    const allSeries = await fetchAllSeriesData();
    if (!Array.isArray(allSeries)) {
      console.error("fetchAllSeriesData did not return an array. Received:", allSeries);
      seriesDetailSection.innerHTML = "<p>Erreur critique : impossible de récupérer les données des séries.</p>";
      return;
    }
    const parts = internalIdToProcess.split(CHAPTER_SEPARATOR);
    const seriesSlugForLookup = parts[0];
    const chapterPartFromId = parts.length > 1 ? parts[1] : null;

    if (chapterPartFromId) {
      console.log(`[SeriesDetail] Chapter part detected ('${chapterPartFromId}'). Attempting redirect for: ${internalIdToProcess}`);
      const redirected = await handleChapterRedirect(internalIdToProcess, allSeries);
      if (redirected) {
        seriesDetailSection.innerHTML = `<p class="loading-message">Redirection vers le chapitre...</p>`;
        return; 
      } else {
        console.warn(`[SeriesDetail] Redirect failed for '${internalIdToProcess}'. Will display series page for slug: '${seriesSlugForLookup}'`);
      }
    }

    console.log(`[SeriesDetail] Displaying series detail page for slug: ${seriesSlugForLookup}`);
    const seriesData = allSeries.find(s => slugify(s.title) === seriesSlugForLookup);
    
    if (seriesData) {
      renderSeriesDetailPageContent(seriesData, seriesSlugForLookup);
    } else {
      seriesDetailSection.innerHTML = `<p>Série avec l'identifiant "${seriesSlugForLookup}" non trouvée.</p>`;
      document.title = `BigSolo – Série non trouvée`;
      console.warn(`[SeriesDetail] Series data not found for slug: ${seriesSlugForLookup}`);
    }

  } catch (error) {
    console.error("🚨 Erreur lors de l'initialisation de la page de détail de série:", error);
    seriesDetailSection.innerHTML = "<p>Erreur lors du chargement des détails de la série.</p>";
  }

  document.body.addEventListener('click', async function (event) {
    let targetElement = event.target;
    while (targetElement && targetElement !== document.body && !targetElement.matches('.detail-chapter-item[data-internal-redirect-href]')) {
      targetElement = targetElement.parentElement;
    }
    if (targetElement && targetElement.matches('.detail-chapter-item[data-internal-redirect-href]')) {
      event.preventDefault();
      const prettyUrlPath = targetElement.getAttribute('data-internal-redirect-href'); 
      if (prettyUrlPath) {
        console.log("[Click Listener] Clicked chapter link. Path:", prettyUrlPath);
        try {
            const pathSegments = prettyUrlPath.split('/').filter(Boolean); 
            if (pathSegments.length === 3 && pathSegments[0] === 'series-detail') {
              const slug = pathSegments[1];
              const chapter = pathSegments[2];
              const internalIdForRedirect = `${slug}${CHAPTER_SEPARATOR}${chapter}`;
              console.log("[Click Listener] Reconstructed internal ID for redirect:", internalIdForRedirect);
              const allSeriesData = await fetchAllSeriesData();
              const redirected = await handleChapterRedirect(internalIdForRedirect, allSeriesData);
              if (!redirected) {
                console.warn("[Click Listener] Redirect from click failed for", internalIdForRedirect);
              }
            } else {
              console.warn("[Click Listener] Malformed pretty URL path from click:", prettyUrlPath);
            }
        } catch (e) {
            console.error("[Click Listener] Error processing click for redirect:", prettyUrlPath, e);
        }
      }
    }
  });
}