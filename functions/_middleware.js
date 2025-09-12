// --- File: functions/_middleware.js ---

import { slugify } from "../js/utils/domUtils.js";

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

function enrichEpisodesWithAbsoluteIndex(episodes) {
  if (!episodes || episodes.length === 0) return [];
  const episodesBySeason = episodes.reduce((acc, ep) => {
    const season = ep.saison_ep || 1;
    if (!acc[season]) acc[season] = [];
    acc[season].push(ep);
    return acc;
  }, {});

  const sortedSeasons = Object.keys(episodesBySeason).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  let absoluteIndexCounter = 1;
  let enrichedEpisodes = [];

  sortedSeasons.forEach((seasonNum) => {
    const seasonEpisodes = episodesBySeason[seasonNum].sort(
      (a, b) => a.indice_ep - b.indice_ep
    );
    seasonEpisodes.forEach((ep) => {
      enrichedEpisodes.push({ ...ep, absolute_index: absoluteIndexCounter });
      absoluteIndexCounter++;
    });
  });
  return enrichedEpisodes;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

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

  // redirect pour les anciennes urls (avec des underscores au lieu de tirets)
  // modif : évite de rediriger si le fichier demandé n'est pas une série
  // pour le redirect legacy /series-detail, check le fichier _redirects
  const originalPathname = url.pathname;
  const seriesName = originalPathname.split("/")[1];
  if (seriesName.includes("_") && !knownPrefixes.includes(`/${seriesName}/`)) {
    const newSeriesName = slugify(seriesName);
    const pathname = originalPathname.replace(seriesName, newSeriesName);
    const newUrl = new URL(newSeriesName, url.origin);
    newUrl.search = url.search;
    newUrl.hash = url.hash;
    console.log(
      `[Redirect] Old URL detected: ${originalPathname} -> Redirecting to: ${newUrl.pathname}`
    );
    return Response.redirect(newUrl.toString(), 301);
  }

  // redirect pour les anciennes url (cubari & aidoku)
  // remplace les underscores par des tirets
  if (originalPathname.startsWith("/data/series/")) {
    const fileName = originalPathname.split("/").pop();
    if (fileName && fileName.includes("_")) {
      const newFileName = fileName.replaceAll("_", "-");
      const newPathname = originalPathname.replace(fileName, newFileName);
      const newUrl = new URL(newPathname, url.origin);
      newUrl.search = url.search;
      newUrl.hash = url.hash;
      console.log(
        `[Redirect] Old data URL detected (Cubari/Aidoku): ${originalPathname} -> Redirecting to: ${newUrl.pathname}`
      );
      return Response.redirect(newUrl.toString(), 301);
    }
  }

  let pathname =
    originalPathname.endsWith("/") && originalPathname.length > 1
      ? originalPathname.slice(0, -1)
      : originalPathname;
  if (pathname.endsWith(".html")) {
    pathname = pathname.slice(0, -5);
  }
  if (pathname === "/index") pathname = "/";

  if (pathname.startsWith("/galerie")) {
    const metaData = {
      title: "Colorisations – BigSolo",
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

  const staticPageMeta = {
    "/": {
      title: "BigSolo",
      description:
        "Retrouvez toutes les sorties de Big_herooooo en un seul et unique endroit !",
      htmlFile: "/index.html",
      image: "/img/banner.jpg",
    },
    "/presentation": {
      title: "Questions & Réponses – BigSolo",
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

  if (knownPrefixes.some((prefix) => originalPathname.startsWith(prefix))) {
    return next();
  }

  try {
    const pathSegments = originalPathname.split("/").filter(Boolean);
    if (pathSegments.length === 0) return next();

    const seriesSlug = pathSegments[0];

    const config = await env.ASSETS.fetch(
      new URL("/data/config.json", url.origin)
    ).then((res) => res.json());
    const seriesFiles = config.LOCAL_SERIES_FILES || [];
    const allSeriesDataPromises = seriesFiles.map((filename) =>
      env.ASSETS.fetch(new URL(`/data/series/${filename}`, url.origin))
        .then((res) => res.json().then((data) => ({ data, filename })))
        .catch(() => null)
    );
    const allSeriesResults = (await Promise.all(allSeriesDataPromises)).filter(
      Boolean
    );
    const foundSeries = allSeriesResults.find(
      (s) => s && s.data && slugify(s.data.title) === seriesSlug
    );

    if (!foundSeries) return next();

    const seriesData = foundSeries.data;
    const jsonFilename = foundSeries.filename;
    const ogImageFilename = jsonFilename.replace(".json", ".png");
    const ogImageUrl = new URL(
      `/img/banner/${ogImageFilename}`,
      url.origin
    ).toString();

    let alternativeTitles = (seriesData.alternative_titles || []);
    alternativeTitles = alternativeTitles.length > 0 ? ` (${alternativeTitles.join(", ")})` : "";

    const isChapterRoute =
      (pathSegments.length === 2 || pathSegments.length === 3) &&
      !isNaN(parseFloat(pathSegments[1]));

    if (isChapterRoute) {
      const chapterNumber = pathSegments[1];
      if (seriesData.chapters[chapterNumber]) {
        const metaData = {
          title: `Chapitre ${chapterNumber} VF | ${seriesData.title} – BigSolo`,
          description: `Lisez le chapitre ${chapterNumber} de ${seriesData.title} ${seriesData.alternative_titles?.join(", ")} en VF. ${seriesData.description}`,
          image: ogImageUrl,
        };
        
        if (seriesData.os) {
          metaData.title = `${seriesData.chapters[chapterNumber].title} VF | ${seriesData.title} – BigSolo`
        }

        const assetUrl = new URL("/templates/MangaReader.html", url.origin);
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

    const isEpisodeRoute = pathSegments.length > 1 && pathSegments[1] === "episodes";

    if (isEpisodeRoute) {
      if (pathSegments.length === 3) {
        const absoluteEpisodeIndex = pathSegments[2];
        const allEpisodesEnriched = enrichEpisodesWithAbsoluteIndex(
          seriesData.episodes
        );
        const currentEpisode = allEpisodesEnriched.find(
          (ep) => String(ep.absolute_index) === absoluteEpisodeIndex
        );

        if (currentEpisode) {
          const animeInfo = seriesData.anime?.[0];

          const seasonText = currentEpisode.saison_ep && Math.max(seriesData.episodes.map(ep => ep.saison_ep || 1)) > 1 ? `S${currentEpisode.saison_ep}, ` : "";

          const metaData = {
            title: `${seasonText}${seasonText ? "Ép." : "Épisode"} ${currentEpisode.indice_ep} | ${seriesData.title} VOSTFR – BigSolo`,
            description: `Regardez l'épisode ${currentEpisode.indice_ep
              } de la saison ${currentEpisode.saison_ep || 1} de l'anime ${seriesData.title
              }${alternativeTitles} en VOSTFR.`,
            image: animeInfo?.cover_an || ogImageUrl,
          };

          const assetUrl = new URL("/templates/AnimePlayer.html", url.origin);
          let html = await env.ASSETS.fetch(assetUrl).then((res) => res.text());

          const tags = generateMetaTags({ ...metaData, url: url.href });
          html = html.replace("<!-- DYNAMIC_OG_TAGS_PLACEHOLDER -->", tags);

          const playerPayload = {
            series: seriesData,
            episodeNumber: absoluteEpisodeIndex,
          };
          html = html.replace(
            "<!-- PLAYER_DATA_PLACEHOLDER -->",
            JSON.stringify(playerPayload)
          );

          return new Response(html, {
            headers: { "Content-Type": "text/html;charset=UTF-8" },
          });
        }
        return next();
      } else {
        const metaData = {
          title: `${seriesData.title} (Anime VOSTFR) – BigSolo`,
          description: `Regardez tous les épisodes de l'anime ${seriesData.title}${alternativeTitles} en VOSTFR.`,
          image: seriesData.anime?.[0]?.cover_an || ogImageUrl,
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
    }

    if (pathSegments.length === 1) {
      const metaData = {
        title: `${seriesData.title} (Manga VF) – BigSolo`,
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

  return next();
}
