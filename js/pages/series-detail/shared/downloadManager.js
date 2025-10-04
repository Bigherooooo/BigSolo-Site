// --- File: js/pages/series-detail/shared/downloadManager.js ---

import { qs, qsa, slugify } from "../../../utils/domUtils.js";
import { formatDuration } from "../../../utils/dateUtils.js";

let viewContainer = null;
let currentSeriesData = null;
let isDownloadMode = false;
let selectedChaptersForDownload = new Set();
let abortController = null;
let isDownloading = false;

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

  logList.innerHTML = `
        <li class="progress-phase" data-phase="download">
            <div class="progress-log-entry">
                <span class="log-message">Téléchargement des chapitres</span>
                <span class="log-status"></span>
            </div>
            <ul class="progress-sublist">
                ${chapters
                  .map(
                    (id) =>
                      `<li class="progress-log-entry pending" data-chapter-id="${id}"><span class="log-message">Chapitre ${id}</span><span class="log-status">[En attente]</span></li>`
                  )
                  .join("")}
            </ul>
        </li>
        <li class="progress-phase" data-phase="assembly">
            <div class="progress-log-entry pending">
                <span class="log-message">Assemblage de l'archive</span>
                <span class="log-status"></span>
            </div>
        </li>
        <li class="progress-phase" data-phase="compression">
            <div class="progress-log-entry pending">
                <span class="log-message">Compression finale</span>
                <span class="log-status"></span>
            </div>
        </li>
    `;

  const logElements = new Map();
  qsa(".progress-sublist li", logList).forEach((li) => {
    logElements.set(li.dataset.chapterId, li);
  });
  return logElements;
}

function updateLogStatus(logItem, statusText, className) {
  if (!logItem) return;
  const statusSpan = logItem.querySelector(".log-status");
  logItem.className = `progress-log-entry ${className}`;
  if (statusSpan) statusSpan.textContent = `[${statusText}]`;
}

// --- LOGIQUE PRINCIPALE DE TÉLÉCHARGEMENT ---
async function startDownloadProcess() {
  const downloadBtn = qs("#download-selected-btn", viewContainer);
  const cancelBtn = qs("#cancel-download-btn", viewContainer);
  const toggleBtn = qs("#toggle-download-mode-btn", viewContainer);
  const originalText = downloadBtn.innerHTML;

  try {
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Préparation...`;
    await ensureScriptsLoaded();
  } catch (error) {
    alert(error.message);
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
    return;
  }

  isDownloading = true;
  abortController = new AbortController();
  const signal = abortController.signal;

  const popup = qs("#download-progress-popup", viewContainer);
  const etaSpan = qs("#progress-eta", popup);

  if (popup) popup.classList.add("visible");
  if (etaSpan) etaSpan.textContent = "Estimation en cours...";
  if (toggleBtn) toggleBtn.style.display = "none";
  if (cancelBtn) cancelBtn.style.display = "inline-flex";

  const masterZip = new JSZip();
  const chaptersToDownload = Array.from(selectedChaptersForDownload);
  const totalChapters = chaptersToDownload.length;
  let timeEstimates = [];
  let processedChaptersCount = 0;

  const logElements = setupProgressUI(chaptersToDownload);

  try {
    const CONCURRENCY_LIMIT = 4;
    const queue = [...chaptersToDownload];

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
      return { chapterId, chapterZip };
    };

    const workers = Array(CONCURRENCY_LIMIT).fill(Promise.resolve());

    const runTask = (workerPromise) => {
      if (queue.length > 0) {
        const chapterId = queue.shift();
        if (queue.length < CONCURRENCY_LIMIT) {
          queue.forEach((nextId) =>
            updateLogStatus(logElements.get(nextId), "Prochain", "pending")
          );
        }
        return workerPromise.then(() => runTask(processChapter(chapterId)));
      }
      return workerPromise;
    };

    queue
      .slice(0, CONCURRENCY_LIMIT)
      .forEach((id) =>
        updateLogStatus(logElements.get(id), "En cours", "in-progress")
      );
    await Promise.all(workers.map(runTask));

    if (signal.aborted) throw new DOMException("Annulé", "AbortError");

    const assemblyPhase = qs('.progress-phase[data-phase="assembly"]');
    updateLogStatus(assemblyPhase, "En cours", "in-progress");
    downloadBtn.innerHTML = `<i class="fas fa-cogs"></i> Assemblage...`;

    // La partie assemblage est très rapide, on ne la détaille pas en %
    await new Promise((resolve) => setTimeout(resolve, 200));
    updateLogStatus(assemblyPhase, "Terminé", "success");

    const compressionPhase = qs('.progress-phase[data-phase="compression"]');
    updateLogStatus(compressionPhase, "0%", "in-progress");
    downloadBtn.innerHTML = `<i class="fas fa-file-archive"></i> Compression...`;

    const finalZipBlob = await masterZip.generateAsync(
      { type: "blob" },
      (metadata) => {
        if (signal.aborted)
          throw new DOMException("Annulé pendant la compression", "AbortError");
        if (metadata.percent) {
          updateLogStatus(
            compressionPhase,
            `${Math.round(metadata.percent)}%`,
            "in-progress"
          );
        }
      }
    );
    updateLogStatus(compressionPhase, "Terminé", "success");

    saveAs(
      finalZipBlob,
      `BigSolo - ${slugify(
        currentSeriesData.title
      )} - Ch ${chaptersToDownload.join("-")}.zip`
    );

    if (etaSpan) etaSpan.textContent = "Téléchargement terminé !";
    setTimeout(() => {
      if (popup) popup.classList.remove("visible");
    }, 2000);
  } catch (error) {
    if (error.name !== "AbortError") {
      if (etaSpan) etaSpan.textContent = "Erreur !";
      alert(`Une erreur est survenue : ${error.message}`);
    } else {
      if (etaSpan) etaSpan.textContent = "Annulé.";
      alert("Le téléchargement a été annulé.");
    }
    if (popup) popup.classList.remove("visible");
  } finally {
    // Bloc de nettoyage centralisé pour restaurer l'interface dans tous les cas.
    isDownloading = false;
    abortController = null;

    // Cacher le popup et le bouton annuler
    if (popup) popup.classList.remove("visible");
    if (cancelBtn) cancelBtn.style.display = "none";

    // Réafficher le bouton pour activer/désactiver le mode téléchargement
    if (toggleBtn) toggleBtn.style.display = "inline-flex";

    // Quitter proprement le mode téléchargement (ce qui masquera le bouton de téléchargement, etc.)
    if (isDownloadMode) {
      toggleDownloadMode();
    }
  }
}

// --- Fonctions de gestion de l'interface (INCHANGÉES) ---
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
  const infoMessage = qs("#download-mode-info", viewContainer);
  const sortBtn = qs("#sort-chapter-btn", viewContainer);
  const searchInput = qs("#search-chapter-input", viewContainer);
  if (container) container.classList.toggle("download-mode", isDownloadMode);
  if (infoMessage)
    infoMessage.style.display = isDownloadMode ? "block" : "none";
  if (downloadBtn)
    downloadBtn.style.display = isDownloadMode ? "inline-flex" : "none";
  if (toggleBtn) {
    toggleBtn.classList.toggle("active", isDownloadMode);
    toggleBtn.title = isDownloadMode
      ? "Quitter le mode téléchargement"
      : "Activer le mode téléchargement";
  }
  if (isDownloadMode) {
    if (sortBtn) sortBtn.style.display = "none";
    if (searchInput) searchInput.style.display = "none";
  } else {
    if (sortBtn) sortBtn.style.display = "flex";
    if (searchInput) searchInput.style.display = "inline-block";
    selectedChaptersForDownload.clear();
    if (container) {
      qsa(".chapter-card-list-item.selected-for-download", container).forEach(
        (card) => {
          card.classList.remove("selected-for-download");
        }
      );
    }
  }
  updateDownloadButtonState();
}
function toggleProgressPopup() {
  const popup = qs("#download-progress-popup", viewContainer);
  if (popup) {
    popup.classList.toggle("visible");
  }
}
export function initDownloadManager(_viewContainer, _seriesData) {
  viewContainer = _viewContainer;
  currentSeriesData = _seriesData;
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
    const toggleBtn = qs("#toggle-download-mode-btn", downloadActions);
    const downloadBtn = qs("#download-selected-btn", downloadActions);
    const cancelBtn = qs("#cancel-download-btn", downloadActions);
    if (toggleBtn) toggleBtn.addEventListener("click", toggleDownloadMode);
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        if (isDownloading) {
          toggleProgressPopup();
        } else {
          startDownloadProcess();
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (abortController) abortController.abort();
      });
    }
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
}
