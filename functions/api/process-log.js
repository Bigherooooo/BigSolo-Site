// functions/api/process-log.js

// La fonction peut maintenant être déclenchée par un cron OU par une requête GET/POST manuelle
export async function onRequest(context) {
  const { env, request } = context;
  console.log(
    "CRON/MANUAL: Démarrage du traitement des logs d'interactions..."
  );

  // vérification token
  const authorization = request.headers.get("Authorization");
  if (authorization !== "Bearer " + env.ADMIN_TOKEN) {
    console.error("[PROCESS LOG] Token invalide.");
    return new Response("Non autorisé", { status: 403 });
  }

  try {
    const list = await env.INTERACTIONS_LOG.list({ prefix: "log:" });
    if (list.keys.length === 0) {
      console.log("CRON/MANUAL: Aucun log à traiter. Terminé.");
      return new Response("Aucun log à traiter.", { status: 200 });
    }

    const logsBySeries = {};
    for (const key of list.keys) {
      const parts = key.name.split(":");
      if (parts.length >= 2) {
        const seriesSlug = parts[1];
        if (!logsBySeries[seriesSlug]) {
          logsBySeries[seriesSlug] = [];
        }
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

            // ↓↓↓ LA MODIFICATION EST ICI ↓↓↓
            // On vérifie si l'identifiant est pour un épisode (commence par "ep-")
            const isEpisode = String(chapter).startsWith("ep-");

            // Initialiser l'objet si nécessaire, avec la bonne structure
            if (!seriesInteractions[chapter]) {
              if (isEpisode) {
                seriesInteractions[chapter] = { likes: 0 }; // Pas de commentaires pour les épisodes
              } else {
                seriesInteractions[chapter] = { likes: 0, comments: [] };
              }
            }

            // Appliquer les actions
            if (type === "like") {
              seriesInteractions[chapter].likes =
                (seriesInteractions[chapter].likes || 0) + 1;
            } else if (type === "unlike") {
              seriesInteractions[chapter].likes = Math.max(
                0,
                (seriesInteractions[chapter].likes || 0) - 1
              );
            }
            // Gestion des notes (ratings) au niveau de la série (pas par chapitre)
            else if (type === "rate") {
              if (!seriesInteractions.stats) seriesInteractions.stats = {};
              if (!Array.isArray(seriesInteractions.stats.ratings)) {
                seriesInteractions.stats.ratings = [];
              }
              // On stocke la note dans un tableau temporaire (sera agrégé à la fin)
              seriesInteractions.stats.ratings.push(
                payload && payload.value !== undefined
                  ? payload.value
                  : action.value
              );
            }
            // Les actions de commentaires ne seront traitées que si ce n'est pas un épisode
            else if (!isEpisode) {
              if (type === "add_comment") {
                if (
                  !seriesInteractions[chapter].comments.some(
                    (c) => c.id === payload.id
                  )
                ) {
                  seriesInteractions[chapter].comments.push(payload);
                }
              } else if (type === "like_comment" || type === "unlike_comment") {
                // Correction: vérifier que payload et payload.commentId existent
                if (payload && payload.commentId) {
                  const comment = seriesInteractions[chapter].comments.find(
                    (c) => c.id === payload.commentId
                  );
                  if (comment) {
                    if (type === "like_comment") {
                      comment.likes = (comment.likes || 0) + 1;
                    } else if (type === "unlike_comment") {
                      comment.likes = Math.max(0, (comment.likes || 0) - 1);
                    }
                  }
                }
                // Sinon, on ignore silencieusement l'action malformée
              }
            }
            // ↑↑↑ FIN DE LA MODIFICATION ↑↑↑
          }
          totalActionsProcessed += logActions.length;
        }
        await env.INTERACTIONS_LOG.delete(logKey);
      }

      // Agrégation finale des notes (ratings) pour stats globales
      if (
        seriesInteractions.stats &&
        Array.isArray(seriesInteractions.stats.ratings)
      ) {
        const ratingsArr = seriesInteractions.stats.ratings.filter(
          (v) => typeof v === "number" && !isNaN(v)
        );
        const ratingsCount = ratingsArr.length;
        const avgRating =
          ratingsCount > 0
            ? ratingsArr.reduce((a, b) => a + b, 0) / ratingsCount
            : null;
        seriesInteractions.stats.ratings = {
          count: ratingsCount,
          average:
            avgRating !== null ? Math.round(avgRating * 100) / 100 : null,
        };
      }
      if (cacheKey) await env.INTERACTIONS_CACHE.put(
        cacheKey,
        JSON.stringify(seriesInteractions)
      );
      console.log(
        `CRON/MANUAL: Traité ${logsBySeries[seriesSlug].length} fichiers de log pour la série "${seriesSlug}".`
      );
    }

    console.log(
      `CRON/MANUAL: Traitement terminé. ${totalActionsProcessed} actions au total.`
    );
    return new Response(
      `Traitement terminé. ${totalActionsProcessed} actions traitées.`,
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "CRON/MANUAL: Erreur critique lors du traitement des logs:",
      error && error.stack ? error.stack : error
    );
    // Ajout : retourne l'erreur détaillée dans la réponse pour debug local
    return new Response(
      "Erreur lors du traitement : " +
      (error && error.stack ? error.stack : error),
      { status: 500 }
    );
  }
}
