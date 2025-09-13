// --- File: functions/api/log-action.js ---
import { slugify } from "../../js/utils/domUtils.js";
import { generateIdentityFromAvatar } from "../../js/utils/usernameGenerator.js";

// Durée du verrouillage en secondes. Un utilisateur ne pourra soumettre qu'une fois toutes les X secondes.
// 300 secondes = 5 minutes. C'est une bonne valeur de départ.
const LOCK_DURATION_SECONDS = 300;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Méthode non autorisée", { status: 405 });
  }

  // --- LOGIQUE DE VERROUILLAGE PAR IP (AVEC SIMULATION LOCALE) ---
  let clientIp = request.headers.get("CF-Connecting-IP");

  // Si on est en développement local (détecté par la présence de .dev.vars), on simule une IP.
  // env.ADMIN_USERNAME est juste un moyen pratique de détecter l'environnement local.
  const isDevelopment = env.ADMIN_USERNAME !== "";
  if (!clientIp && isDevelopment) {
    clientIp = "127.0.0.1"; // On simule une IP locale
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
        { status: 429 } // 429 Too Many Requests est le code approprié
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
    // En cas d'erreur de lecture KV, on choisit de laisser passer pour ne pas bloquer un utilisateur légitime.
  }

  try {
    const interaction = await request.json();
    const { actions } = interaction;
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
    const seriesFilename = seriesFiles.find(
      (filename) => slugify(filename.replace(".json", "")) === seriesSlug
    );

    if (!seriesFilename) {
      console.log(
        `[API log-action] [REJECTED] La série avec le slug '${seriesSlug}' n'existe pas.`
      );
      return new Response(JSON.stringify({ error: "La série n'existe pas." }), {
        status: 400,
      });
    }
    const series = {
      data: await env.ASSETS.fetch(
        new URL(`/data/series/${seriesFilename}`, request.url)
      ).then((res) => res.json()),
      filename: seriesFilename,
    };

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
      // "true" est une valeur légère. Le plus important est la durée d'expiration.
      await env.INTERACTIONS_LOG.put(lockKey, "true", {
        expirationTtl: LOCK_DURATION_SECONDS,
      });
      console.log(
        `[API log-action] [LOCKED] Verrou créé pour l'IP ${clientIp} pour une durée de ${LOCK_DURATION_SECONDS} secondes.`
      );
    }

    // On ajoute l'IP au nom de la clé de log pour la retrouver plus tard
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const logKey = `log:${seriesSlug}:${clientIp || "unknown"}:${uniqueId}`;

    await env.INTERACTIONS_LOG.put(logKey, JSON.stringify(actionsSanitized));
    console.log(
      `[API log-action] [SUCCESS] Log écrit dans KV avec la clé : ${logKey}`
    );

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
  try {
    if (
      [
        "like",
        "unlike",
        "add_comment",
        "like_comment",
        "unlike_comment",
      ].includes(interaction.type)
    ) {
      if (!series.data.chapters || !series.data.chapters[interaction.chapter]) {
        throw new Error("Le chapitre n'existe pas.");
      }
    }

    switch (interaction.type) {
      case "like":
      case "unlike":
        if (typeof interaction.chapter !== "string") {
          throw new Error(
            "Identifiant de chapitre invalide pour un like/unlike."
          );
        }
        return { chapter: interaction.chapter, type: interaction.type };

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
          typeof interaction.chapter !== "string" ||
          typeof interaction.payload?.commentId !== "string"
        ) {
          throw new Error("Données de like/unlike de commentaire invalides.");
        }
        return {
          chapter: interaction.chapter,
          type: interaction.type,
          payload: { commentId: interaction.payload.commentId },
        };

      case "add_comment":
        const { id, username, avatarUrl, comment, timestamp } =
          interaction.payload;
        if (
          typeof id !== "string" ||
          typeof username !== "string" ||
          typeof avatarUrl !== "string" ||
          !avatarUrl.startsWith("/img/profilpicture/") ||
          typeof comment !== "string" ||
          typeof timestamp !== "number"
        ) {
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
          identifier.length !== 7 ||
          parseInt(idTimestamp) !== timestamp
        ) {
          throw new Error("Format d'identifiant de commentaire invalide.");
        }

        const chapterTimestamp =
          parseInt(series.data.chapters[interaction.chapter].last_updated) *
          1000;
        if (
          timestamp < chapterTimestamp - 15 * 60 * 1000 ||
          timestamp > Date.now() + 5 * 60 * 1000
        ) {
          throw new Error("Le commentaire a été posté à une date improbable.");
        }

        return {
          chapter: interaction.chapter,
          type: "add_comment",
          payload: { id, username, avatarUrl, comment, timestamp, likes: 0 },
        };

      default:
        throw new Error(`Type d'interaction inconnu: ${interaction.type}`);
    }
  } catch (e) {
    console.warn(
      `[API log-action CHECK] Interaction malformée ignorée: "${e.message}"`,
      interaction
    );
    return null;
  }
}
