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
  localStorage.setItem(key, value);
  // Ajoute à la file d'attente une action unique (remplace l'ancienne si présente)
  let queue = getActionQueue();
  if (!queue[seriesSlug]) queue[seriesSlug] = [];
  // Supprime toute ancienne action de type 'rate'
  queue[seriesSlug] = queue[seriesSlug].filter((a) => a.type !== "rate");
  queue[seriesSlug].push({ type: "rate", payload: { value } });
  saveActionQueue(queue);
  console.log(
    `[interactions.js] setLocalSeriesRating: ${seriesSlug} = ${value} (old: ${old})`
  );
}

/**
 * Supprime la note locale (si besoin)
 */
export function removeLocalSeriesRating(seriesSlug) {
  const key = RATING_KEY_PREFIX + seriesSlug;
  localStorage.removeItem(key);
  let queue = getActionQueue();
  if (queue[seriesSlug]) {
    queue[seriesSlug] = queue[seriesSlug].filter((a) => a.type !== "rate");
    saveActionQueue(queue);
  }
  console.log(`[interactions.js] removeLocalSeriesRating: ${seriesSlug}`);
}
// js/utils/interactions.js

const ACTION_QUEUE_KEY = "bigsolo_action_queue";

// --- DÉBUT DE LA LOGIQUE DE DÉTECTION DE NAVIGATION ---

// Ce drapeau nous aidera à savoir si l'utilisateur clique sur un lien
// interne au site ou s'il quitte vraiment le site.
let isInternalNavigation = false;

// Log au chargement du module (utile si ce fichier est chargé au début)
console.log(
  "[DEBUG][interactions.js][MODULE LOAD] bigsolo_action_queue =",
  localStorage.getItem("bigsolo_action_queue")
);
console.log(
  "[DEBUG][interactions.js][MODULE LOAD] bigsolo_internal_nav =",
  sessionStorage.getItem("bigsolo_internal_nav")
);

// On ajoute un écouteur d'événements sur l'ensemble du document pour intercepter
// tous les clics. Le 'true' final (phase de capture) assure qu'il s'exécute
// avant que le navigateur ne commence à suivre le lien.
document.addEventListener(
  "click",
  (event) => {
    // On vérifie si la cible du clic est un lien <a> ou est à l'intérieur d'un lien.
    const link = event.target.closest("a");

    // Si ce n'est pas un lien ou qu'il n'a pas de destination (href), on ne fait rien.
    if (!link || !link.href) {
      return;
    }

    // C'est la vérification clé : on compare le nom de domaine du lien cliqué
    // avec le nom de domaine de la page actuelle. Si c'est le même, c'est une navigation interne.
    if (link.hostname === window.location.hostname) {
      // --- LOGS DEBUG SESSIONSTORAGE ---
      console.log(
        "[DEBUG][interactions.js][CLICK] Avant setItem, bigsolo_internal_nav =",
        sessionStorage.getItem("bigsolo_internal_nav")
      );
      sessionStorage.setItem("bigsolo_internal_nav", "1");
      console.log(
        "[DEBUG][interactions.js][CLICK] Après setItem, bigsolo_internal_nav =",
        sessionStorage.getItem("bigsolo_internal_nav")
      );
      // On lève le drapeau pour indiquer une navigation interne.
      isInternalNavigation = true;
      console.log(
        "[DEBUG][interactions.js] Navigation interne détectée (clic sur lien):",
        link.href
      );

      // Par sécurité, on remet le drapeau à false après un court instant.
      // Cela gère le cas où la navigation serait annulée (ex: Ctrl+clic pour ouvrir dans un nouvel onglet).
      setTimeout(() => {
        isInternalNavigation = false;
        console.log(
          "[DEBUG][interactions.js] isInternalNavigation reset à false (timeout)"
        );
      }, 500);
    }
  },
  true
);

// --- FIN DE LA LOGIQUE DE DÉTECTION ---

// --- Gestion de la file d'attente (inchangée) ---

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
      e
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

// --- Logique d'envoi de la file d'attente (MODIFIÉE) ---

function sendActionQueue() {
  console.log("[DEBUG][interactions.js][sendActionQueue] START");
  console.log(
    "[DEBUG][interactions.js][sendActionQueue] bigsolo_action_queue =",
    localStorage.getItem("bigsolo_action_queue")
  );
  console.log(
    "[DEBUG][interactions.js][sendActionQueue] bigsolo_internal_nav =",
    sessionStorage.getItem("bigsolo_internal_nav")
  );

  if (sessionStorage.getItem("bigsolo_internal_nav") === "1") {
    sessionStorage.removeItem("bigsolo_internal_nav");
    console.log(
      "[DEBUG][interactions.js] Navigation interne détectée via sessionStorage, annulation de l'envoi."
    );
    return;
  }

  console.log(
    "[DEBUG][interactions.js] sendActionQueue appelé. isInternalNavigation =",
    isInternalNavigation
  );
  // On vérifie le drapeau AVANT de faire quoi que ce soit.
  // Si c'est une navigation interne (SPA), on arrête tout.
  if (isInternalNavigation) {
    console.log(
      "[DEBUG][interactions.js] Annulation de l'envoi (navigation interne détectée)"
    );
    return;
  }

  const queue = getActionQueue();
  const seriesSlugs = Object.keys(queue);

  if (seriesSlugs.length === 0) {
    console.log(
      "[DEBUG][interactions.js] File d'attente vide, rien à envoyer."
    );
    return;
  }

  for (const seriesSlug of seriesSlugs) {
    const actions = queue[seriesSlug];
    if (actions.length > 0) {
      try {
        const currentQueue = getActionQueue();
        console.log(
          `[DEBUG][interactions.js][sendActionQueue] Suppression de la file pour ${seriesSlug}, état avant suppression:`,
          JSON.stringify(currentQueue)
        );
        const blob = new Blob([JSON.stringify({ seriesSlug, actions })], {
          type: "application/json",
        });
        console.log(
          "[DEBUG][interactions.js][sendActionQueue] Appel navigator.sendBeacon pour",
          seriesSlug,
          actions
        );
        const beaconResult = navigator.sendBeacon("/api/log-action", blob);
        console.log(
          "[DEBUG][interactions.js][sendActionQueue] sendBeacon result:",
          beaconResult
        );
        delete currentQueue[seriesSlug];
        saveActionQueue(currentQueue);
        console.log(
          `[DEBUG][interactions.js][sendActionQueue] Etat après suppression:`,
          localStorage.getItem("bigsolo_action_queue")
        );
        if (
          localStorage.getItem("bigsolo_action_queue") !== "{}" &&
          localStorage.getItem("bigsolo_action_queue") !== null
        ) {
          console.warn(
            "[DEBUG][interactions.js][sendActionQueue] ATTENTION: File d'attente non vide après suppression !"
          );
        }
        console.log(
          `[DEBUG][interactions.js] File d'attente pour ${seriesSlug} supprimée du localStorage.`
        );
      } catch (error) {
        console.warn(
          "[DEBUG][interactions.js] Erreur lors de l'envoi de la file d'attente :",
          error
        );
      }
    }
  }
  // Log final pour vérifier l'état du localStorage après suppression
  console.log(
    "[DEBUG][interactions.js] queue après suppression :",
    getActionQueue()
  );
}

// L'envoi ne se fait QUE lors d'un vrai pagehide (fermeture/refresh)
window.addEventListener("pagehide", (event) => {
  console.log(
    "[DEBUG][interactions.js][pagehide] event pagehide déclenché. Persisted:",
    event.persisted
  );
  sendActionQueue();
});

// --- AJOUT : test avec beforeunload ---
window.addEventListener("beforeunload", (event) => {
  console.log("[DEBUG][interactions.js][beforeunload] event déclenché");
  sendActionQueue();
});

// --- Gestion de l'état local de l'utilisateur (inchangée) ---

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

// --- Récupération des données (inchangée) ---

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
