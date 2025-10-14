// --- File: js/pages/series-detail/shared/downloadManager.js ---

import { qs, qsa, slugify } from "../../../utils/domUtils.js";
import { formatDuration } from "../../../utils/dateUtils.js";

let viewContainer = null;
let currentSeriesData = null;
let isDownloadMode = false;
let selectedChaptersForDownload = new Set();
let abortController = null;
let isDownloading = false;

// --- État et gestion des options de téléchargement ---
const compressionLevels = {
  extreme: {
    label: "Extrême",
    quality: 0.65,
    info: "Fichiers très petits, qualité réduite (~3-4 min pour 10 chap.)",
  },
  high: {
    label: "Élevée",
    quality: 0.75,
    info: "Bon compromis, fichiers petits (~2-3 min pour 10 chap.)",
  },
  medium: {
    label: "Moyenne",
    quality: 0.85,
    info: "Équilibre recommandé (~1 min pour 10 chap.)",
  },
  none: {
    label: "Aucune",
    quality: 1,
    info: "Très rapide, fichiers plus gros (~30s pour 10 chap.)",
  },
};
const compressionCycle = ["medium", "high", "extreme", "none"];

let downloadOptions = {
  format: "ZIP",
  compression: "medium",
};

const OPTIONS_STORAGE_KEY = "bigsolo_download_options";

function loadDownloadOptions() {
  try {
    const saved = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (["ZIP", "CBZ"].includes(parsed.format)) {
        downloadOptions.format = parsed.format;
      }
      if (compressionLevels[parsed.compression]) {
        downloadOptions.compression = parsed.compression;
      }
    }
  } catch (e) {
    console.error("Impossible de charger les options de téléchargement.", e);
  }
}

function saveDownloadOptions() {
  try {
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(downloadOptions));
  } catch (e) {
    console.error(
      "Impossible de sauvegarder les options de téléchargement.",
      e
    );
  }
}

function updateOptionsUI() {
  const popup = qs("#download-options-popup", viewContainer);
  if (!popup) return;

  qsa("#format-options .secondary-toggle-btn", popup).forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.value === downloadOptions.format
    );
  });

  const compressionBtn = qs("#compression-btn", popup);
  const compressionInfo = qs("#compression-info", popup);
  const currentCompression = compressionLevels[downloadOptions.compression];
  if (compressionBtn) {
    compressionBtn.innerHTML = `<i class="fas fa-file-archive"></i> <span class="text">${currentCompression.label}</span>`;
  }
  if (compressionInfo) {
    compressionInfo.textContent = currentCompression.info;
  }
}

// --- GESTION DU CHARGEMENT DES SCRIPTS EXTERNES ---
function ensureScriptsLoaded() {
  return new Promise((resolve, reject) => {
    if (typeof JSZip !== "undefined" && typeof saveAs !== "undefined")
      return resolve();
    const timeout = 15000;
    const interval = 100;
    let elapsedTime = 0;
    const checker = setInterval(() => {
      if (typeof JSZip !== "undefined" && typeof saveAs !== "undefined") {
        clearInterval(checker);
        resolve();
      } else {
        elapsedTime += interval;
        if (elapsedTime >= timeout) {
          clearInterval(checker);
          reject(
            new Error(
              "Le chargement des bibliothèques de téléchargement a échoué (timeout)."
            )
          );
        }
      }
    }, interval);
  });
}

// --- GESTION DE L'INTERFACE DE PROGRESSION ---
function setupProgressUI(chapters) {
  const logList = qs("#progress-log-list");
  if (!logList) return new Map();

  const optionsSummary = qs("#progress-options-summary");
  if (optionsSummary) {
    optionsSummary.innerHTML = `Format: <strong>${
      downloadOptions.format
    }</strong>, Compression: <strong>${
      compressionLevels[downloadOptions.compression].label
    }</strong>`;
  }

  logList.innerHTML = `
        <li class="progress-log-entry" data-phase="download">
            <span class="log-message">Téléchargement des chapitres</span>
            <span class="log-status"></span>
        </li>
        <ul class="progress-sublist">
            ${chapters
              .map(
                (id) =>
                  `<li class="progress-log-entry pending" data-chapter-id="${id}"><span class="log-message">Chapitre ${id}</span><span class="log-status">[En attente]</span></li>`
              )
              .join("")}
        </ul>
        <li class="progress-log-entry" data-phase="assembly">
            <span class="log-message">Recompression & Assemblage</span>
            <span class="log-status"></span>
        </li>
        <li class="progress-log-entry" data-phase="compression">
            <span class="log-message">Création de l'archive finale</span>
            <span class="log-status"></span>
        </li>
    `;

  const logElements = new Map();
  qsa("[data-chapter-id]", logList).forEach((li) =>
    logElements.set(li.dataset.chapterId, li)
  );
  qsa("[data-phase]", logList).forEach((li) =>
    logElements.set(li.dataset.phase, li)
  );
  return logElements;
}

function updateLogStatus(logItem, statusText, className) {
  if (!logItem) return;
  const statusSpan = logItem.querySelector(".log-status");
  logItem.className = `progress-log-entry ${className}`;
  if (statusSpan) statusSpan.textContent = `[${statusText}]`;
}

/**
 * Recompresse une image blob à une qualité donnée.
 * @param {Blob} imageBlob - Le blob de l'image originale.
 * @param {number} quality - La qualité de 0.0 à 1.0.
 * @returns {Promise<Blob>} Le nouveau blob de l'image recompressée.
 */
async function recompressImage(imageBlob, quality) {
  const img = new Image();
  const url = URL.createObjectURL(imageBlob);

  const loadPromise = new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image pour la recompression."));
    };
  });

  img.src = url;
  await loadPromise;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
}

// --- LOGIQUE PRINCIPALE DE TÉLÉCHARGEMENT ---
async function startDownloadProcess() {
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const cancelBtn = qs("#cancel-download-btn", viewContainer);
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const optionsBtn = qs("#download-options-btn", viewContainer);
  const overlay = qs("#download-modal-overlay");
  const originalBtnHTML = downloadBtn.innerHTML;

  try {
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Préparation...`;
    await ensureScriptsLoaded();
  } catch (error) {
    alert(error.message);
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalBtnHTML;
    return;
  }

  isDownloading = true;
  abortController = new AbortController();
  const signal = abortController.signal;

  const popup = qs("#download-progress-popup", viewContainer);
  const etaSpan = qs("#progress-eta", popup);

  if (popup) popup.classList.add("visible");
  if (overlay) overlay.classList.add("visible");
  if (etaSpan) etaSpan.textContent = "Estimation en cours...";
  if (toggleBtn) toggleBtn.style.display = "none";
  if (optionsBtn) optionsBtn.style.display = "none";
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  const masterZip = new JSZip();
  const chaptersToDownload = Array.from(selectedChaptersForDownload);
  const totalChapters = chaptersToDownload.length;
  let timeEstimates = [];
  let processedChaptersCount = 0;

  const logElements = setupProgressUI(chaptersToDownload);

  console.log(
    "[Action Log] Démarrage du téléchargement avec les options:",
    downloadOptions
  );

  try {
    const downloadPhase = logElements.get("download");
    updateLogStatus(downloadPhase, "En cours", "in-progress");

    const CONCURRENCY_LIMIT = 4;
    let queue = [...chaptersToDownload];
    const downloadedZips = [];

    const processChapter = async (chapterId) => {
      if (signal.aborted) throw new DOMException("Annulé", "AbortError");
      const logItem = logElements.get(chapterId);
      updateLogStatus(logItem, "En cours", "in-progress");
      const chapterStartTime = Date.now();
      const chapterData = currentSeriesData.chapters[chapterId];
      const imgchestId = chapterData.groups?.Big_herooooo?.split("/").pop();
      if (!imgchestId) throw new Error(`Pas d'ID pour Ch. ${chapterId}`);

      const zipResponse = await fetch(`/api/proxy-zip?id=${imgchestId}`, {
        signal,
      });
      if (!zipResponse.ok) throw new Error(`Échec fetch pour Ch. ${chapterId}`);

      const chapterZipBlob = await zipResponse.blob();
      const chapterZip = await JSZip.loadAsync(chapterZipBlob);
      downloadedZips.push({ chapterId, chapterZip });

      processedChaptersCount++;
      timeEstimates.push(Date.now() - chapterStartTime);
      const averageTime =
        timeEstimates.reduce((a, b) => a + b, 0) / timeEstimates.length;
      const chaptersRemaining = totalChapters - processedChaptersCount;
      const estimatedTimeMs = chaptersRemaining * averageTime;

      if (etaSpan)
        etaSpan.textContent = `~${formatDuration(estimatedTimeMs)} restantes`;
      downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Téléchargement ${processedChaptersCount}/${totalChapters}`;
      updateLogStatus(logItem, "Téléchargé", "success");
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(Promise.resolve());
    const runTask = (workerPromise) => {
      if (queue.length > 0) {
        const chapterId = queue.shift();
        return workerPromise.then(() => runTask(processChapter(chapterId)));
      }
      return workerPromise;
    };
    await Promise.all(workers.map(runTask));
    if (signal.aborted) throw new DOMException("Annulé", "AbortError");
    updateLogStatus(downloadPhase, "Terminé", "success");

    const assemblyPhase = logElements.get("assembly");
    updateLogStatus(assemblyPhase, "En cours", "in-progress");
    downloadBtn.innerHTML = `<i class="fas fa-cogs"></i> Assemblage...`;

    downloadedZips.sort(
      (a, b) => parseFloat(a.chapterId) - parseFloat(b.chapterId)
    );

    // - Debut modification (Correction de la logique de compression d'image)
    const compressionOption = downloadOptions.compression;
    const quality = compressionLevels[compressionOption].quality;
    const shouldRecompress = compressionOption !== "none";
    console.log(
      `[Action Log] Recompression activée: ${shouldRecompress}, Qualité JPEG: ${quality}`
    );

    let totalImages = 0;
    downloadedZips.forEach(({ chapterZip }) => {
      chapterZip.forEach((file) => {
        if (!file.dir) totalImages++;
      });
    });
    let recompressedCount = 0;

    for (const { chapterId, chapterZip } of downloadedZips) {
      if (signal.aborted) throw new DOMException("Annulé", "AbortError");
      const chapterFolder = masterZip.folder(`Ch. ${chapterId}`);
      const files = [];
      chapterZip.forEach((relativePath, file) => {
        if (!file.dir) files.push(file);
      });
      files.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );

      let pageCounter = 1;
      for (const file of files) {
        const originalBlob = await file.async("blob");
        let finalBlob = originalBlob;

        // Correction: vérifier l'extension du fichier, pas le type du blob
        if (shouldRecompress && /\.(jpe?g|png|webp)$/i.test(file.name)) {
          console.log(
            `[Action Log] Appel de recompressImage pour ${file.name}`
          );
          finalBlob = await recompressImage(originalBlob, quality);
        }

        const extension = file.name.split(".").pop() || "jpg";
        const newFilename = `${String(pageCounter++).padStart(
          4,
          "0"
        )}.${extension}`;
        chapterFolder.file(newFilename, finalBlob);
        recompressedCount++;
        updateLogStatus(
          assemblyPhase,
          `${recompressedCount}/${totalImages}`,
          "in-progress"
        );
      }
    }
    // - Fin modification

    updateLogStatus(assemblyPhase, "Terminé", "success");

    const compressionPhase = logElements.get("compression");
    updateLogStatus(compressionPhase, "0%", "in-progress");
    downloadBtn.innerHTML = `<i class="fas fa-file-archive"></i> Archivage...`;

    const finalZipBlob = await masterZip.generateAsync(
      {
        type: "blob",
        compression: "STORE", // On utilise STORE, car la recompression d'image est plus efficace
      },
      (metadata) => {
        if (signal.aborted)
          throw new DOMException("Annulé pendant l'archivage", "AbortError");
        if (metadata.percent)
          updateLogStatus(
            compressionPhase,
            `${Math.round(metadata.percent)}%`,
            "in-progress"
          );
      }
    );
    updateLogStatus(compressionPhase, "Terminé", "success");

    const fileExtension = downloadOptions.format.toLowerCase();
    saveAs(
      finalZipBlob,
      `BigSolo - ${slugify(
        currentSeriesData.title
      )} - Ch ${chaptersToDownload.join("-")}.${fileExtension}`
    );

    if (etaSpan) etaSpan.textContent = "Téléchargement terminé !";
  } catch (error) {
    if (error.name !== "AbortError") {
      if (etaSpan) etaSpan.textContent = "Erreur !";
      alert(`Une erreur est survenue : ${error.message}`);
      console.error(error);
    } else {
      if (etaSpan) etaSpan.textContent = "Annulé.";
    }
  } finally {
    // - Debut modification (Correction de la réinitialisation de l'état)
    isDownloading = false;
    abortController = null;

    setTimeout(() => {
      if (popup) popup.classList.remove("visible");
      if (overlay) overlay.classList.remove("visible");
    }, 3000);

    // On réinitialise l'interface à son état "mode téléchargement actif"
    if (downloadBtn) {
      downloadBtn.innerHTML = originalBtnHTML;
      updateDownloadButtonState();
    }
    if (toggleBtn) toggleBtn.style.display = "inline-flex";
    if (optionsBtn) optionsBtn.style.display = "inline-flex";
    // - Fin modification
  }
}

// --- Fonctions de gestion de l'interface ---
function handleChapterSelection(chapterId, cardElement) {
  if (cardElement.classList.contains("licensed-chapter")) return;
  if (selectedChaptersForDownload.has(chapterId)) {
    selectedChaptersForDownload.delete(chapterId);
    cardElement.classList.remove("selected-for-download");
  } else {
    selectedChaptersForDownload.add(chapterId);
    cardElement.classList.add("selected-for-download");
  }
  updateDownloadButtonState();
}

function updateDownloadButtonState() {
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  if (!downloadBtn) return;
  const count = selectedChaptersForDownload.size;
  downloadBtn.disabled = count === 0;
  const textSpan = qs(".download-btn-text", downloadBtn);
  if (textSpan) {
    textSpan.textContent =
      count > 0 ? ` Télécharger (${count})` : ` Télécharger`;
  }
}

function toggleDownloadMode() {
  isDownloadMode = !isDownloadMode;
  const container = qs(".chapters-list-container", viewContainer);
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const optionsBtn = qs("#download-options-btn", viewContainer);
  const sortBtn = qs("#sort-chapter-btn", viewContainer);
  const searchInput = qs("#search-chapter-input", viewContainer);

  if (container) container.classList.toggle("download-mode", isDownloadMode);
  if (downloadBtn)
    downloadBtn.style.display = isDownloadMode ? "inline-flex" : "none";
  if (optionsBtn)
    optionsBtn.style.display = isDownloadMode ? "inline-flex" : "none";

  if (toggleBtn) {
    toggleBtn.classList.toggle("active", isDownloadMode);
    toggleBtn.title = isDownloadMode
      ? "Quitter le mode téléchargement"
      : "Activer le mode téléchargement";
    toggleBtn.style.display = "inline-flex"; // S'assurer qu'il est visible
  }

  if (isDownloadMode) {
    if (sortBtn) sortBtn.style.display = "none";
    if (searchInput) searchInput.parentElement.style.display = "none";
  } else {
    if (sortBtn) sortBtn.style.display = "flex";
    if (searchInput) searchInput.parentElement.style.display = "block";
    selectedChaptersForDownload.clear();
    if (container) {
      qsa(".chapter-card-list-item.selected-for-download", container).forEach(
        (card) => {
          card.classList.remove("selected-for-download");
        }
      );
    }
    const optionsPopup = qs("#download-options-popup", viewContainer);
    if (optionsPopup) optionsPopup.classList.remove("visible");
  }
  updateDownloadButtonState();
}

export function initDownloadManager(_viewContainer, _seriesData) {
  viewContainer = _viewContainer;
  currentSeriesData = _seriesData;

  if (!document.getElementById("download-modal-overlay")) {
    const overlay = document.createElement("div");
    overlay.id = "download-modal-overlay";
    overlay.className = "download-modal-overlay";
    document.body.appendChild(overlay);
  }

  if (!document.getElementById("jszip-script")) {
    const jszipScript = document.createElement("script");
    jszipScript.id = "jszip-script";
    jszipScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(jszipScript);
  }
  if (!document.getElementById("filesaver-script")) {
    const fileSaverScript = document.createElement("script");
    fileSaverScript.id = "filesaver-script";
    fileSaverScript.src =
      "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";
    document.head.appendChild(fileSaverScript);
  }

  const downloadActions = qs(".download-actions", viewContainer);
  if (downloadActions) {
    qs("#toggle-download-mode-btn", downloadActions)?.addEventListener(
      "click",
      toggleDownloadMode
    );
    qs("#download-selected-btn", downloadActions)?.addEventListener(
      "click",
      startDownloadProcess
    );
    qs("#cancel-download-btn", downloadActions)?.addEventListener(
      "click",
      () => {
        if (abortController) abortController.abort();
      }
    );
  }

  const chapterContainer = qs(".chapters-list-container", viewContainer);
  if (chapterContainer) {
    chapterContainer.addEventListener("click", (e) => {
      if (!isDownloadMode) return;
      const card = e.target.closest(".chapter-card-list-item");
      if (card && card.dataset.chapterId) {
        e.preventDefault();
        e.stopPropagation();
        handleChapterSelection(card.dataset.chapterId, card);
      }
    });
  }

  const optionsBtn = qs("#download-options-btn", viewContainer);
  const optionsPopup = qs("#download-options-popup", viewContainer);
  if (optionsBtn && optionsPopup) {
    optionsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      optionsPopup.classList.toggle("visible");
    });

    document.addEventListener("click", (e) => {
      if (!optionsPopup.contains(e.target) && !optionsBtn.contains(e.target)) {
        optionsPopup.classList.remove("visible");
      }
    });

    qsa("#format-options .secondary-toggle-btn", optionsPopup).forEach(
      (btn) => {
        btn.addEventListener("click", () => {
          downloadOptions.format = btn.dataset.value;
          saveDownloadOptions();
          updateOptionsUI();
        });
      }
    );

    const compressionBtn = qs("#compression-btn", optionsPopup);
    if (compressionBtn) {
      compressionBtn.addEventListener("click", () => {
        const currentIndex = compressionCycle.indexOf(
          downloadOptions.compression
        );
        const nextIndex = (currentIndex + 1) % compressionCycle.length;
        downloadOptions.compression = compressionCycle[nextIndex];
        saveDownloadOptions();
        updateOptionsUI();
      });
    }
  }

  loadDownloadOptions();
  updateOptionsUI();
}
