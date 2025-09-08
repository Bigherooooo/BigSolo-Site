export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Cache": "MISS", // Par défaut, on suppose un cache MISS
  };

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Le paramètre 'id' est manquant." }),
      { status: 400, headers }
    );
  }

  // Clé unique pour le cache de ce chapitre
  const cacheKey = `imgchest_chapter_${id}`;

  try {
    // 1. Tenter de lire depuis le cache KV
    const cachedData = await env.IMG_CHEST_CACHE.get(cacheKey);
    if (cachedData) {
      console.log(`[IMG_CHEST_CHAPTER] Cache HIT → key "${cacheKey}"`);
      headers["X-Cache"] = "HIT";
      const incrementViewPromise = fetch(`https://imgchest.com/p/${id}`, {
        method: "HEAD", // Une requête HEAD est plus légère, on n'a pas besoin du corps de la page
        headers: {
          "User-Agent":
            "BigSolo-Site-View-Incrementer/1.0 (+https://bigsolo.org)",
        },
      })
        .then((res) => {
          if (res.ok) {
            console.log(
              `[IMG_CHEST_CHAPTER] Vue incrémentée avec succès pour l'ID '${id}' (en arrière-plan).`
            );
          } else {
            console.warn(
              `[IMG_CHEST_CHAPTER] Échec de l'incrémentation de la vue pour l'ID '${id}' (status: ${res.status}).`
            );
          }
        })
        .catch((err) => {
          console.error(
            `[IMG_CHEST_CHAPTER] Erreur lors de l'incrémentation de la vue pour l'ID '${id}':`,
            err
          );
        });

      context.waitUntil(incrementViewPromise);
      return new Response(cachedData, { headers });
    }
    console.log(`[IMG_CHEST_CHAPTER] Cache MISS → key "${cacheKey}"`);

    // 2. Si non trouvé dans le cache, faire la requête à ImgChest
    const responseText = await fetch(`https://imgchest.com/p/${id}`, {
      headers: {
        "User-Agent": "BigSolo-Site-Reader-Worker/1.1 (+https://bigsolo.org)",
      },
    }).then((res) => {
      if (!res.ok)
        throw new Error(
          `Erreur HTTP ${res.status} lors de la récupération de la page ImgChest.`
        );
      return res.text();
    });

    // 3. Extraire les données de la page HTML
    const match = responseText.match(
      /<div id="app" data-page="([^"]+)"><\/div>/
    );
    if (!match || !match[1]) {
      throw new Error(
        "Impossible de trouver les données de la page dans la réponse d'ImgChest."
      );
    }

    // 4. Nettoyer et parser le JSON
    const jsonDataString = match[1].replaceAll("&quot;", '"');
    const pageData = JSON.parse(jsonDataString);
    const files = pageData?.props?.post?.files;

    if (!files || !Array.isArray(files)) {
      throw new Error(
        "Le format des données d'ImgChest a changé, la liste des fichiers est introuvable."
      );
    }

    const payload = JSON.stringify(files);

    // 5. Stocker le résultat dans le cache KV pour les prochaines requêtes
    // Le TTL (Time To Live) est de 86400 secondes (24 heures)
    await env.IMG_CHEST_CACHE.put(cacheKey, payload, {
      expirationTtl: 2592000,
    });
    console.log(
      `[IMG_CHEST_CHAPTER] KV PUT SUCCESS → Key "${cacheKey}" stored for 30 days`
    );

    return new Response(payload, { headers });
  } catch (error) {
    console.error(
      `[IMG_CHEST_CHAPTER] Erreur du worker pour l'ID '${id}':`,
      error.message
    );
    const errorResponse = {
      error: "Impossible de récupérer les données du chapitre.",
      details: error.message,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers,
    });
  }
}
