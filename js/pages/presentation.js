// js/pages/presentation.js

function initFaqAccordion() {
  const faqContainer = document.getElementById("qaContainer");
  if (!faqContainer) return;

  faqContainer.addEventListener("click", (event) => {
    const questionButton = event.target.closest(".faq-question");
    if (!questionButton) return;

    const targetId = questionButton.getAttribute("aria-controls");
    const answerPanel = document.getElementById(targetId);
    const isExpanded = questionButton.getAttribute("aria-expanded") === "true";

    questionButton.setAttribute("aria-expanded", !isExpanded);
    if (answerPanel) {
      if (!isExpanded) {
        answerPanel.removeAttribute("hidden");
        setTimeout(() => {
          answerPanel.style.maxHeight = answerPanel.scrollHeight + "px";
        }, 10);
      } else {
        answerPanel.style.maxHeight = null;
        answerPanel.addEventListener(
          "transitionend",
          () => {
            if (questionButton.getAttribute("aria-expanded") === "false") {
              answerPanel.setAttribute("hidden", "");
            }
          },
          { once: true }
        );
      }
    }
  });
}

async function loadQAData() {
  try {
    const response = await fetch("/data/presentation-data.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Could not load Q&A data:", error);
    return [];
  }
}

function displayQAItems(qaData) {
  const container = document.getElementById("qaContainer");
  if (!container) {
    console.error("QA container not found!");
    return;
  }
  container.innerHTML = ""; // Vide le conteneur

  // Créer les deux colonnes
  const column1 = document.createElement("div");
  column1.className = "faq-column";
  const column2 = document.createElement("div");
  column2.className = "faq-column";

  qaData.forEach((item, index) => {
    const answerId = `faq-answer-${index + 1}`;

    const faqItem = document.createElement("div");
    faqItem.className = "faq-item";

    const questionButton = document.createElement("button");
    questionButton.className = "faq-question";
    questionButton.setAttribute("aria-expanded", "false");
    questionButton.setAttribute("aria-controls", answerId);

    const questionTextSpan = document.createElement("span");
    questionTextSpan.textContent = item.question;

    const icon = document.createElement("i");
    icon.className = "faq-icon fas fa-chevron-down";

    questionButton.appendChild(questionTextSpan);
    questionButton.appendChild(icon);

    const authorP = document.createElement("p");
    authorP.className = "faq-author";
    authorP.textContent = item.author;

    const answerPanel = document.createElement("div");
    answerPanel.id = answerId;
    answerPanel.className = "faq-answer";
    answerPanel.setAttribute("hidden", "");
    answerPanel.innerHTML = item.answer_html;

    faqItem.appendChild(questionButton);
    faqItem.appendChild(authorP);
    faqItem.appendChild(answerPanel);

    // Distribuer l'item dans la bonne colonne
    if (index % 2 === 0) {
      // Les items pairs (0, 2, 4...) vont dans la colonne 1
      column1.appendChild(faqItem);
    } else {
      // Les items impairs (1, 3, 5...) vont dans la colonne 2
      column2.appendChild(faqItem);
    }
  });

  // Ajouter les colonnes remplies au conteneur principal
  container.appendChild(column1);
  container.appendChild(column2);
}

function randomlyOpenFaqItems() {
  // 1. Sélectionner tous les items de la FAQ
  const allFaqItems = document.querySelectorAll(".faq-item");
  if (allFaqItems.length === 0) {
    return; // Pas d'items à ouvrir
  }

  console.log(
    `[FAQ] Tentative d'ouverture aléatoire pour ${allFaqItems.length} items.`
  );

  // 2. Itérer sur chaque item
  allFaqItems.forEach((item, index) => {
    // 3. Pour chaque item, 50% de chance de l'ouvrir
    if (Math.random() >= 0.5) {
      // 4. Trouver le bouton de la question et simuler un clic
      const questionButton = item.querySelector(".faq-question");
      if (questionButton) {
        console.log(`[FAQ] Ouverture de l'item #${index + 1}`);
        questionButton.click();
      }
    }
  });
}

export async function initPresentationPage() {
  console.log("Initializing Presentation Page with new FAQ design...");
  const qaData = await loadQAData();
  const container = document.getElementById("qaContainer");

  if (qaData && qaData.length > 0) {
    displayQAItems(qaData);
    initFaqAccordion();

    setTimeout(() => {
      /* --- DEBUT MODIFICATION --- */
      randomlyOpenFaqItems(); // On appelle la nouvelle fonction qui gère plusieurs items
      /* --- FIN MODIFICATION --- */
    }, 100);
  } else {
    if (container) {
      container.innerHTML =
        "<p>Erreur lors du chargement des questions et réponses. Veuillez réessayer plus tard.</p>";
    }
  }
}
