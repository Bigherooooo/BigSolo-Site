// --- File: functions/api/admin/clear-logs.js ---

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== env.ADMIN_TOKEN) {
    console.error("[API clear-logs] Tentative non autorisée.");
    return new Response("Non autorisé", { status: 401 });
  }

  console.log("[API clear-logs] Demande de vidage des logs reçue.");

  try {
    let keysToDelete = [];
    let listComplete = false;
    let cursor = undefined;

    while (!listComplete) {
      // NOTE : La limite est de 1000 clés par appel `list`
      const listResult = await env.INTERACTIONS_LOG.list({
        cursor: cursor,
        limit: 1000,
      });
      const keyNames = listResult.keys.map((key) => key.name);
      keysToDelete.push(...keyNames);

      listComplete = listResult.list_complete;
      cursor = listResult.cursor;
    }

    if (keysToDelete.length === 0) {
      console.log("[API clear-logs] Aucun log à supprimer.");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Aucun log à supprimer.",
          deletedCount: 0,
        }),
        { status: 200 }
      );
    }

    console.log(
      `[API clear-logs] ${keysToDelete.length} clés trouvées. Début de la suppression...`
    );

    // - Debut modification (CORRECTION DE LA SUPPRESSION)
    // L'API KV ne permet pas de supprimer un tableau de clés directement.
    // Il faut créer une promesse de suppression pour chaque clé.
    const deletePromises = keysToDelete.map((key) =>
      env.INTERACTIONS_LOG.delete(key)
    );

    // On exécute toutes les promesses de suppression en parallèle.
    await Promise.all(deletePromises);
    // - Fin modification

    console.log(
      `[API clear-logs] Suppression terminée. ${keysToDelete.length} clés supprimées.`
    );
    return new Response(
      JSON.stringify({
        success: true,
        message: `${keysToDelete.length} logs ont été supprimés avec succès.`,
        deletedCount: keysToDelete.length,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API clear-logs] Erreur lors du vidage des logs:", error);
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}
