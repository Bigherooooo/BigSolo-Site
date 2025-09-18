// --- File: js/admin/dashboard.js ---
import { qs, qsa, slugify } from "../utils/domUtils.js";
import { fetchAllSeriesData } from "../utils/fetchUtils.js";

let token = null;
let deletionQueue = [];
let allComments = []; // Stocke tous les commentaires en mémoire pour le tri
let currentSortKey = "timestamp"; // Clé de tri par défaut
let currentSortDirection = "desc"; // Direction de tri par défaut

/**
 * Point d'entrée pour l'initialisation du tableau de bord.
 * @param {HTMLElement} container - L'élément #app-root.
 * @param {string} authToken - Le jeton d'authentification.
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
          <button class="nav-btn" data-view="devtools">Dev Tools</button>
        </nav>
        <div class="header-actions">
          <button id="save-changes-btn">Sauvegarder (<span id="pending-count">0</span>)</button>
          <button id="logout-btn">Déconnexion</button>
        </div>
      </header>
      <main id="admin-content"></main>
    </div>
    <!-- NOUVEAU : Placeholder pour la modale KV -->
    <div id="kv-value-modal-overlay" class="kv-value-modal-overlay"></div>
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

  switch (view) {
    case "moderation":
      displayModerationView(contentArea);
      break;
    case "cache":
      displayCacheView(contentArea);
      break;
    case "devtools":
      displayDevToolsView(contentArea);
      break;
    default:
      displayModerationView(contentArea);
      break;
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
  allComments.sort((a, b) => {
    let valA = a[currentSortKey];
    let valB = b[currentSortKey];

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

    purgeBtn.style.backgroundColor = "var(--admin-success)";
    purgeBtn.innerHTML = `<i class="fas fa-check"></i> Cache vidé !`;
  } catch (err) {
    purgeBtn.style.backgroundColor = "var(--admin-danger)";
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

// --- Section Dev Tools ---
async function displayDevToolsView(container) {
  qs("#save-changes-btn").style.display = "none";
  container.innerHTML = `
    <section class="kv-viewer-section" data-namespace="INTERACTIONS_LOG">
      <div class="kv-header"><h2 class="kv-title">INTERACTIONS_LOG <span class="count"></span></h2><div class="kv-actions"><button id="clear-logs-btn" class="nav-btn danger-btn"><i class="fas fa-trash-alt"></i> Vider ce namespace</button></div></div>
      <div class="kv-content-wrapper"><div class="loading-container"><div class="spinner"></div></div></div>
    </section>
    <section class="kv-viewer-section" data-namespace="INTERACTIONS_CACHE">
      <div class="kv-header"><h2 class="kv-title">INTERACTIONS_CACHE <span class="count"></span></h2></div>
      <div class="kv-content-wrapper"><div class="loading-container"><div class="spinner"></div></div></div>
    </section>
    <section class="kv-viewer-section" data-namespace="IMG_CHEST_CACHE">
      <div class="kv-header"><h2 class="kv-title">IMG_CHEST_CACHE <span class="count"></span></h2></div>
      <div class="kv-content-wrapper"><div class="loading-container"><div class="spinner"></div></div></div>
    </section>
  `;

  loadKvNamespaceData("INTERACTIONS_LOG");
  loadKvNamespaceData("INTERACTIONS_CACHE");
  loadKvNamespaceData("IMG_CHEST_CACHE");

  container.addEventListener("click", async (e) => {
    if (e.target.closest("#clear-logs-btn")) {
      await handleClearLogs(e.target.closest("#clear-logs-btn"));
    }
    if (e.target.closest(".delete-kv-key-btn")) {
      await handleDeletKey(e.target.closest(".delete-kv-key-btn"));
    }
    // NOUVEAU : Gérer le clic pour voir la valeur complète
    if (e.target.closest(".view-kv-value-btn")) {
      handleViewKeyValue(e.target.closest(".view-kv-value-btn"));
    }
  });
}

async function loadKvNamespaceData(namespaceName) {
  const section = qs(`.kv-viewer-section[data-namespace="${namespaceName}"]`);
  if (!section) return;

  let contentArea = section.querySelector(".kv-content-wrapper");
  if (!contentArea) {
    const spinnerContainer = section.querySelector(".loading-container");
    contentArea = document.createElement("div");
    contentArea.className = "kv-content-wrapper";
    if (spinnerContainer) spinnerContainer.replaceWith(contentArea);
    else section.appendChild(contentArea);
  }
  contentArea.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;

  try {
    const response = await fetch(
      `/api/admin/kv-viewer?namespace=${namespaceName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error(`Erreur ${response.status}`);
    const data = await response.json();

    section.querySelector(
      ".count"
    ).textContent = `(${data.count} entrées affichées)`;

    if (data.count === 0) {
      contentArea.innerHTML = `<p id="status-message">Ce namespace est vide.</p>`;
      return;
    }

    const isDeletable = namespaceName.toUpperCase() === "INTERACTIONS_LOG";

    const tableHtml = `
      <div class="kv-table-wrapper">
        <table>
          <thead><tr><th>Clé</th><th>Valeur</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.items
              .map((item) => {
                // On stocke la valeur complète dans un attribut data
                const fullValue =
                  typeof item.value === "string"
                    ? item.value
                    : JSON.stringify(item.value);
                return `
                <tr data-key="${
                  item.key
                }" data-full-value="${encodeURIComponent(fullValue)}">
                    <td>${item.key}</td>
                    <td>${truncateValue(item.value)}</td>
                    <td>
                        <button class="action-btn view-kv-value-btn" title="Voir la valeur complète"><i class="fas fa-eye"></i></button>
                        ${
                          isDeletable
                            ? `<button class="action-btn delete-btn delete-kv-key-btn" title="Supprimer cette clé"><i class="fas fa-trash-alt"></i></button>`
                            : ""
                        }
                    </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${
        data.hasMore
          ? `<p><em>Note : Seules les 100 premières entrées sont affichées.</em></p>`
          : ""
      }
    `;
    contentArea.innerHTML = tableHtml;
  } catch (error) {
    contentArea.innerHTML = `<p id="status-message">Erreur: ${error.message}</p>`;
  }
}

function truncateValue(value, maxLength = 100) {
  // Raccourci pour encourager le clic
  let stringValue = typeof value === "string" ? value : JSON.stringify(value);
  if (stringValue.length > maxLength) {
    return stringValue.substring(0, maxLength) + "...";
  }
  return stringValue;
}

function handleViewKeyValue(button) {
  const row = button.closest("tr");
  const key = row.dataset.key;
  const fullValue = decodeURIComponent(row.dataset.fullValue);

  let formattedValue = fullValue;
  // Essayer de formater joliment si c'est du JSON
  try {
    const jsonObj = JSON.parse(fullValue);
    formattedValue = JSON.stringify(jsonObj, null, 2); // 2 espaces d'indentation
  } catch (e) {
    // Ce n'est pas du JSON, on l'affiche tel quel
  }

  const modalOverlay = qs("#kv-value-modal-overlay");
  modalOverlay.innerHTML = `
        <div class="kv-value-modal">
            <div class="kv-modal-header">
                <h3 class="kv-modal-title">${key}</h3>
                <button class="kv-modal-close">&times;</button>
            </div>
            <div class="kv-modal-content">
                <pre>${formattedValue}</pre>
            </div>
        </div>
    `;

  modalOverlay.classList.add("is-visible");

  // Attacher les écouteurs pour la fermeture
  const closeModal = () => modalOverlay.classList.remove("is-visible");
  qs(".kv-modal-close", modalOverlay).addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

async function handleDeletKey(button) {
  const row = button.closest("tr");
  const key = row.dataset.key;
  const section = button.closest(".kv-viewer-section");
  const namespace = section.dataset.namespace;

  if (!confirm(`Êtes-vous sûr de vouloir supprimer la clé "${key}" ?`)) return;

  button.disabled = true;
  button.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

  try {
    const response = await fetch("/api/admin/delete-kv-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ namespace, key }),
    });

    if (!response.ok) {
      // CORRECTION: On gère les réponses non-JSON en cas d'erreur
      let errorMsg = `Erreur ${response.status}`;
      try {
        const result = await response.json();
        errorMsg = result.message || errorMsg;
      } catch (e) {
        // La réponse n'était pas du JSON, on utilise le texte brut
        errorMsg = await response.text();
      }
      throw new Error(errorMsg);
    }

    row.style.transition = "opacity 0.3s ease";
    row.style.opacity = "0";
    setTimeout(() => row.remove(), 300);
  } catch (error) {
    alert(`Erreur lors de la suppression : ${error.message}`);
    button.disabled = false;
    button.innerHTML = `<i class="fas fa-trash-alt"></i>`;
  }
}

async function handleClearLogs(btn) {
  if (
    !confirm(
      "ATTENTION : Cette action va supprimer TOUTES les entrées dans INTERACTIONS_LOG. Êtes-vous sûr ?"
    )
  )
    return;

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Vidage en cours...`;

  try {
    const response = await fetch("/api/admin/clear-logs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Erreur serveur");

    btn.style.backgroundColor = "var(--admin-success)";
    btn.innerHTML = `<i class="fas fa-check"></i> ${result.deletedCount} logs vidés !`;
    alert(result.message);

    loadKvNamespaceData("INTERACTIONS_LOG");
  } catch (error) {
    btn.innerHTML = `<i class="fas fa-times"></i> Erreur`;
    alert(`Erreur : ${error.message}`);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.style.backgroundColor = "";
      btn.innerHTML = `<i class="fas fa-trash-alt"></i> Vider ce namespace`;
    }, 5000);
  }
}
