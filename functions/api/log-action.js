// functions/api/log-action.js

import { slugify } from "../../js/utils/domUtils";
import { generateIdentityFromAvatar } from "../../js/utils/usernameGenerator";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  try {
    const interaction = await request.json();
    const { actions } = interaction;

    // on slugify le seriesSlug pour continuer à recevoir les actions non envoyées avant la v2
    // vu que ce sont déjà des slug, ils ne devraient pas changer
    let seriesSlug = slugify(interaction.seriesSlug);

    if (!interaction.seriesSlug || !Array.isArray(actions) || actions.length === 0) {
      return new Response(JSON.stringify({ error: "Données invalides." }), {
        status: 400,
      });
    }

    // check si l'interaction est pour une oeuvre qui existe
    const config = await env.ASSETS.fetch(
      new URL("/data/config.json", request.url)
    ).then((res) => res.json());
    const seriesFiles = config.LOCAL_SERIES_FILES || [];
    const allSeriesDataPromises = seriesFiles.map((filename) =>
      env.ASSETS.fetch(new URL(`/data/series/${filename}`, request.url))
        .then((res) => res.json().then((data) => ({ data, filename })))
        .catch(() => null)
    );
    const allSeriesResults = (await Promise.all(allSeriesDataPromises)).filter(
      Boolean
    );

    const foundSeries = allSeriesResults.find(
      (s) => s && s.data && slugify(s.data.title) === seriesSlug
    );

    if (!foundSeries) {
      return new Response(JSON.stringify({ error: "La série n'existe pas." }), {
        status: 400,
      });
    }

    let actionsSanitized = await Promise.all(
      actions.map(action => checkAndSanitizeStructure({
        interaction: action,
        slug: seriesSlug,
        series: foundSeries,
        context,
      }))
    );
    actionsSanitized = actionsSanitized.filter(action => action !== undefined && action !== null);
    if (actionsSanitized.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune action valide." }), {
        status: 400,
      });
    }

    console.log("[API log-action] Reçu une requête log-action");

    // on écrit les actions dans une nouvelle clé unique à chaque envoi
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const logKey = `log:${seriesSlug}:${uniqueId}`;
    await env.INTERACTIONS_LOG.put(logKey, JSON.stringify(actionsSanitized));

    return new Response(
      JSON.stringify({ success: true, logged: actionsSanitized.length }),
      { status: 200 }
    );
  } catch (error) {
    console.error("[API log-action] Erreur:", error);
    return new Response(
      JSON.stringify({ error: "Erreur interne du serveur." }),
      { status: 500 }
    );
  }
}

async function checkAndSanitizeStructure({ interaction, context, series }) {
  try {
    // check si le chapitre pour lequel on ajoute une interaction existe
    if (["rate", "like_comment", "unlike_comment", "add_comment", "like", "unlike"].includes(interaction.type)) {
      if (!series.data.chapters || !series.data.chapters[interaction.chapter]) {
        throw new Error("Le chapitre n'existe pas.");
      }
    }

    switch (interaction.type) {
      // like/unlike chapitre
      case "like":
        if (typeof interaction.chapter !== "string") {
          throw new Error("Identifiant de chapitre invalide pour un like.");
        }
        return {
          chapter: interaction.chapter, type: "like"
        };

      case "unlike":
        if (typeof interaction.chapter !== "string") {
          throw new Error("Identifiant de chapitre invalide pour un unlike.");
        }
        return {
          chapter: interaction.chapter, type: "unlike"
        };

      // notation/score série
      case "rate":
        if (
          typeof interaction.payload !== "object" ||
          typeof interaction.payload.value !== "number" ||
          interaction.payload.value < 1 ||
          interaction.payload.value > 10
        ) {
          throw new Error("Données de notation invalides.");
        }
        return {
          type: "rate",
          payload: { value: interaction.payload.value },
        };

      // commentaires
      case "like_comment":
        if (
          typeof interaction.chapter !== "string" ||
          typeof interaction.payload !== "object" ||
          typeof interaction.payload.commentId !== "string"
        ) {
          throw new Error("Données de like de commentaire invalides.");
        }
        return {
          chapter: interaction.chapter,
          type: "like_comment",
          payload: { commentId: interaction.payload.commentId },
        };

      case "unlike_comment":
        if (
          typeof interaction.chapter !== "string" ||
          typeof interaction.payload !== "object" ||
          typeof interaction.payload.commentId !== "string"
        ) {
          throw new Error("Données de unlike de commentaire invalides.");
        }
        return {
          chapter: interaction.chapter,
          type: "unlike_comment",
          payload: { commentId: interaction.payload.commentId },
        };

      case "add_comment":
        if (
          typeof interaction.chapter !== "string" ||
          typeof interaction.payload !== "object" ||
          typeof interaction.payload.id !== "string" ||
          typeof interaction.payload.username !== "string" ||
          typeof interaction.payload.avatarUrl !== "string" ||
          !interaction.payload.avatarUrl.startsWith("/img/profilpicture/") ||
          typeof interaction.payload.comment !== "string" ||
          typeof interaction.payload.timestamp !== "number"
        ) {
          throw new Error("Données de commentaire invalides.");
        }

        // check si l'avatar et username correspondent à une identité générée par bigsolo
        const response = await context.env.ASSETS.fetch(new URL('/data/avatars.json', context.request.url).toString());
        let avatars = await response.json();
        for (const avatar of avatars) {
          generateIdentityFromAvatar(avatar);
        }

        const isValidIdentity = avatars.some(avatar => {
          const identity = generateIdentityFromAvatar(avatar);
          return (
            identity.username === interaction.payload.username &&
            identity.avatarUrl === interaction.payload.avatarUrl
          );
        });

        if (!isValidIdentity) {
          throw new Error("Identité d'utilisateur invalide pour le commentaire.");
        }

        // check si le timestamp correspond à l'identifiant du commentaire
        const [idTimestamp, identifier] = interaction.payload.id.split('_');
        if (!idTimestamp || !identifier ||
          idTimestamp.length !== 13 ||
          identifier.length !== 7 ||
          parseInt(idTimestamp) !== interaction.payload.timestamp) {
          throw new Error("Format d'identifiant de commentaire invalide.");
        }

        // check si l'utilisateur a posté son commentaire après la sortie du manga (avec 15 min de marge) et n'est pas une date dans le futur
        // devrait éviter pas mal de commentaires potentiellement frauduleux
        if (interaction.payload.timestamp - (15 * 60 * 1000) < parseInt(series.data.chapters[interaction.chapter].last_updated) * 1000
          || new Date(interaction.payload.timestamp).getTime() < Date.now()) {
          throw new Error("L'utilisateur a posté son commentaire à une date improbable.")
        }

        return {
          chapter: interaction.chapter,
          type: "add_comment",
          payload: {
            id: interaction.payload.id,
            username: interaction.payload.username,
            avatarUrl: interaction.payload.avatarUrl,
            comment: interaction.payload.comment,
            timestamp: interaction.payload.timestamp,
            likes: 0,
          },
        };
    }
  } catch (e) {
    console.error("[API log-action CHECK] Interaction malformée détectée et ignorée:", e.message);
    return
  }
}