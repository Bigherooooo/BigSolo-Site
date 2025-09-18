// --- File: functions/api/log-action.js ---
import { slugify } from "../../js/utils/domUtils.js";
import { generateIdentityFromAvatar } from "../../js/utils/usernameGenerator.js";

const LOCK_DURATION_SECONDS = 300;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  let clientIp = request.headers.get("CF-Connecting-IP");
  const isDevelopment = env.ADMIN_USERNAME !== "";
  if (!clientIp && isDevelopment) {
    clientIp = "127.0.0.1";
    console.log(
      `[API log-action] [DEV_MODE] Simulation de l'adresse IP : ${clientIp}`
    );
  }

  if (!clientIp) {
    console.warn(
      "[API log-action] [WARN] Adresse IP du client non trouvée. Impossible de vérifier le verrou."
    );
  }

  const lockKey = `lock:${clientIp}`;

  try {
    const existingLock = await env.INTERACTIONS_LOG.get(lockKey);
    if (existingLock) {
      console.log(
        `[API log-action] [BLOCKED] Requête bloquée pour l'IP ${clientIp}. Un verrou existe déjà.`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Vous avez déjà soumis des actions récemment. Veuillez patienter.",
        }),
        { status: 429 }
      );
    }
    console.log(
      `[API log-action] [OK] IP ${clientIp} n'est pas verrouillée. Traitement en cours.`
    );
  } catch (kvError) {
    console.error(
      `[API log-action] [ERROR] Erreur lors de la lecture du KV pour la clé de verrouillage: ${lockKey}`,
      kvError
    );
  }

  try {
    const interaction = await request.json();
    const { actions, sessionId } = interaction;
    const seriesSlug = slugify(interaction.seriesSlug);

    if (!seriesSlug || !Array.isArray(actions) || actions.length === 0) {
      console.log(
        "[API log-action] [REJECTED] Données invalides ou actions manquantes."
      );
      return new Response(JSON.stringify({ error: "Données invalides." }), {
        status: 400,
      });
    }

    const config = await env.ASSETS.fetch(
      new URL("/data/config.json", request.url)
    ).then((res) => res.json());
    const seriesFiles = config.LOCAL_SERIES_FILES || [];

    // On charge tous les fichiers de série pour pouvoir comparer les slugs basés sur les titres
    const allSeriesDataPromises = seriesFiles.map((filename) =>
      env.ASSETS.fetch(new URL(`/data/series/${filename}`, request.url))
        .then((res) => res.json().then((data) => ({ data, filename })))
        .catch(() => null)
    );
    const allSeriesResults = (await Promise.all(allSeriesDataPromises)).filter(
      Boolean
    );

    // On cherche la série en comparant le slug reçu avec le slug du TITRE de chaque série
    const foundSeries = allSeriesResults.find(
      (s) => s && s.data && slugify(s.data.title) === seriesSlug
    );

    if (!foundSeries) {
      console.log(
        `[API log-action] [REJECTED] La série avec le slug '${seriesSlug}' n'existe pas.`
      );
      return new Response(JSON.stringify({ error: "La série n'existe pas." }), {
        status: 400,
      });
    }
    const series = foundSeries;

    let actionsSanitized = await Promise.all(
      actions.map((action) =>
        checkAndSanitizeStructure({
          interaction: action,
          series: series,
          context: context,
        })
      )
    );
    actionsSanitized = actionsSanitized.filter(
      (action) => action !== undefined && action !== null
    );

    if (actionsSanitized.length === 0) {
      console.log(
        "[API log-action] [REJECTED] Aucune action valide après la sanitisation."
      );
      return new Response(JSON.stringify({ error: "Aucune action valide." }), {
        status: 400,
      });
    }

    console.log(
      `[API log-action] [PROCESSING] ${actionsSanitized.length} action(s) validée(s) pour la série '${seriesSlug}'.`
    );

    if (clientIp) {
      await env.INTERACTIONS_LOG.put(lockKey, "true", {
        expirationTtl: LOCK_DURATION_SECONDS,
      });
      console.log(
        `[API log-action] [LOCKED] Verrou créé pour l'IP ${clientIp}...`
      );
    }

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const logKey = `log:${seriesSlug}:${clientIp || "unknown"}:${uniqueId}`;

    await env.INTERACTIONS_LOG.put(logKey, JSON.stringify(actionsSanitized));
    console.log(
      `[API log-action] [SUCCESS] Log écrit dans KV avec la clé : ${logKey}`
    );

    if (sessionId) {
      await env.INTERACTIONS_LOG.put(`cleaned:${sessionId}`, "true", {
        expirationTtl: 600,
      });
      console.log(
        `[API log-action] [CLEANUP] Marqueur de nettoyage posé pour la session ID: ${sessionId}`
      );
    }

    return new Response(
      JSON.stringify({ success: true, logged: actionsSanitized.length }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API log-action] [FATAL] Erreur interne du serveur:", error);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur." }),
      { status: 500 }
    );
  }
}

async function checkAndSanitizeStructure({ interaction, context, series }) {
  const { chapter, type } = interaction;
  const isEpisodeAction =
    typeof chapter === "string" && chapter.startsWith("ep-");

  try {
    if (isEpisodeAction) {
      if (!series.data.episodes || !Array.isArray(series.data.episodes)) {
        throw new Error("Cette série n'a pas d'épisodes.");
      }
      const epIdentifier = chapter.substring(3);
      const episodeExists = series.data.episodes.some(
        (ep) => `S${ep.saison_ep || 1}-${ep.indice_ep}` === epIdentifier
      );
      if (!episodeExists) {
        throw new Error(
          `L'épisode '${epIdentifier}' n'existe pas pour cette série.`
        );
      }
    } else if (
      [
        "like",
        "unlike",
        "add_comment",
        "like_comment",
        "unlike_comment",
      ].includes(type)
    ) {
      if (!series.data.chapters || !series.data.chapters[chapter]) {
        throw new Error(
          `Le chapitre '${chapter}' n'existe pas pour cette série.`
        );
      }
    }

    switch (type) {
      case "like":
      case "unlike":
        if (typeof chapter !== "string") {
          throw new Error(
            "Identifiant de chapitre/épisode invalide pour un like/unlike."
          );
        }
        return { chapter, type };

      case "rate":
        if (
          typeof interaction.payload?.value !== "number" ||
          interaction.payload.value < 1 ||
          interaction.payload.value > 10
        ) {
          throw new Error("Données de notation invalides.");
        }
        return { type: "rate", payload: { value: interaction.payload.value } };

      case "like_comment":
      case "unlike_comment":
        if (
          typeof chapter !== "string" ||
          typeof interaction.payload?.commentId !== "string"
        ) {
          throw new Error("Données de like/unlike de commentaire invalides.");
        }
        return {
          chapter,
          type,
          payload: { commentId: interaction.payload.commentId },
        };

      case "add_comment":
        const { id, username, avatarUrl, comment, timestamp } =
          interaction.payload;
        if (!id || !username || !avatarUrl || !comment || !timestamp) {
          throw new Error("Structure de commentaire invalide.");
        }
        const response = await context.env.ASSETS.fetch(
          new URL("/data/avatars.json", context.request.url).toString()
        );
        const avatars = await response.json();
        const isValidIdentity = avatars.some((avatar) => {
          const identity = generateIdentityFromAvatar(avatar);
          return (
            identity.username === username && identity.avatarUrl === avatarUrl
          );
        });
        if (!isValidIdentity) {
          throw new Error(
            "Identité d'utilisateur invalide pour le commentaire."
          );
        }
        const [idTimestamp, identifier] = id.split("_");
        if (
          !idTimestamp ||
          !identifier ||
          idTimestamp.length !== 13 ||
          parseInt(idTimestamp) !== timestamp
        ) {
          throw new Error("Format d'identifiant de commentaire invalide.");
        }
        return {
          chapter,
          type,
          payload: { id, username, avatarUrl, comment, timestamp, likes: 0 },
        };

      default:
        throw new Error(`Type d'interaction inconnu: ${type}`);
    }
  } catch (e) {
    console.warn(
      `[API log-action CHECK] Interaction malformée ignorée: "${e.message}"`,
      interaction
    );
    return null;
  }
}
