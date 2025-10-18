import { json } from "../../../js/utils/apiFunctions";
import { slugify } from "../../../js/utils/domUtils";

export async function onRequest(context) {
    const { env } = context;
    const { seriesSlug } = context.params;

    const response = await env.ASSETS.fetch("https://bigsolo.org/data/config.json");
    const config = await response.json();
    const seriesJsons = config.LOCAL_SERIES_FILES;

    const allSeries = await Promise.all(
        seriesJsons.map(async (seriesFile) => {
            const res = await env.ASSETS.fetch("https://bigsolo.org/data/series/" + seriesFile);
            return res.json();
        })
    );

    const matchingSeries = allSeries.find(series => slugify(series.title) === seriesSlug);

    if (!matchingSeries) {
        return new Response('Series not found', { status: 404 });
    }

    const formattedSeries = {
        slug: slugify(matchingSeries.title),
        ...matchingSeries,
        chapters: matchingSeries.chapters ? {
            ...Object.fromEntries(
                Object.entries(matchingSeries.chapters).map(([chapNum, chapData]) => [
                    chapNum,
                    {
                        ...chapData,
                        source: undefined,
                    },
                ])
            ),
        } : {},
        episodes: matchingSeries.episodes ? matchingSeries.episodes.map(ep => ({
            ...ep,
            sources: undefined,
        })) : [],
    };

    return json(formattedSeries);
}