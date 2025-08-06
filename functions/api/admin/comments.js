// functions/api/admin/comments.js

const SHARED_TOKEN = "SECRET_STATIC_TOKEN_FOR_SIMPLICITY";

export async function onRequest(context) {
  const { request, env } = context;
  console.log(
    `[API /api/admin/comments] Received request with method: ${request.method}`
  );

  // 1. Vérification du token d'authentification
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== SHARED_TOKEN) {
    console.error("- Auth token check FAILED.");
    return new Response("Non autorisé", { status: 401 });
  }
  console.log("- Auth token check PASSED.");

  // 2. Gérer la méthode de la requête
  if (request.method === "GET") {
    return await handleGetComments(env);
  } else if (request.method === "POST") {
    // MODIFIÉ : On utilise POST pour la suppression maintenant
    return await handleDeleteComment(request, env);
  }

  console.warn(`- Method ${request.method} is not allowed.`);
  return new Response("Méthode non autorisée", { status: 405 });
}

async function handleGetComments(env) {
  console.log("- Handling GET request...");
  try {
    const list = await env.INTERACTIONS_CACHE.list();
    console.log(`- Found ${list.keys.length} keys in INTERACTIONS_CACHE.`);
    const allComments = [];

    for (const key of list.keys) {
      const seriesSlug = key.name.replace("interactions:", "");
      const seriesData = await env.INTERACTIONS_CACHE.get(key.name, "json");

      for (const chapterNumber in seriesData) {
        if (
          seriesData[chapterNumber].comments &&
          seriesData[chapterNumber].comments.length > 0
        ) {
          seriesData[chapterNumber].comments.forEach((comment) => {
            allComments.push({
              seriesSlug,
              chapterNumber,
              ...comment,
            });
          });
        }
      }
    }

    allComments.sort((a, b) => b.timestamp - a.timestamp);
    console.log(`- Successfully aggregated ${allComments.length} comments.`);

    return new Response(JSON.stringify(allComments), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("- [GET] Error while fetching comments:", error);
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}

async function handleDeleteComment(request, env) {
  console.log("- Handling POST (for deletion) request...");
  try {
    const { seriesSlug, chapterNumber, commentId } = await request.json();
    console.log("- Payload received:", {
      seriesSlug,
      chapterNumber,
      commentId,
    });

    if (!seriesSlug || !chapterNumber || !commentId) {
      console.error("- Deletion failed: Payload is missing required fields.");
      return new Response("Données manquantes", { status: 400 });
    }

    const cacheKey = `interactions:${seriesSlug}`;
    console.log(`- Accessing cache key: ${cacheKey}`);
    let seriesData = await env.INTERACTIONS_CACHE.get(cacheKey, "json");

    if (
      seriesData &&
      seriesData[chapterNumber] &&
      seriesData[chapterNumber].comments
    ) {
      const initialCount = seriesData[chapterNumber].comments.length;
      console.log(
        `- Found chapter ${chapterNumber}. Initial comment count: ${initialCount}`
      );

      seriesData[chapterNumber].comments = seriesData[
        chapterNumber
      ].comments.filter((c) => c.id !== commentId);
      const newCount = seriesData[chapterNumber].comments.length;
      console.log(`- New comment count after filtering: ${newCount}`);

      if (newCount < initialCount) {
        await env.INTERACTIONS_CACHE.put(cacheKey, JSON.stringify(seriesData));
        console.log(
          "- Comment successfully deleted from KV. Sending success response."
        );
        return new Response(
          JSON.stringify({ success: true, message: "Commentaire supprimé." }),
          { status: 200 }
        );
      } else {
        console.warn("- Comment ID not found in the specified chapter.");
        return new Response(
          JSON.stringify({
            success: false,
            message: "Commentaire non trouvé.",
          }),
          { status: 404 }
        );
      }
    }

    console.error(
      `- Deletion failed: Chapter or series data not found for key ${cacheKey}`
    );
    return new Response("Série ou chapitre non trouvé.", { status: 404 });
  } catch (error) {
    console.error("- [DELETE] An unexpected error occurred:", error);
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}
