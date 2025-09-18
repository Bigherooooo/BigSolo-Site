// --- File: functions/cron-processor.js ---

/**
 * La logique principale de traitement des logs.
 * Peut être appelée soit par le cron, soit manuellement.
 * @param {object} env - L'environnement d'exécution contenant les bindings KV.
 * @returns {Promise<string>} Un message de statut.
 */
async function processLogs(env) {
  try {
    const list = await env.INTERACTIONS_LOG.list({ prefix: "log:" });
    if (list.keys.length === 0) {
      const message = "Aucun log à traiter. Terminé.";
      console.log(`[processLogs] ${message}`);
      return message;
    }
    console.log(
      `[processLogs] ${list.keys.length} fichier(s) de log à traiter.`
    );

    const logsBySeries = {};
    const ipsToUnlock = new Set();

    for (const key of list.keys) {
      const parts = key.name.split(":");
      if (parts.length >= 4) {
        const seriesSlug = parts[1];
        const clientIp = parts[2];
        if (clientIp && clientIp !== "unknown") {
          ipsToUnlock.add(clientIp);
        }
        if (!logsBySeries[seriesSlug]) logsBySeries[seriesSlug] = [];
        logsBySeries[seriesSlug].push(key.name);
      }
    }

    let totalActionsProcessed = 0;

    for (const seriesSlug in logsBySeries) {
      const cacheKey = `interactions:${seriesSlug}`;
      let seriesInteractions =
        (await env.INTERACTIONS_CACHE.get(cacheKey, "json")) || {};

      for (const logKey of logsBySeries[seriesSlug]) {
        const logActionsText = await env.INTERACTIONS_LOG.get(logKey);
        if (logActionsText) {
          const logActions = JSON.parse(logActionsText);

          for (const action of logActions) {
            const { chapter, type, payload } = action;
            const isEpisode = String(chapter).startsWith("ep-");

            if (!seriesInteractions[chapter]) {
              seriesInteractions[chapter] = isEpisode
                ? { likes: 0 }
                : { likes: 0, comments: [] };
            }

            switch (type) {
              case "like":
                seriesInteractions[chapter].likes =
                  (seriesInteractions[chapter].likes || 0) + 1;
                break;
              case "unlike":
                seriesInteractions[chapter].likes = Math.max(
                  0,
                  (seriesInteractions[chapter].likes || 0) - 1
                );
                break;
              case "rate":
                if (!seriesInteractions.stats) seriesInteractions.stats = {};
                if (!seriesInteractions.stats.ratings)
                  seriesInteractions.stats.ratings = { count: 0, total: 0 };

                seriesInteractions.stats.ratings.total =
                  (seriesInteractions.stats.ratings.total || 0) + payload.value;
                seriesInteractions.stats.ratings.count =
                  (seriesInteractions.stats.ratings.count || 0) + 1;
                break;
              case "add_comment":
                if (
                  !isEpisode &&
                  !seriesInteractions[chapter].comments.some(
                    (c) => c.id === payload.id
                  )
                ) {
                  seriesInteractions[chapter].comments.push(payload);
                }
                break;
              case "like_comment":
              case "unlike_comment":
                if (!isEpisode && payload?.commentId) {
                  const comment = seriesInteractions[chapter].comments.find(
                    (c) => c.id === payload.commentId
                  );
                  if (comment) {
                    comment.likes =
                      (comment.likes || 0) + (type === "like_comment" ? 1 : -1);
                    if (comment.likes < 0) comment.likes = 0;
                  }
                }
                break;
            }
          }
          totalActionsProcessed += logActions.length;
        }
        await env.INTERACTIONS_LOG.delete(logKey);
      }

      if (seriesInteractions.stats?.ratings?.total !== undefined) {
        const { total, count } = seriesInteractions.stats.ratings;
        if (count > 0) {
          seriesInteractions.stats.ratings.average =
            Math.round((total / count) * 100) / 100;
        }
        delete seriesInteractions.stats.ratings.total;
      }

      await env.INTERACTIONS_CACHE.put(
        cacheKey,
        JSON.stringify(seriesInteractions)
      );
      console.log(
        `[processLogs] Traité ${logsBySeries[seriesSlug].length} log(s) pour la série "${seriesSlug}".`
      );
    }

    if (ipsToUnlock.size > 0) {
      console.log(
        `[processLogs] Suppression de ${ipsToUnlock.size} verrou(s) IP...`
      );
      const deletePromises = [];
      for (const ip of ipsToUnlock) {
        deletePromises.push(env.INTERACTIONS_LOG.delete(`lock:${ip}`));
      }
      await Promise.all(deletePromises);
      console.log(`[processLogs] Verrous IP supprimés.`);
    }

    const successMessage = `Traitement terminé. ${totalActionsProcessed} action(s) traitée(s) sur ${list.keys.length} fichier(s).`;
    console.log(`[processLogs] [SUCCESS] ${successMessage}`);
    return successMessage;
  } catch (error) {
    console.error(
      "[processLogs] [FATAL] Erreur critique lors du traitement des logs:",
      error.stack || error
    );
    throw error;
  }
}

// --- Handler pour le déclenchement MANUEL via HTTP ---
export async function onRequest(context) {
  const { request, env } = context;

  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== env.ADMIN_TOKEN) {
    console.error(
      "[MANUAL TRIGGER] Tentative de déclenchement manuel avec un token invalide."
    );
    return new Response("Accès non autorisé.", { status: 401 });
  }
  console.log("[MANUAL TRIGGER] Déclenchement manuel autorisé.");

  try {
    const resultMessage = await processLogs(env);
    return new Response(resultMessage, { status: 200 });
  } catch (error) {
    return new Response(
      "Erreur interne du serveur lors du traitement: " + error.message,
      { status: 500 }
    );
  }
}

// --- Handler pour le déclenchement AUTOMATIQUE via Cron ---
export default {
  async scheduled(controller, env, ctx) {
    console.log("[CRON HANDLER] Déclenchement par cron détecté.");
    ctx.waitUntil(processLogs(env));
  },
};
