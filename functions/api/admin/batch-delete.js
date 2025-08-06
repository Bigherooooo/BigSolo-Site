// functions/api/admin/batch-delete.js

const SHARED_TOKEN = "SECRET_STATIC_TOKEN_FOR_SIMPLICITY";

export async function onRequest(context) {
  const { request, env } = context;
  console.log("[API /api/admin/batch-delete] Received batch delete request.");

  // 1. Vérification de la méthode et de l'authentification
  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== SHARED_TOKEN) {
    console.error("- Auth token check FAILED.");
    return new Response("Non autorisé", { status: 401 });
  }
  console.log("- Auth token check PASSED.");

  try {
    const deletions = await request.json();
    if (!Array.isArray(deletions) || deletions.length === 0) {
      console.log("- No deletions to process.");
      return new Response(
        JSON.stringify({ success: true, message: "Aucune action à traiter." }),
        { status: 200 }
      );
    }
    console.log(`- Received a batch of ${deletions.length} deletions.`);

    // 2. Grouper les suppressions par série pour optimiser les écritures KV
    const deletionsBySeries = deletions.reduce((acc, del) => {
      if (!acc[del.seriesSlug]) {
        acc[del.seriesSlug] = new Set();
      }
      acc[del.seriesSlug].add(del.commentId);
      return acc;
    }, {});
    console.log(
      "- Deletions grouped by series:",
      Object.keys(deletionsBySeries)
    );

    // 3. Traiter chaque série
    for (const seriesSlug in deletionsBySeries) {
      const cacheKey = `interactions:${seriesSlug}`;
      const commentIdsToDelete = deletionsBySeries[seriesSlug];
      let seriesData = await env.INTERACTIONS_CACHE.get(cacheKey, "json");

      if (seriesData) {
        console.log(`- Processing series: ${seriesSlug}`);
        let commentsDeletedCount = 0;
        // Itérer sur chaque chapitre de la série
        for (const chapterNumber in seriesData) {
          if (seriesData[chapterNumber].comments) {
            const initialCount = seriesData[chapterNumber].comments.length;
            seriesData[chapterNumber].comments = seriesData[
              chapterNumber
            ].comments.filter((comment) => !commentIdsToDelete.has(comment.id));
            commentsDeletedCount +=
              initialCount - seriesData[chapterNumber].comments.length;
          }
        }
        await env.INTERACTIONS_CACHE.put(cacheKey, JSON.stringify(seriesData));
        console.log(
          `- Deleted ${commentsDeletedCount} comment(s) for series ${seriesSlug} and updated KV.`
        );
      } else {
        console.warn(`- Cache key not found for series: ${seriesSlug}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Traitement par lot réussi." }),
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[API /api/admin/batch-delete] An unexpected error occurred:",
      error
    );
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}
