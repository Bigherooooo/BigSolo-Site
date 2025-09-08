// js/theme-init.js

// La partie IIFE (Immediately Invoked Function Expression) reste la même pour l'anti-flash
(function () {
  try {
    const savedTheme = localStorage.getItem('mv-theme');
    const prefersDarkSys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const htmlEl = document.documentElement;
    // Il est possible que document.body soit null ici si le script est dans le <head>
    // et exécuté avant que le <body> ne soit parsé.
    // La synchro se fera plus tard avec syncBodyThemeClass.

    const applyDarkTheme = () => {
      htmlEl.classList.add('dark');
      // htmlEl.style.backgroundColor = '#15171a'; // Géré par CSS
      // htmlEl.style.color = '#eceff4'; // Géré par CSS
    };

    const applyLightTheme = () => {
      htmlEl.classList.remove('dark');
      // htmlEl.style.backgroundColor = '#f7f8fc'; // Géré par CSS
      // htmlEl.style.color = '#222831'; // Géré par CSS
    };

    if (savedTheme === 'dark' || (!savedTheme && prefersDarkSys)) {
      applyDarkTheme();
    } else {
      applyLightTheme();
    }
  } catch (e) {
    console.error("Error applying initial theme:", e);
  }
})();

function syncBodyThemeClass() {
    if (document.body) { // Vérifier que document.body existe
        if (document.documentElement.classList.contains('dark')) {
            if (!document.body.classList.contains('dark')) {
                document.body.classList.add('dark');
            }
        } else {
            if (document.body.classList.contains('dark')) {
                document.body.classList.remove('dark');
            }
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncBodyThemeClass);
} else {
    syncBodyThemeClass();
}

// Attacher les fonctions à l'objet window pour les rendre globales
window.themeUtils = {
  toggleTheme: function() {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const isDark = htmlEl.classList.toggle('dark');
    
    if (bodyEl) bodyEl.classList.toggle('dark', isDark);

    localStorage.setItem("mv-theme", isDark ? "dark" : "light");

    return isDark;
  },

  getCurrentTheme: function() {
    const savedTheme = localStorage.getItem('mv-theme');
    const prefersDarkSys = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDarkSys)) {
      return 'dark';
    }
    return 'light';
  }
};