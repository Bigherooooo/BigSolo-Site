// js/utils/usernameGenerator.js
import { fetchData } from "./fetchUtils.js";

let avatarsCache = null;

async function getAvatars() {
  if (avatarsCache) {
    return avatarsCache;
  }
  try {
    const avatarList = await fetchData("/data/avatars.json");
    if (!Array.isArray(avatarList) || avatarList.length === 0) {
      throw new Error("La liste d'avatars est vide ou invalide.");
    }
    avatarsCache = avatarList;
    return avatarsCache;
  } catch (error) {
    console.error("Impossible de charger la liste des avatars:", error);
    return []; // Retourne une liste vide en cas d'erreur
  }
}

function getLocalUserIdentity(key) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    return null;
  }
}

function setLocalUserIdentity(key, identity) {
  try {
    localStorage.setItem(key, JSON.stringify(identity));
  } catch (e) {
    console.error("Impossible de sauvegarder l'identité de l'utilisateur.", e);
  }
}

// fonction exportée pour functions/api/log-action.js
export function generateIdentityFromAvatar(avatarFilename) {
  const username = avatarFilename
    .replace(".jpg", "")
    .replace(".png", "")
    .replace(/_/g, " ");
  const avatarUrl = `/img/profilpicture/${avatarFilename}`;

  return { username, avatarUrl };
}

export async function assignUserIdentityForChapter(interactionKey) {
  const identityKey = `identity_${interactionKey}`;

  const existingIdentity = getLocalUserIdentity(identityKey);
  if (existingIdentity) {
    return existingIdentity;
  }

  const avatars = await getAvatars();
  if (avatars.length === 0) {
    return {
      username: "Visiteur Anonyme",
      avatarUrl: "/img/profil.png",
    };
  }

  const randomAvatarFilename =
    avatars[Math.floor(Math.random() * avatars.length)];

  const newIdentity = generateIdentityFromAvatar(randomAvatarFilename);
  setLocalUserIdentity(identityKey, newIdentity);

  return newIdentity;
}
