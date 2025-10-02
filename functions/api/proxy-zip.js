// --- File: functions/api/proxy-zip.js ---

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const chapterId = url.searchParams.get("id");

  if (!chapterId) {
    return new Response("Le paramètre 'id' du chapitre est manquant.", {
      status: 400,
    });
  }

  const imgchestDownloadUrl = `https://imgchest.com/p/${chapterId}/download`;

  try {
    const method = request.method; // Récupère la méthode (GET ou HEAD)
    console.log(
      `[Proxy ZIP] Received ${method} request for chapter ID: ${chapterId}`
    );

    // On fait la requête à ImgChest en utilisant la même méthode que le client
    const zipResponse = await fetch(imgchestDownloadUrl, {
      method: method,
      headers: {
        "User-Agent": "BigSolo-Zip-Proxy/1.1 (+https://bigsolo.org)",
        Referer: `https://imgchest.com/p/${chapterId}`,
      },
    });

    if (!zipResponse.ok) {
      console.error(
        `[Proxy ZIP] ImgChest returned error: ${zipResponse.status}`
      );
      return new Response(`Erreur ImgChest: ${zipResponse.status}`, {
        status: zipResponse.status,
      });
    }

    // On prépare les en-têtes de notre réponse
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/zip");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    // - Debut modification (Correction principale)

    // 1. On récupère et on transmet l'en-tête Content-Length
    const contentLength = zipResponse.headers.get("Content-Length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    // 2. On autorise explicitement le script client à lire cet en-tête
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length");

    // - Fin modification

    // Si la requête est un GET, on transmet le corps du fichier. Pour un HEAD, le corps est null.
    const responseBody = method === "HEAD" ? null : zipResponse.body;

    const response = new Response(responseBody, {
      status: 200,
      headers: responseHeaders,
    });

    return response;
  } catch (error) {
    console.error("[Proxy ZIP] Erreur interne:", error);
    return new Response("Erreur interne du proxy ZIP.", { status: 500 });
  }
}
