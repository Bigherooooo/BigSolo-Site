// --- File: functions/api/admin/kv-viewer.js ---

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Sécurité
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== env.ADMIN_TOKEN) {
    return new Response("Non autorisé", { status: 401 });
  }

  const url = new URL(request.url);
  const namespaceParam = url.searchParams.get("namespace");
  if (!namespaceParam) {
    return new Response('Paramètre "namespace" manquant', { status: 400 });
  }

  let kvNamespace;
  switch (namespaceParam.toUpperCase()) {
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

  try {
    const list = await kvNamespace.list({ limit: 100 }); // On limite à 100 clés pour commencer

    const items = await Promise.all(
      list.keys.map(async (key) => {
        const value = await kvNamespace.get(key.name);
        return { key: key.name, value: value };
      })
    );

    return new Response(
      JSON.stringify({
        namespace: namespaceParam,
        count: items.length,
        items: items,
        hasMore: !list.list_complete,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(
      `Erreur lors du listage du namespace ${namespaceParam}:`,
      error
    );
    return new Response("Erreur interne du serveur", { status: 500 });
  }
}
