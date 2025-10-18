import { json } from "../../../js/utils/apiFunctions";
import { slugify } from "../../../js/utils/domUtils";

export async function onRequest(context) {
    const { env } = context;

    const config = await (await env.ASSETS.fetch("https://bigsolo.org/data/config.json")).json();
    const seriesJsons = config.LOCAL_SERIES_FILES;
    const series = await Promise.all(
        seriesJsons.map(async (seriesFile) => {
            const res = await env.ASSETS.fetch("https://bigsolo.org/data/series/" + seriesFile);
            const seriesData = await res.json();

            // Get the last chapter and episode
            const chapters = seriesData.chapters || {};
            const chapterNumbers = Object.keys(chapters).map(Number);
            const lastChapter = {
                number: Math.max(...chapterNumbers, 0),
                ...chapters[Math.max(...chapterNumbers, 0).toString()],
                source: undefined,
            };
            const lastEpisode = seriesData.episodes && seriesData.episodes.length > 0 ? {
                number: seriesData.episodes?.[seriesData.episodes?.length - 1]?.number || undefined,
                ...seriesData.episodes?.[seriesData.episodes?.length - 1],
                sources: undefined,
            } : undefined;

            return {
                title: seriesData.title,
                slug: slugify(seriesData.title),
                cover: {
                    ...seriesData.covers?.[0],
                    volume: undefined,
                },
                os: seriesData.os || false,
                tags: seriesData.tags || [],
                description: seriesData.description || "",
                status: seriesData.status,
                last_chapter: lastChapter,
                last_episode: lastEpisode,
            };
        })
    );

    // Load recommendations
    const response = await env.ASSETS.fetch("http://localhost/data/reco.json");
    const recoList = await response.json();
    const enrichedReco = await Promise.all(
        recoList.map(async (reco) => {
            const res = await env.ASSETS.fetch("https://bigsolo.org/data/series/" + reco.file);
            const seriesData = await res.json();
            const baseSeries = series.find(s => slugify(s.title) === slugify(seriesData.title));

            return {
                ...baseSeries,
                character_image: reco.characterImage || `/img/reco/${reco.file.replace(".json", ".png")}`,
                color: reco.color,
            };
        })
    );

    return json({
        series: series.filter(s => !s.os),
        os: series.filter(s => s.os),
        reco: enrichedReco,
        slugs: series.map(s => s.slug),
    });
}