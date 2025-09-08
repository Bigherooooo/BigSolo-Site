// --- File: js/admin/auth.js ---
import { qs } from "../utils/domUtils.js";
import { initDashboard } from "./dashboard.js";

/**
 * Affiche le formulaire de connexion dans le conteneur principal.
 * @param {HTMLElement} container - L'élément #app-root.
 */
export function renderLoginView(container) {
  container.innerHTML = `
    <div class="login-view">
      <div class="login-container">
        <h1>Connexion Admin</h1>
        <form id="login-form">
          <div class="form-group">
            <label for="username">Nom d'utilisateur</label>
            <input type="text" id="username" required />
          </div>
          <div class="form-group">
            <label for="password">Mot de passe</label>
            <input type="password" id="password" required />
          </div>
          <button type="submit">Se connecter</button>
        </form>
        <p id="error-message" class="error-message"></p>
      </div>
    </div>
  `;
}

/**
 * Gère la soumission du formulaire de connexion.
 */
export function handleLogin() {
  const form = qs("#login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = qs("#username").value;
    const password = qs("#password").value;
    const errorMessage = qs("#error-message");
    errorMessage.style.display = "none";

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        sessionStorage.setItem("admin_token", result.token);
        // Connexion réussie, on réinitialise l'application pour afficher le tableau de bord
        initDashboard(qs("#app-root"), result.token);
      } else {
        errorMessage.textContent = result.message || "Une erreur est survenue.";
        errorMessage.style.display = "block";
      }
    } catch (error) {
      errorMessage.textContent = "Erreur de connexion au serveur.";
      errorMessage.style.display = "block";
    }
  });
}
