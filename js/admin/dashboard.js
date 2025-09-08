// --- File: js/admin/dashboard.js (Fichier complet et réécrit) ---
import { qs, qsa, slugify } from "../utils/domUtils.js";
import { fetchAllSeriesData } from "../utils/fetchUtils.js";

let token = null;
let deletionQueue = [];
let allComments = []; // Stocke tous les commentaires en mémoire
let currentSortKey = "timestamp"; // Tri par défaut
let currentSortDirection = "desc"; // Tri par défaut

/**
 * Point d'entrée pour l'initialisation du tableau de bord.
 */
export function initDashboard(container, authToken) {
  token = authToken;
  renderDashboardLayout(container);
  setupDashboardListeners();
  router();
}

function renderDashboardLayout(container) {
  container.innerHTML = `
    <div class="container">
      <header class="dashboard-header">
        <nav class="dashboard-nav">
          <button class="nav-btn" data-view="moderation">Modération</button>
          <button class="nav-btn" data-view="cache">Gestion du Cache</button>
        </nav>
        <div class="header-actions">
          <button id="save-changes-btn">Sauvegarder (<span id="pending-count">0</span>)</button>
          <button id="logout-btn">Déconnexion</button>
        </div>
      </header>
      <main id="admin-content"></main>
    </div>
  `;
}

function setupDashboardListeners() {
  qs("#logout-btn").addEventListener("click", () => {
    if (
      deletionQueue.length > 0 &&
      confirm(
        "Vous avez des changements non sauvegardés. Voulez-vous quitter sans sauvegarder ?"
      )
    ) {
      sessionStorage.removeItem("admin_token");
      window.location.reload();
    } else if (deletionQueue.length === 0) {
      sessionStorage.removeItem("admin_token");
      window.location.reload();
    }
  });

  qs("#save-changes-btn").addEventListener("click", () => {
    sendDeletionQueue();
    alert("Changements sauvegardés ! La page va se recharger.");
    window.location.reload();
  });

  qsa(".nav-btn").forEach((btn) => {
    btn.addEventListener(
      "click",
      () => (window.location.hash = btn.dataset.view)
    );
  });

  window.addEventListener("hashchange", router);
  window.addEventListener("pagehide", sendDeletionQueue);
}

function router() {
  const view = window.location.hash.substring(1) || "moderation";
  qsa(".nav-btn").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.view === view)
  );

  const contentArea = qs("#admin-content");
  contentArea.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;

  if (view === "moderation") {
    displayModerationView(contentArea);
  } else if (view === "cache") {
    displayCacheView(contentArea);
  }
}

// --- Section Modération ---

async function displayModerationView(container) {
  qs("#save-changes-btn").style.display =
    deletionQueue.length > 0 ? "inline-block" : "none";
  container.innerHTML = `
    <table id="comments-table">
      <thead>
        <tr>
          <th class="sortable" data-sort-key="seriesSlug">Série</th>
          <th class="sortable" data-sort-key="chapterNumber">Chapitre</th>
          <th>Auteur</th>
          <th class="sortable" data-sort-key="timestamp">Date</th>
          <th>Commentaire</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  container.querySelector("thead").addEventListener("click", handleSortClick);

  try {
    const response = await fetch("/api/admin/comments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Accès non autorisé ou erreur serveur.");
    allComments = await response.json();

    if (allComments.length === 0) {
      container.innerHTML = `<p id="status-message">Aucun commentaire à modérer.</p>`;
      return;
    }

    sortAndRenderComments();
    container.addEventListener("click", handleModerationClick);
  } catch (error) {
    container.innerHTML = `<p id="status-message">Erreur: ${error.message}</p>`;
  }
}

function sortAndRenderComments() {
  // 1. Sort the data
  allComments.sort((a, b) => {
    let valA = a[currentSortKey];
    let valB = b[currentSortKey];

    // Handle different data types for sorting
    if (currentSortKey === "chapterNumber") {
      valA = parseFloat(valA);
      valB = parseFloat(valB);
    }

    let comparison = 0;
    if (valA > valB) {
      comparison = 1;
    } else if (valA < valB) {
      comparison = -1;
    }

    return currentSortDirection === "desc" ? comparison * -1 : comparison;
  });

  // 2. Render the table body
  const tbody = qs("#comments-table tbody");
  if (!tbody) return;

  tbody.innerHTML = allComments
    .map(
      (c) => `
      <tr data-comment-id="${c.id}" data-series-slug="${
        c.seriesSlug
      }" data-chapter-number="${c.chapterNumber}">
        <td>${c.seriesSlug}</td>
        <td>${c.chapterNumber}</td>
        <td>${c.username}</td>
        <td>${new Date(c.timestamp).toLocaleString("fr-FR")}</td>
        <td class="comment-content">${c.comment}</td>
        <td><button class="action-btn delete-btn" title="Marquer pour suppression"><i class="fas fa-trash-alt"></i></button></td>
      </tr>
    `
    )
    .join("");

  // 3. Update header UI
  qsa("#comments-table th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sortKey === currentSortKey) {
      th.classList.add(
        currentSortDirection === "asc" ? "sort-asc" : "sort-desc"
      );
    }
  });
}

function handleSortClick(e) {
  const header = e.target.closest("th.sortable");
  if (!header) return;

  const sortKey = header.dataset.sortKey;
  if (currentSortKey === sortKey) {
    currentSortDirection = currentSortDirection === "asc" ? "desc" : "asc";
  } else {
    currentSortKey = sortKey;
    currentSortDirection = "desc";
  }
  sortAndRenderComments();
}

function handleModerationClick(e) {
  const actionBtn = e.target.closest(".action-btn");
  if (!actionBtn) return;

  const row = actionBtn.closest("tr");
  const { commentId, seriesSlug, chapterNumber } = row.dataset;

  if (actionBtn.classList.contains("delete-btn")) {
    deletionQueue.push({ commentId, seriesSlug, chapterNumber });
    row.classList.add("marked-for-deletion");
    actionBtn.classList.replace("delete-btn", "undo-btn");
    actionBtn.title = "Annuler la suppression";
    actionBtn.innerHTML = `<i class="fas fa-undo"></i>`;
  } else if (actionBtn.classList.contains("undo-btn")) {
    deletionQueue = deletionQueue.filter(
      (item) => item.commentId !== commentId
    );
    row.classList.remove("marked-for-deletion");
    actionBtn.classList.replace("undo-btn", "delete-btn");
    actionBtn.title = "Marquer pour suppression";
    actionBtn.innerHTML = `<i class="fas fa-trash-alt"></i>`;
  }

  qs("#pending-count").textContent = deletionQueue.length;
  qs("#save-changes-btn").style.display =
    deletionQueue.length > 0 ? "inline-block" : "none";
}

function sendDeletionQueue() {
  if (deletionQueue.length === 0) return;
  console.log("[Dashboard] Envoi de la file de suppression :", deletionQueue);
  try {
    fetch("/api/admin/batch-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(deletionQueue),
      keepalive: true,
    });
    deletionQueue = [];
  } catch (e) {
    console.error("Erreur lors de l'envoi de la file de suppression", e);
  }
}

// --- Section Gestion du Cache ---

async function displayCacheView(container) {
  qs("#save-changes-btn").style.display = "none";
  try {
    const allSeries = await fetchAllSeriesData();
    allSeries.sort((a, b) => a.title.localeCompare(b.title));

    let seriesHtml = allSeries
      .map((series) => {
        const chapters = Object.entries(series.chapters)
          .filter(([, data]) => data.groups?.Big_herooooo)
          .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
        if (chapters.length === 0) return "";
        return `
        <div class="series-group">
          <div class="series-header">${series.title}</div>
          <ul class="chapters-list">
            ${chapters
              .map(
                ([num, data]) => `
              <li class="chapter-item" data-series-slug="${slugify(
                series.title
              )}" data-chapter-number="${num}">
                <div class="chapter-info">Chapitre ${num} <span class="chapter-title">${
                  data.title || ""
                }</span></div>
                <button class="purge-btn"><i class="fas fa-sync-alt"></i> Vider le cache</button>
              </li>
            `
              )
              .join("")}
          </ul>
        </div>
      `;
      })
      .join("");

    container.innerHTML =
      seriesHtml ||
      `<p id="status-message">Aucune série avec des chapitres à purger.</p>`;
    container.addEventListener("click", handleCacheClick);
  } catch (error) {
    container.innerHTML = `<p id="status-message">Erreur: ${error.message}</p>`;
  }
}

async function handleCacheClick(e) {
  const purgeBtn = e.target.closest(".purge-btn");
  if (!purgeBtn) return;

  const item = purgeBtn.closest(".chapter-item");
  const { seriesSlug, chapterNumber } = item.dataset;
  if (
    !confirm(`Vider le cache pour "${seriesSlug}", chapitre ${chapterNumber} ?`)
  )
    return;

  purgeBtn.disabled = true;
  purgeBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Purge...`;

  try {
    const res = await fetch("/api/admin/purge-cache", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ seriesSlug, chapterNumber }),
    });
    if (!res.ok)
      throw new Error((await res.json()).message || "Erreur serveur.");

    purgeBtn.style.backgroundColor = "#198754";
    purgeBtn.innerHTML = `<i class="fas fa-check"></i> Cache vidé !`;
  } catch (err) {
    purgeBtn.style.backgroundColor = "#dc3545";
    purgeBtn.innerHTML = `<i class="fas fa-times"></i> Erreur`;
    alert(`Erreur: ${err.message}`);
  } finally {
    setTimeout(() => {
      purgeBtn.disabled = false;
      purgeBtn.style.backgroundColor = "";
      purgeBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Vider le cache`;
    }, 3000);
  }
}
