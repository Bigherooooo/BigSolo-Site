// js/pages/galerie.js
import { fetchData } from '../utils/fetchUtils.js';
import { parseDateToTimestamp, formatDateForGallery } from '../utils/dateUtils.js';
import { initLazyLoadObserver, initMainScrollObserver } from '../components/observer.js';
import { qs, qsa } from '../utils/domUtils.js';

// Variables globales du module
let allColosData = [];
let authorsInfoData = {};

// Sélecteurs DOM
const galleryGridContainer = qs('#gallery-grid-container');
const sortOrderSelect = qs('#sort-order');
const filterArtistSelect = qs('#filter-artist');
const lightboxModal = qs('#lightbox-modal');
const lightboxImg = qs('#lightbox-img');
const lightboxCloseBtn = qs('.lightbox-close');

/**
 * Génère le HTML pour une carte de colorisation dans la galerie.
 * @param {object} colo - L'objet de données de la colorisation.
 * @param {object} author - L'objet de données de l'auteur.
 * @returns {string} Le code HTML de la carte.
 */
function renderColoCard(colo, author) {
  const authorName = author && author.username ? author.username : 'Artiste inconnu';
  return `
    <div class="colo-card" data-colo-id="${colo.id}"> 
      <img class="lazy-load-gallery" 
           src="/img/placeholder_preview.png" 
           alt="Colorisation Chap. ${colo.chapitre || 'N/A'} par ${authorName}" 
           data-src="${"https://file.garden/aDmcfobZthZjQO3m/previews/" + colo.id + "_preview.webp"
    || "https://file.garden/aDmcfobZthZjQO3m/images/" + colo.id + "_preview.webp"}"> 
      <div class="colo-card-overlay">
        <p>Chap. ${colo.chapitre || 'N/A'}${colo.page ? `, Page ${colo.page}` : ''}</p>
        <p>Par ${authorName}</p>
      </div>
    </div>`;
}

/**
 * Génère le HTML pour les liens des réseaux sociaux.
 * @param {object} links - Un objet contenant les URLs des réseaux.
 * @param {string} typeClassPrefix - Un préfixe de classe pour le conteneur.
 * @returns {string} Le code HTML des liens sociaux.
 */
function getSocialsHTML(links, typeClassPrefix) {
  let html = '';
  if (!links || Object.values(links).every(val => !val || String(val).trim() === "")) return '';
  html += `<div class="${typeClassPrefix}-socials">`;
  if (links.twitter && String(links.twitter).trim() !== "") html += `<a href="${String(links.twitter).trim()}" target="_blank" rel="noopener noreferrer"><i class="fab fa-twitter"></i> Twitter</a>`;
  if (links.instagram && String(links.instagram).trim() !== "") html += `<a href="${String(links.instagram).trim()}" target="_blank" rel="noopener noreferrer"><i class="fab fa-instagram"></i> Instagram</a>`;
  if (links.tiktok && String(links.tiktok).trim() !== "") html += `<a href="${String(links.tiktok).trim()}" target="_blank" rel="noopener noreferrer"><i class="fab fa-tiktok"></i> TikTok</a>`;
  if (links.reddit && String(links.reddit).trim() !== "") html += `<a href="${String(links.reddit).trim()}" target="_blank" rel="noopener noreferrer"><i class="fab fa-reddit"></i> Reddit</a>`;
  html += '</div>';
  return html;
}

/**
 * Affiche les informations de la colorisation et de l'auteur dans la lightbox.
 * @param {object} colo - L'objet de données de la colorisation.
 * @param {object} author - L'objet de données de l'auteur.
 */
function displayLightboxInfo(colo, author) {
  const desktopArtistBlock = qs('.lightbox-info-panel-desktop .lightbox-artist-info-block');
  const desktopColoBlock = qs('.lightbox-info-panel-desktop .lightbox-colo-info-block');
  const mobileArtistInfoContainer = qs('.lightbox-info-panel-mobile .lightbox-artist-info');
  const mobileColoInfoContainer = qs('.lightbox-info-panel-mobile .lightbox-colo-info');

  let artistHtmlContent = '<p class="lightbox-info-placeholder">Infos artiste non disponibles.</p>';
  if (author && colo) {
    const currentAuthorId = colo.author_id;
    const occurrenceCount = allColosData.filter(c => String(c.author_id) === String(currentAuthorId)).length;
    artistHtmlContent = `
      <div class="artist-header">
        <img src="${author.profile_img || '/img/profil.png'}" alt="Photo de profil de ${author.username}" class="lightbox-artist-pfp" loading="lazy">
        <div class="artist-text-details">
          <h3 class="lightbox-artist-name" data-author-id="${currentAuthorId}">${author.username}</h3>
          <span class="artist-occurrence-count">(${occurrenceCount} colo${occurrenceCount > 1 ? 's' : ''})</span>
        </div>
      </div>
      ${getSocialsHTML({ twitter: author.twitter, instagram: author.instagram, tiktok: author.tiktok, reddit: author.reddit }, 'lightbox-artist')}
    `;
  }

  let coloHtmlContent = '<p class="lightbox-info-placeholder">Infos colorisation non disponibles.</p>';
  if (colo) {
    coloHtmlContent = `
      <p><strong>Chapitre :</strong> ${colo.chapitre || 'N/A'}${colo.page ? `, Page ${colo.page}` : ''}</p>
      <p><strong>Date :</strong> ${formatDateForGallery(colo.date)}</p>
      <p><strong>ID :</strong> ${colo.id}</p> 
      ${getSocialsHTML({ twitter: colo.twitter, instagram: colo.instagram, tiktok: colo.tiktok, reddit: colo.reddit }, 'lightbox-colo')}
    `;
  }

  if (desktopArtistBlock) desktopArtistBlock.innerHTML = artistHtmlContent;
  if (desktopColoBlock) desktopColoBlock.innerHTML = coloHtmlContent;
  if (mobileArtistInfoContainer) mobileArtistInfoContainer.innerHTML = artistHtmlContent;
  if (mobileColoInfoContainer) mobileColoInfoContainer.innerHTML = coloHtmlContent;

  qsa('.lightbox-artist-name[data-author-id]').forEach(nameElement => {
    if (!nameElement.dataset.listenerAttached) {
      nameElement.style.cursor = 'pointer';
      nameElement.addEventListener('mouseenter', () => { nameElement.style.textDecoration = 'underline'; });
      nameElement.addEventListener('mouseleave', () => { nameElement.style.textDecoration = 'none'; });
      nameElement.addEventListener('click', function () {
        const authorIdToFilter = this.dataset.authorId;
        if (filterArtistSelect && authorIdToFilter) {
          if (Array.from(filterArtistSelect.options).some(opt => opt.value === authorIdToFilter)) {
            filterArtistSelect.value = authorIdToFilter;
            closeLightbox();
            displayColos();
          }
        }
      });
      nameElement.dataset.listenerAttached = 'true';
    }
  });
}

/**
 * Ouvre la lightbox pour un ID de colo spécifique et met à jour l'URL.
 * @param {string|number} coloId - L'ID de la colorisation à afficher.
 */
function openLightboxForId(coloId) {
  if (!coloId) return;

  const selectedColo = allColosData.find(c => c.id.toString() === coloId.toString());

  if (selectedColo && lightboxModal && lightboxImg) {
    lightboxImg.src = "https://file.garden/aDmcfobZthZjQO3m/images/" + selectedColo.id + ".webp";
    const author = selectedColo.author_id ? authorsInfoData[selectedColo.author_id] : null;
    displayLightboxInfo(selectedColo, author);
    lightboxModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const newPath = `/galerie/${coloId}`;
    history.pushState({ coloId: coloId }, '', newPath);
  } else {
    console.warn(`[Galerie] Impossible d'ouvrir la lightbox: colo avec l'ID ${coloId} non trouvée.`);
  }
}

function closeLightbox() {
  if (lightboxModal) lightboxModal.style.display = 'none';
  document.body.style.overflow = 'auto';
  if (lightboxImg) lightboxImg.src = "";

  history.pushState(null, '', '/galerie/');
}

function displayColos() {
  if (!galleryGridContainer) {
    console.warn("[Galerie] galleryGridContainer non trouvé lors de displayColos.");
    return;
  }
  if (!allColosData.length || Object.keys(authorsInfoData).length === 0) {
    galleryGridContainer.innerHTML = "<p>Aucune colorisation à afficher ou données d'auteurs manquantes.</p>";
    return;
  }

  let colosToDisplay = [...allColosData];
  const selectedArtistId = filterArtistSelect ? filterArtistSelect.value : 'all';
  const sortBy = sortOrderSelect ? sortOrderSelect.value : 'date_desc';

  if (selectedArtistId !== 'all') {
    colosToDisplay = colosToDisplay.filter(c => String(c.author_id) === selectedArtistId);
  }

  colosToDisplay.sort((a, b) => {
    switch (sortBy) {
      case 'date_asc': return parseDateToTimestamp(a.date) - parseDateToTimestamp(b.date);
      case 'chapitre_asc': return parseFloat(a.chapitre || 0) - parseFloat(b.chapitre || 0) || (a.page || 0) - (b.page || 0);
      case 'chapitre_desc': return parseFloat(b.chapitre || 0) - parseFloat(a.chapitre || 0) || (b.page || 0) - (a.page || 0);
      default:
        return parseDateToTimestamp(b.date) - parseDateToTimestamp(a.date);
    }
  });

  galleryGridContainer.innerHTML = colosToDisplay.map(colo => {
    const author = authorsInfoData[colo.author_id];
    return renderColoCard(colo, author);
  }).join('');

  qsa('.colo-card', galleryGridContainer).forEach(card => {
    if (!card.dataset.lightboxListenerAttached) {
      card.addEventListener('click', () => {
        const coloIdFromDataset = card.dataset.coloId;
        openLightboxForId(coloIdFromDataset);
      });
      card.dataset.lightboxListenerAttached = 'true';
    }
  });

  initLazyLoadObserver('img.lazy-load-gallery');
  initMainScrollObserver('#gallery-grid-container .colo-card');
}

export async function initGaleriePage() {
  if (!galleryGridContainer) {
    console.warn("[Galerie] Initialisation annulée: galleryGridContainer non trouvé.");
    return;
  }

  try {
    const [colos, authors] = await Promise.all([
      fetchData('/data/colos/colos.json', { noCache: true }),
      fetchData('/data/colos/author_info.json', { noCache: true })
    ]);

    if (!colos || !authors) {
      throw new Error("Données de colos ou d'auteurs non reçues ou invalides.");
    }
    allColosData = colos;
    authorsInfoData = authors;

    if (filterArtistSelect) {
      filterArtistSelect.innerHTML = '<option value="all">Tous les artistes</option>';
      const sortedAuthors = Object.entries(authorsInfoData)
        .sort(([, a], [, b]) => (a.username || "").localeCompare(b.username || ""));
      sortedAuthors.forEach(([id, author]) => {
        if (author && author.username) {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = author.username;
          filterArtistSelect.appendChild(option);
        }
      });
    }

    if (sortOrderSelect) sortOrderSelect.addEventListener('change', displayColos);
    if (filterArtistSelect) filterArtistSelect.addEventListener('change', displayColos);

    if (lightboxModal && lightboxCloseBtn) {
      lightboxCloseBtn.addEventListener('click', closeLightbox);
      lightboxModal.addEventListener('click', (e) => {
        if (e.target === lightboxModal) {
          closeLightbox();
        }
      });
    }

    displayColos();

    const galleryPathMatch = window.location.pathname.match(/^\/galerie\/(\d+)\/?$/);
    let coloIdFromUrl = galleryPathMatch ? galleryPathMatch[1] : null;

    if (!coloIdFromUrl) {
      const hash = window.location.hash.substring(1);
      if (hash && !isNaN(hash)) {
        coloIdFromUrl = hash;
      }
    }

    if (coloIdFromUrl) {
      setTimeout(() => {
        openLightboxForId(coloIdFromUrl);
      }, 100);
    }

  } catch (error) {
    console.error("Erreur initialisation galerie:", error);
    if (galleryGridContainer) {
      galleryGridContainer.innerHTML = `<p>Erreur lors du chargement de la galerie. Veuillez réessayer. Détails : ${error.message}.</p>`;
    }
  }
}