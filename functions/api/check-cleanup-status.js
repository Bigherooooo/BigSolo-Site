// --- File: functions/api/check-cleanup-status.js ---

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    // Si pas de sessionId, on ne peut rien vérifier, on suppose que ce n'est pas nettoyé.
    return new Response(JSON.stringify({ cleaned: false }), { status: 400 });
  }

  try {
    const cleanupKey = `cleaned:${sessionId}`;
    const wasCleaned = await env.INTERACTIONS_LOG.get(cleanupKey);

    // Si la clé a été trouvée, on la supprime pour qu'elle ne soit utilisée qu'une fois
    if (wasCleaned !== null) {
      await env.INTERACTIONS_LOG.delete(cleanupKey);
    }

    return new Response(JSON.stringify({ cleaned: wasCleaned !== null }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[API check-cleanup-status] Erreur KV:", error);
    return new Response(JSON.stringify({ cleaned: false }), { status: 500 });
  }
}
