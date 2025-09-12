// functions/api/admin/purge-cache.js

import { slugify } from "../../../js/utils/domUtils.js";

export async function onRequest(context) {
  const { request, env } = context;
  console.log("[API /api/admin/purge-cache] Received cache purge request.");

  // 1. Sécurité : Vérification de la méthode et du token
  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }
  const authToken = request.headers
    .get("Authorization")
    ?.replace("Bearer ", "");
  if (authToken !== env.ADMIN_TOKEN) {
    console.error("- Auth token check FAILED.");
    return new Response("Non autorisé", { status: 401 });
  }
  console.log("- Auth token check PASSED.");

  try {
    const { seriesSlug, chapterNumber } = await request.json();
    if (!seriesSlug || !chapterNumber) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "seriesSlug et chapterNumber sont requis.",
        }),
        { status: 400 }
      );
    }
    console.log(
      `- Purge requested for: ${seriesSlug}, Chapter ${chapterNumber}`
    );

    // 2. Trouver le fichier JSON de la série correspondante
    const config = await env.ASSETS.fetch(
      new URL("/data/config.json", request.url)
    ).then((res) => res.json());
    const seriesFiles = config.LOCAL_SERIES_FILES || [];

    let seriesData = null;
    for (const filename of seriesFiles) {
      const data = await env.ASSETS.fetch(
        new URL(`/data/series/${filename}`, request.url)
      ).then((res) => res.json());
      if (slugify(data.title) === seriesSlug) {
        seriesData = data;
        break;
      }
    }

    if (!seriesData) {
      console.error(`- Series not found for slug: ${seriesSlug}`);
      return new Response(
        JSON.stringify({ success: false, message: "Série non trouvée." }),
        { status: 404 }
      );
    }

    // 3. Extraire l'ID ImgChest du chapitre
    const chapterData = seriesData.chapters[chapterNumber];
    if (!chapterData || !chapterData.groups?.Big_herooooo) {
      console.error(
        `- Chapter ${chapterNumber} not found or has no ImgChest link in series ${seriesSlug}.`
      );
      return new Response(
        JSON.stringify({
          success: false,
          message: "Chapitre non trouvé ou sans lien ImgChest.",
        }),
        { status: 404 }
      );
    }

    const imgChestUrl = chapterData.groups.Big_herooooo;
    const imgChestId = imgChestUrl.split("/").pop();

    if (!imgChestId) {
      console.error(`- Could not extract ImgChest ID from URL: ${imgChestUrl}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Impossible d'extraire l'ID ImgChest.",
        }),
        { status: 500 }
      );
    }

    // 4. Construire la clé KV et la supprimer
    const cacheKey = `imgchest_chapter_${imgChestId}`;
    await env.IMG_CHEST_CACHE.delete(cacheKey);

    console.log(`- SUCCESS: Deleted KV key "${cacheKey}"`);
    return new Response(
      JSON.stringify({
        success: true,
        message: `Cache pour le chapitre ${chapterNumber} vidé.`,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[API /api/admin/purge-cache] An unexpected error occurred:",
      error
    );
    return new Response("Erreur interne du serveur.", { status: 500 });
  }
}
