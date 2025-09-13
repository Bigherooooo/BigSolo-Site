// --- File: js/utils/interactions.js ---

// --- Gestion des notes utilisateur (rating) ---
const RATING_KEY_PREFIX = "series-rating-";

/**
 * Récupère la note locale de l'utilisateur pour une série
 */
export function getLocalSeriesRating(seriesSlug) {
  const key = RATING_KEY_PREFIX + seriesSlug;
  const val = localStorage.getItem(key);
  if (!val) return null;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Définit/modifie la note locale de l'utilisateur pour une série
 * (et ajoute l'action à la file d'attente, en supprimant l'ancienne si besoin)
 */
export function setLocalSeriesRating(seriesSlug, value) {
  const key = RATING_KEY_PREFIX + seriesSlug;
  const old = getLocalSeriesRating(seriesSlug);

  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }

  // Ajoute à la file d'attente une action unique (remplace l'ancienne si présente)
  let queue = getActionQueue();
  if (!queue[seriesSlug]) queue[seriesSlug] = [];
  // Supprime toute ancienne action de type 'rate'
  queue[seriesSlug] = queue[seriesSlug].filter((a) => a.type !== "rate");
  // On ajoute la nouvelle action uniquement si une note est définie
  if (value !== null) {
    queue[seriesSlug].push({ type: "rate", payload: { value } });
  }
  saveActionQueue(queue);
  console.log(
    `[interactions.js] setLocalSeriesRating: ${seriesSlug} = ${value} (old: ${old})`,
  );
}

/**
 * Supprime la note locale (si besoin)
 */
export function removeLocalSeriesRating(seriesSlug) {
  setLocalSeriesRating(seriesSlug, null);
  console.log(`[interactions.js] removeLocalSeriesRating: ${seriesSlug}`);
}

const ACTION_QUEUE_KEY = "bigsolo_action_queue";

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
    console.error(
      "Impossible de sauvegarder la file d'attente des actions.",
      e,
    );
  }
}

export function queueAction(seriesSlug, action) {
  const queue = getActionQueue();
  if (!queue[seriesSlug]) {
    queue[seriesSlug] = [];
  }
  queue[seriesSlug].push(action);
  saveActionQueue(queue);
}

async function sendActionQueue() {
  console.log("[DEBUG][interactions.js][sendActionQueue] Tentative d'envoi.");

  const queue = getActionQueue();
  const seriesSlugs = Object.keys(queue);

  if (seriesSlugs.length === 0) {
    console.log(
      "[DEBUG][interactions.js] File d'attente vide, rien à envoyer.",
    );
    return;
  }

  const promises = seriesSlugs.map(async (seriesSlug) => {
    const actions = queue[seriesSlug];
    if (actions.length > 0) {
      try {
        const response = await fetch("/api/log-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seriesSlug, actions }),
          keepalive: true,
        });

        if (response.ok) {
          console.log(
            `[DEBUG][interactions.js] Envoi réussi pour ${seriesSlug}. Suppression de la file locale.`,
          );
          const currentQueue = getActionQueue();
          delete currentQueue[seriesSlug];
          saveActionQueue(currentQueue);
        } else {
          console.warn(
            `[DEBUG][interactions.js] Envoi refusé pour ${seriesSlug} (Status: ${response.status}). La file locale est conservée.`,
          );
        }
      } catch (error) {
        console.error(
          "[DEBUG][interactions.js] Erreur réseau lors de l'envoi de la file d'attente, la file est conservée:",
          error,
        );
      }
    }
  });

  await Promise.all(promises);
  console.log(
    "[DEBUG][interactions.js] Traitement de la file d'attente terminé.",
  );
}

// L'envoi se fait lors d'un vrai pagehide (fermeture/refresh)
window.addEventListener("pagehide", sendActionQueue);
// Par sécurité, on le met aussi sur beforeunload, même si pagehide est préféré.
window.addEventListener("beforeunload", sendActionQueue);

// --- Gestion de l'état local de l'utilisateur ---

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

// --- Récupération des données ---

let seriesStatsCache = new Map();

export async function fetchSeriesStats(seriesSlug) {
  if (seriesStatsCache.has(seriesSlug)) {
    return seriesStatsCache.get(seriesSlug);
  }
  try {
    const response = await fetch(
      `/api/series-stats?slug=${seriesSlug}&t=${Date.now()}`,
    );
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const data = await response.json();
    seriesStatsCache.set(seriesSlug, data);
    return data;
  } catch (error) {
    console.error(
      `Impossible de récupérer les stats pour ${seriesSlug}:`,
      error,
    );
    return {};
  }
}
