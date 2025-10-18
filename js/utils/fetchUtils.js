// js/utils/fetchUtils.js
import { slugify } from './domUtils.js'; // Assurez-vous que slugify est bien importé

let CONFIG_CACHE = null;

/**
 * Fonction de fetch générique avec gestion des erreurs.
 * @param {string} url - L'URL à fetch.
 * @param {object} [options={}] - Options pour fetch.
 * @returns {Promise<any>} Les données JSON parsées ou le texte brut en cas d'erreur de parsing JSON.
 */
export async function fetchData(url, options = {}) {
  const fetchOptions = { method: 'GET', ...options };
  
  try {
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      let errorBody = "No error body.";
      try {
        errorBody = await response.text();
      } catch (textError) {
        console.warn("Could not read error response body as text.", textError);
      }
      throw new Error(`HTTP error! status: ${response.status} for ${url}. Body: ${errorBody.substring(0, 200)}`);
    }

    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch (jsonError) {
      console.warn(`Response from ${url} was not valid JSON. Content: "${responseText.substring(0, 100)}..."`, jsonError);
      throw new Error(`Failed to parse JSON from ${url}. Content: ${responseText.substring(0, 100)}`);
    }

  } catch (error) {
    console.error(`Could not fetch or process data from ${url}:`, error);
    throw error;
  }
}

/**
 * Récupère TOUTES les données des séries. Utile pour la page d'accueil.
 */
export async function fetchAllSeriesData() {
  const seriesData = await (await fetch("/data/series")).json();  
  return seriesData;
}