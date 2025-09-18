// --- File: functions/api/admin/delete-kv-key.js ---

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Sécurité
  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== env.ADMIN_TOKEN) {
    return new Response("Non autorisé", { status: 401 });
  }

  try {
    const { namespace, key } = await request.json();
    if (!namespace || !key) {
      return new Response('Les paramètres "namespace" et "key" sont requis.', {
        status: 400,
      });
    }

    let kvNamespace;
    switch (namespace.toUpperCase()) {
      case "INTERACTIONS_LOG":
        kvNamespace = env.INTERACTIONS_LOG;
        break;
      case "INTERACTIONS_CACHE":
        kvNamespace = env.INTERACTIONS_CACHE;
        break;
      case "IMG_CHEST_CACHE":
        kvNamespace = env.IMG_CHEST_CACHE;
        break;
      default:
        return new Response("Namespace non valide", { status: 400 });
    }

    console.log(
      `[API delete-kv-key] Demande de suppression pour la clé "${key}" dans le namespace "${namespace}"`
    );
    await kvNamespace.delete(key);

    return new Response(
      JSON.stringify({
        success: true,
        message: `La clé "${key}" a été supprimée avec succès.`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API delete-kv-key] Erreur:", error);
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}
