// js/pages/dashboard.js
import { fetchAllSeriesData } from "../utils/fetchUtils.js";
import { slugify, qs, qsa } from "../utils/domUtils.js";

const token = sessionStorage.getItem("admin_token");
let deletionQueue = [];

// --- FONCTIONS DE RENDU DES VUES ---

function renderModerationView() {
  const contentArea = qs("#admin-content");
  qs("#save-changes-btn").style.display =
    deletionQueue.length > 0 ? "inline-block" : "none";

  contentArea.innerHTML = `
        <p id="status">Chargement des commentaires...</p>
        <table id="comments-table" style="display: none">
            <thead>
                <tr>
                    <th>Série / Chapitre</th>
                    <th>Auteur</th>
                    <th>Commentaire</th>
                    <th>Date</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody id="comments-tbody"></tbody>
        </table>
    `;
  loadAndDisplayComments();
}

function renderCacheManagementView() {
  const contentArea = qs("#admin-content");
  qs("#save-changes-btn").style.display = "none"; // Pas besoin de ce bouton ici

  contentArea.innerHTML = `
        <p id="status">Chargement de la liste des séries et chapitres...</p>
        <div id="cache-list-container"></div>
    `;
  loadAndDisplayCacheList();
}

// --- LOGIQUE SPÉCIFIQUE À LA VUE MODÉRATION ---

async function loadAndDisplayComments() {
  const statusEl = qs("#status");
  const tableEl = qs("#comments-table");
  const tbodyEl = qs("#comments-tbody");

  try {
    const response = await fetch("/api/admin/comments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Erreur serveur: ${response.status}`);
    const comments = await response.json();

    statusEl.style.display = "none";
    tableEl.style.display = "table";
    tbodyEl.innerHTML = "";

    if (comments.length === 0) {
      statusEl.textContent = "Aucun commentaire à modérer.";
      statusEl.style.display = "block";
      tableEl.style.display = "none";
      return;
    }

    comments.sort((a, b) => b.timestamp - a.timestamp);

    comments.forEach((comment) => {
      const row = document.createElement("tr");
      row.dataset.commentId = comment.id;
      row.dataset.seriesSlug = comment.seriesSlug;
      row.dataset.chapterNumber = comment.chapterNumber;

      const date = new Date(comment.timestamp).toLocaleString("fr-FR");

      // Cellule Série / Chapitre
      const cellSeries = document.createElement("td");
      const strong = document.createElement("strong");
      strong.innerText = `Ch. ${comment.chapterNumber}`;
      cellSeries.append(
        comment.seriesSlug,
        document.createElement("br"),
        strong
      );

      // Cellule Auteur
      const cellUsername = document.createElement("td");
      cellUsername.innerText = comment.username;

      // Cellule Commentaire
      const cellComment = document.createElement("td");
      cellComment.innerText = comment.comment;
      cellComment.className = "comment-content";

      // Cellule Date
      const cellDate = document.createElement("td");
      cellDate.innerText = date;

      // Cellule Actions
      const cellActions = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.className = "action-btn delete-btn";
      deleteButton.title = "Marquer pour suppression";
      deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
      cellActions.appendChild(deleteButton);

      row.append(cellSeries, cellUsername, cellComment, cellDate, cellActions);
      tbodyEl.appendChild(row);
    });
  } catch (error) {
    statusEl.textContent = `Erreur: ${error.message}`;
  }
}

// --- LOGIQUE SPÉCIFIQUE À LA VUE GESTION DU CACHE ---

async function loadAndDisplayCacheList() {
  const statusEl = qs("#status");
  const container = qs("#cache-list-container");
  try {
    const allSeries = await fetchAllSeriesData();
    statusEl.style.display = "none";
    container.innerHTML = "";
    allSeries.sort((a, b) => a.title.localeCompare(b.title));

    allSeries.forEach((series) => {
      const seriesSlug = slugify(series.title);
      const chapters = Object.entries(series.chapters)
        .filter(([, chapData]) => chapData.groups?.Big_herooooo)
        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
      if (chapters.length === 0) return;
      const seriesGroupEl = document.createElement("div");
      seriesGroupEl.className = "series-group";
      seriesGroupEl.innerHTML = `
            <div class="series-header">${series.title}</div>
            <ul class="chapters-list">
                ${chapters
                  .map(
                    ([num, data]) => `
                    <li class="chapter-item" data-series-slug="${seriesSlug}" data-chapter-number="${num}">
                        <div class="chapter-info">
                            Chapitre ${num}
                            <span class="chapter-title">${
                              data.title || ""
                            }</span>
                        </div>
                        <button class="purge-btn"><i class="fas fa-sync-alt"></i> Vider le cache</button>
                    </li>
                `
                  )
                  .join("")}
            </ul>
        `;
      container.appendChild(seriesGroupEl);
    });
  } catch (error) {
    statusEl.textContent = `Erreur: ${error.message}`;
  }
}

// --- ROUTEUR ET LOGIQUE PRINCIPALE ---

function updateActiveNav(view) {
  qsa(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function router() {
  const view = window.location.hash.substring(1) || "moderation";
  updateActiveNav(view);

  switch (view) {
    case "cache":
      renderCacheManagementView();
      break;
    case "moderation":
    default:
      renderModerationView();
      break;
  }
}

/**
 * Envoie la liste des commentaires à supprimer à l'API backend.
 */
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
      keepalive: true, // Très important : permet à la requête de continuer même si la page se ferme
    });

    // On vide la file d'attente localement après l'envoi
    deletionQueue = [];
  } catch (e) {
    console.error("Erreur lors de l'envoi de la file de suppression", e);
    alert(
      "Une erreur est survenue lors de la tentative de sauvegarde des changements."
    );
  }
}

export function initDashboardPage() {
  if (!token) {
    window.location.href = "/admins.html";
    return;
  }

  const contentArea = qs("#admin-content");
  const saveBtn = qs("#save-changes-btn");
  const pendingCountSpan = qs("#pending-count");

  // Écouteur d'événement pour le bouton "Sauvegarder"
  saveBtn.addEventListener("click", () => {
    sendDeletionQueue();
    alert(
      "Changements sauvegardés ! La page va maintenant se recharger pour afficher le résultat."
    );
    // Recharger la page pour voir les changements
    window.location.reload();
  });

  // Écouteur pour envoyer les suppressions en attente avant de quitter/recharger la page
  window.addEventListener("pagehide", sendDeletionQueue);

  qs("#logout-btn").addEventListener("click", () => {
    // Si des suppressions sont en attente, on demande confirmation avant de se déconnecter
    if (deletionQueue.length > 0) {
      if (
        confirm(
          "Vous avez des changements non sauvegardés. Voulez-vous les sauvegarder avant de vous déconnecter ?"
        )
      ) {
        sendDeletionQueue();
      }
    }
    sessionStorage.removeItem("admin_token");
    window.location.href = "/admins.html";
  });

  qsa(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (view) window.location.hash = view;
    });
  });

  contentArea.addEventListener("click", async (e) => {
    // Gestion du purge-cache
    const purgeBtn = e.target.closest(".purge-btn");
    if (purgeBtn) {
      const item = purgeBtn.closest(".chapter-item");
      const { seriesSlug, chapterNumber } = item.dataset;
      if (
        !confirm(
          `Vider le cache pour "${seriesSlug}", chapitre ${chapterNumber} ?`
        )
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
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || `Erreur ${res.status}`);
        purgeBtn.style.backgroundColor = "#28a745";
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

    // Gestion de la modération des commentaires
    const actionBtn = e.target.closest(".action-btn");
    if (actionBtn) {
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
      pendingCountSpan.textContent = deletionQueue.length;
      saveBtn.style.display =
        deletionQueue.length > 0 ? "inline-block" : "none";
    }
  });

  window.addEventListener("hashchange", router);
  router(); // Appelle le routeur au chargement initial
}
