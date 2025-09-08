// --- File: js/admin/main.js ---
import { renderLoginView, handleLogin } from "./auth.js";
import { initDashboard } from "./dashboard.js";

const appRoot = document.getElementById("app-root");

// Point d'entrée de l'application d'administration
function initAdminApp() {
  const token = sessionStorage.getItem("admin_token");

  if (token) {
    // Si l'utilisateur est déjà connecté, afficher le tableau de bord
    initDashboard(appRoot, token);
  } else {
    // Sinon, afficher la page de connexion
    renderLoginView(appRoot);
    handleLogin();
  }
}

// Lancer l'application une fois que le DOM est prêt
document.addEventListener("DOMContentLoaded", initAdminApp);
