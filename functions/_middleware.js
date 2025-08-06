// functions/_middleware.js

function slugify(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD") // Sépare les caractères de leurs accents (ex: "é" -> "e" + "´")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents et diacritiques
    .toLowerCase()
    .trim()
    .replace(/[\s\u3000]+/g, "_") // Remplace les espaces (normaux et idéographiques) par un underscore
    .replace(/[^\w-]+/g, "") // Supprime les caractères non autorisés
    .replace(/--+/g, "_"); // Nettoie les tirets multiples (au cas où)
}

function generateMetaTags(meta) {
  const title = meta.title || "BigSolo";
  const description =
    meta.description ||
    "Retrouvez toutes les sorties de Big_herooooo en un seul et unique endroit !";
  const imageUrl =
    meta.image || new URL("/img/banner.jpg", meta.url).toString();
  const url = meta.url || "https://bigsolo.org";

  return `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${url}" />
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">
  `;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const originalPathname = url.pathname;
  const pathname =
    originalPathname.endsWith("/") && originalPathname.length > 1
      ? originalPathname.slice(0, -1)
      : originalPathname;

  // Redirection legacy (si besoin)
  if (pathname.startsWith("/series-detail")) {
    const slugWithPotentialSubpaths = pathname.substring(
      "/series-detail".length
    );
    const newUrl = new URL(slugWithPotentialSubpaths, url.origin);
    return Response.redirect(newUrl.toString(), 301);
  }

  // --- GESTION SPÉCIFIQUE DES URLS DE LA GALERIE ---
  if (pathname.startsWith("/galerie")) {
    const metaData = {
      title: "Galerie - BigSolo",
      description:
        "Découvrez toutes les colorisations et fan-arts de la communauté !",
      htmlFile: "/galerie.html",
    };
    const assetUrl = new URL(metaData.htmlFile, url.origin);
    const response = await env.ASSETS.fetch(assetUrl);
    let html = await response.text();
    const tags = generateMetaTags({ ...metaData, url: url.href });
    html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  // Gestion des pages statiques
  const staticPageMeta = {
    "": {
      title: "Accueil - BigSolo",
      description:
        "Retrouvez toutes les sorties de Big_herooooo en un seul et unique endroit !",
      htmlFile: "/index.html",
      image: "/img/banner.jpg",
    },
    "/index.html": {
      title: "Accueil - BigSolo",
      description:
        "Retrouvez toutes les sorties de Big_herooooo en un seul et unique endroit !",
      htmlFile: "/index.html",
      image: "/img/banner.jpg",
    },
    "/presentation": {
      title: "Questions & Réponses - BigSolo",
      description:
        "Les réponses de BigSolo à vos questions sur son parcours dans le scantrad.",
      htmlFile: "/presentation.html",
    },
    "/presentation.html": {
      title: "Questions & Réponses - BigSolo",
      description:
        "Les réponses de BigSolo à vos questions sur son parcours dans le scantrad.",
      htmlFile: "/presentation.html",
    },
  };

  if (staticPageMeta[pathname]) {
    const metaData = staticPageMeta[pathname];
    const assetUrl = new URL(metaData.htmlFile, url.origin);
    const response = await env.ASSETS.fetch(assetUrl);
    let html = await response.text();
    const tags = generateMetaTags({ ...metaData, url: url.href });
    html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=UTF-8" },
    });
  }

  // Ignorer les assets connus pour ne pas faire de traitement inutile
  const knownPrefixes = [
    "/css/",
    "/js/",
    "/img/",
    "/data/",
    "/includes/",
    "/functions/",
    "/api/",
    "/fonts/",
  ];
  if (knownPrefixes.some((prefix) => originalPathname.startsWith(prefix))) {
    return next();
  }

  // --- LOGIQUE DE ROUTAGE DYNAMIQUE POUR LES SÉRIES ET LE LECTEUR ---
  try {
    const pathSegments = originalPathname.split("/").filter(Boolean);
    if (pathSegments.length === 0) return next(); // C'est la page d'accueil, déjà gérée

    const seriesSlug = pathSegments[0];

    // Charger la config et les données de toutes les séries une seule fois
    const config = await env.ASSETS.fetch(
      new URL("/data/config.json", url.origin)
    ).then((res) => res.json());
    const seriesFiles = config.LOCAL_SERIES_FILES || [];
    const allSeriesDataPromises = seriesFiles.map((filename) =>
      env.ASSETS.fetch(new URL(`/data/series/${filename}`, url.origin))
        .then((res) => res.json().then((data) => ({ data, filename })))
        .catch((e) => {
          console.error(`Failed to load ${filename}`, e);
          return null;
        })
    );
    const allSeriesResults = (await Promise.all(allSeriesDataPromises)).filter(
      Boolean
    );
    const foundSeries = allSeriesResults.find(
      (s) => s && s.data && slugify(s.data.title) === seriesSlug
    );

    if (!foundSeries) return next(); // Laisser Cloudflare Pages gérer la 404

    const seriesData = foundSeries.data;
    const jsonFilename = foundSeries.filename;
    const ogImageFilename = jsonFilename.replace(".json", ".png");
    const ogImageUrl = new URL(
      `/img/banner/${ogImageFilename}`,
      url.origin
    ).toString();

    // ROUTE 1: LECTEUR DE CHAPITRE (ex: /nom-de-serie/123 ou /nom-de-serie/123/5)
    const isChapterRoute =
      (pathSegments.length === 2 || pathSegments.length === 3) &&
      !isNaN(parseFloat(pathSegments[1]));

    if (isChapterRoute) {
      const chapterNumber = pathSegments[1];
      if (seriesData.chapters[chapterNumber]) {
        const metaData = {
          title: `${seriesData.title} - Chapitre ${chapterNumber} | BigSolo`,
          description: `Lisez le chapitre ${chapterNumber} de ${seriesData.title}. ${seriesData.description}`,
          image: ogImageUrl,
        };

        const assetUrl = new URL("/reader.html", url.origin);
        let html = await env.ASSETS.fetch(assetUrl).then((res) => res.text());

        const tags = generateMetaTags({ ...metaData, url: url.href });
        html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);

        const readerPayload = {
          series: seriesData,
          chapterNumber: chapterNumber,
        };
        html = html.replace(
          "<!-- READER_DATA_PLACEHOLDER -->",
          JSON.stringify(readerPayload)
        );

        return new Response(html, {
          headers: { "Content-Type": "text/html;charset=UTF-8" },
        });
      }
    }

    // --- NOUVELLE SECTION POUR GÉRER LES ÉPISODES ---
    const isEpisodeRoute =
      pathSegments.length > 1 && pathSegments[1] === "episodes";
    if (isEpisodeRoute) {
      let metaData;
      const animeInfo =
        seriesData.anime && seriesData.anime[0] ? seriesData.anime[0] : null;

      if (pathSegments.length === 3) {
        // C'est une page de lecteur d'épisode
        const episodeNumber = pathSegments[2];
        metaData = {
          title: `Épisode ${episodeNumber} de ${seriesData.title} - BigSolo`,
          description: `Regardez l'épisode ${episodeNumber} de l'anime ${seriesData.title}.`,
          image: animeInfo?.cover_an || ogImageUrl,
        };
      } else {
        // C'est la liste des épisodes
        metaData = {
          title: `Épisodes de ${seriesData.title} - BigSolo`,
          description: `Liste de tous les épisodes de l'anime ${seriesData.title}.`,
          image: animeInfo?.cover_an || ogImageUrl,
        };
      }
      // Dans tous les cas (liste ou lecteur), on sert la page de détail qui contient le routeur JS
      const assetUrl = new URL("/series-detail.html", url.origin);
      let html = await env.ASSETS.fetch(assetUrl).then((res) => res.text());

      const tags = generateMetaTags({ ...metaData, url: url.href });
      html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);
      html = html.replace(
        "<!-- SERIES_DATA_PLACEHOLDER -->",
        JSON.stringify(seriesData)
      );

      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
    // --- FIN DE LA NOUVELLE SECTION ---

    // ROUTE 2: GALERIE DE COUVERTURES (ex: /nom-de-serie/cover)
    if (pathSegments.length > 1 && pathSegments[1] === "cover") {
      const metaData = {
        title: `Couvertures de ${seriesData.title} - BigSolo`,
        description: `Découvrez toutes les couvertures de la série ${seriesData.title} !`,
        image: ogImageUrl,
      };
      const assetUrl = new URL("/series-covers.html", url.origin);
      let html = await env.ASSETS.fetch(assetUrl).then((res) => res.text());

      const tags = generateMetaTags({ ...metaData, url: url.href });
      html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ROUTE 3: PAGE DE DÉTAIL DE LA SÉRIE (ex: /nom-de-serie)
    if (pathSegments.length === 1) {
      const metaData = {
        title: `${seriesData.title} - BigSolo`,
        description: seriesData.description,
        image: ogImageUrl,
      };
      const assetUrl = new URL("/series-detail.html", url.origin);
      let html = await env.ASSETS.fetch(assetUrl).then((res) => res.text());

      const tags = generateMetaTags({ ...metaData, url: url.href });
      html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);
      html = html.replace(
        "<!-- SERIES_DATA_PLACEHOLDER -->",
        JSON.stringify(seriesData)
      );

      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }
  } catch (error) {
    console.error(
      `Error during dynamic routing for "${originalPathname}":`,
      error
    );
  }

  // Si aucune route ne correspond, on passe la main
  return next();
}
