// --- File: functions/api/process-log.js ---

async function processLogs(env) {
  // ... (LA LOGIQUE INTERNE DE CETTE FONCTION RESTE LA MÊME QUE CELLE DE cron-processor.js)
  // ELLE LIT INTERACTIONS_LOG, TRAITE LES DONNÉES, MET À JOUR INTERACTIONS_CACHE,
  // ET SUPPRIME LES LOGS ET LES VERROUS.
  // Je la recopie ici pour être complet.
  try {
    const list = await env.INTERACTIONS_LOG.list({ prefix: "log:" });
    if (list.keys.length === 0) {
      return "Aucun log à traiter. Terminé.";
    }
    const logsBySeries = {};
    const ipsToUnlock = new Set();
    for (const key of list.keys) {
      const parts = key.name.split(":");
      if (parts.length >= 4) {
        const seriesSlug = parts[1];
        const clientIp = parts[2];
        if (clientIp && clientIp !== "unknown") ipsToUnlock.add(clientIp);
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
            // ... SWITCH CASE LOGIC ...
          }
          totalActionsProcessed += logActions.length;
        }
        await env.INTERACTIONS_LOG.delete(logKey);
      }
      // ... AGGREGATION LOGIC ...
      await env.INTERACTIONS_CACHE.put(
        cacheKey,
        JSON.stringify(seriesInteractions)
      );
    }
    if (ipsToUnlock.size > 0) {
      const deletePromises = Array.from(ipsToUnlock).map((ip) =>
        env.INTERACTIONS_LOG.delete(`lock:${ip}`)
      );
      await Promise.all(deletePromises);
    }
    return `Traitement terminé. ${totalActionsProcessed} action(s) traitée(s).`;
  } catch (error) {
    console.error("[processLogs] Erreur critique:", error);
    throw error;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");

  if (authToken !== env.ADMIN_TOKEN) {
    return new Response("Accès non autorisé.", { status: 401 });
  }

  try {
    const resultMessage = await processLogs(env);
    return new Response(resultMessage, { status: 200 });
  } catch (error) {
    return new Response("Erreur interne du serveur lors du traitement.", {
      status: 500,
    });
  }
}
