// js/utils/dateUtils.js

export function parseDateToTimestamp(dateInput) {
  if (
    dateInput === null ||
    typeof dateInput === "undefined" ||
    dateInput === ""
  )
    return NaN;

  let timestamp;

  if (typeof dateInput === "string") {
    // Essayer de le convertir en nombre d'abord (pour les timestamps Unix en string)
    const numericValue = parseInt(dateInput, 10);
    if (!isNaN(numericValue) && String(numericValue) === dateInput) {
      // S'assure que c'est bien une chaîne de chiffres
      // Supposé être un timestamp en secondes si c'est une chaîne
      timestamp = numericValue * 1000;
    } else {
      // Sinon, essayer de parser comme format YYYY-MM-DD HH:MM:SS
      const parts = dateInput.split(" ");
      const dateParts = parts[0].split("-");
      const timeParts = parts[1] ? parts[1].split(":") : ["00", "00", "00"];

      if (dateParts.length === 3) {
        timestamp = Date.UTC(
          parseInt(dateParts[0], 10),
          parseInt(dateParts[1], 10) - 1,
          parseInt(dateParts[2], 10),
          parseInt(timeParts[0] || "0", 10),
          parseInt(timeParts[1] || "0", 10),
          parseInt(timeParts[2] || "0", 10)
        );
      } else {
        timestamp = NaN;
      }
    }
  } else if (typeof dateInput === "number") {
    // Si c'est un nombre, on suppose que c'est déjà un timestamp.
    // Si c'est des secondes (comme de Cubari), multiplier par 1000.
    timestamp = dateInput < 30000000000 ? dateInput * 1000 : dateInput; // Augmenté le seuil pour les timestamps futurs
  } else {
    timestamp = NaN;
  }
  return timestamp;
}

export function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.round(ms / 1000);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }
  return `${seconds}s`;
}

// ... timeAgo et formatDateForGallery restent inchangés pour l'instant ...
// Mais ils dépendent de la correction de parseDateToTimestamp.
// Vérifie que formatDateForGallery utilise bien le bon timestamp pour les dates de colos.json
// colos.json a des dates comme "2025-04-24 00:00:00", ce qui devrait être bien géré par la partie YYYY-MM-DD.
export function timeAgo(dateInput) {
  const timestamp = parseDateToTimestamp(dateInput);
  if (isNaN(timestamp)) {
    // console.warn("timeAgo: Invalid date input, resulted in NaN timestamp:", dateInput);
    return "Date inconnue";
  }

  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.round(diff / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  // const weeks = Math.round(days / 7);

  if (seconds < 5) return "à l’instant";
  if (seconds < 60) return `${seconds} sec`;
  if (minutes < 60) return `${minutes} min`;
  if (hours < 24) return `${hours} h`;
  if (days < 7) return `${days} j`;

  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateForGallery(dateInput) {
  // Renommé dateInput pour clarté
  if (
    dateInput === null ||
    typeof dateInput === "undefined" ||
    dateInput === ""
  )
    return "Date inconnue";
  const timestamp = parseDateToTimestamp(dateInput);
  if (isNaN(timestamp)) {
    // console.warn("formatDateForGallery: Invalid date input, resulted in NaN timestamp:", dateInput);
    return "Date invalide";
  }
  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
