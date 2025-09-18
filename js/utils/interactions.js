// --- File: js/utils/interactions.js ---

// --- Gestion des notes utilisateur (rating) ---
const RATING_KEY_PREFIX = "series-rating-";

export function getLocalSeriesRating(seriesSlug) {
  const key = RATING_KEY_PREFIX + seriesSlug;
  const val = localStorage.getItem(key);
  if (!val) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

export function setLocalSeriesRating(seriesSlug, value) {
  const key = RATING_KEY_PREFIX + seriesSlug;
  const old = getLocalSeriesRating(seriesSlug);

  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }

  let queue = getActionQueue();
  if (!queue[seriesSlug]) queue[seriesSlug] = [];
  queue[seriesSlug] = queue[seriesSlug].filter((a) => a.type !== "rate");
  if (value !== null) {
    queue[seriesSlug].push({ type: "rate", payload: { value } });
  }
  saveActionQueue(queue);
}

export function removeLocalSeriesRating(seriesSlug) {
  setLocalSeriesRating(seriesSlug, null);
}

const ACTION_QUEUE_KEY = "bigsolo_action_queue";
const SESSION_ID_KEY = "bigsolo_session_id";

function getActionQueue() {
  try {
    const queue = localStorage.getItem(ACTION_QUEUE_KEY);
    return queue ? JSON.parse(queue) : {};
  } catch (e) {
    return {};
  }
}

function saveActionQueue(queue) {
  try {
    localStorage.setItem(ACTION_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error("Impossible de sauvegarder la file d'attente.", e);
  }
}

export function queueAction(seriesSlug, action) {
  const queue = getActionQueue();
  if (!queue[seriesSlug]) {
    queue[seriesSlug] = [];
  }
  queue[seriesSlug].push(action);
  saveActionQueue(queue);
  console.log("[Interactions] Action ajoutée à la file :", action);
}

// --- LOGIQUE D'ENVOI ET DE NETTOYAGE ROBUSTE ---

function getSessionId() {
  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    console.log("[Interactions] Nouvelle session ID générée :", sessionId);
  }
  return sessionId;
}

async function cleanupPreviousQueue() {
  const queue = getActionQueue();
  const sessionId = getSessionId();

  if (Object.keys(queue).length === 0) {
    return;
  }

  console.log(
    "[Interactions] File d'attente précédente trouvée. Vérification du statut de nettoyage..."
  );

  try {
    const response = await fetch(
      `/api/check-cleanup-status?sessionId=${sessionId}`
    );
    const data = await response.json();

    if (data.cleaned) {
      console.log(
        "[Interactions] Le serveur confirme que la session précédente a été traitée. Nettoyage du localStorage."
      );
      localStorage.removeItem(ACTION_QUEUE_KEY);
    } else {
      console.log(
        "[Interactions] Le serveur n'a pas confirmé le nettoyage. La file est conservée."
      );
    }
  } catch (error) {
    console.error(
      "[Interactions] Erreur lors de la vérification du statut de nettoyage. La file est conservée.",
      error
    );
  }
}

function sendActionQueueOnExit() {
  const queue = getActionQueue();
  if (Object.keys(queue).length === 0) return;

  const sessionId = getSessionId();
  console.log(
    `[Interactions] Sortie du site. Envoi de la file avec la session ID: ${sessionId}`
  );

  Object.entries(queue).forEach(([seriesSlug, actions]) => {
    if (actions.length > 0) {
      const blob = new Blob(
        [JSON.stringify({ seriesSlug, actions, sessionId })],
        { type: "application/json" }
      );
      navigator.sendBeacon("/api/log-action", blob);
    }
  });
}

// S'exécute une seule fois au chargement du script
(function initialize() {
  getSessionId(); // S'assure qu'un ID de session existe
  cleanupPreviousQueue(); // Tente de nettoyer la file de la session précédente

  // L'événement pagehide est le plus fiable pour déclencher l'envoi
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      sendActionQueueOnExit();
    }
  });
})();

// --- AUTRES FONCTIONS UTILITAIRES (INCHANGÉES) ---

export function getLocalInteractionState(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch (e) {
    return {};
  }
}

export function setLocalInteractionState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("Impossible de sauvegarder l'état local.", e);
  }
}

export function addPendingComment(interactionKey, comment) {
  const localState = getLocalInteractionState(interactionKey);
  if (!localState.pendingComments) {
    localState.pendingComments = [];
  }
  localState.pendingComments.push(comment);
  localState.hasCommented = true;
  setLocalInteractionState(interactionKey, localState);
}

let seriesStatsCache = new Map();
export async function fetchSeriesStats(seriesSlug) {
  if (seriesStatsCache.has(seriesSlug)) {
    return seriesStatsCache.get(seriesSlug);
  }
  try {
    const response = await fetch(
      `/api/series-stats?slug=${seriesSlug}&t=${Date.now()}`
    );
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const data = await response.json();
    seriesStatsCache.set(seriesSlug, data);
    return data;
  } catch (error) {
    console.error(
      `Impossible de récupérer les stats pour ${seriesSlug}:`,
      error
    );
    return {};
  }
}
