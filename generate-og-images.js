// generate-og-images.js
import fs from "fs/promises";
import path from "path";
import satori from "satori";
import { html } from "satori-html";

// Fonction pour lire un fichier local (comme une police)
const readFile = (filePath) => fs.readFile(path.join(process.cwd(), filePath));

// Fonction principale asynchrone
async function generateImages() {
  console.log("🚀 Démarrage de la génération des images OG...");

  const [fontRegular, fontSemiBold, fontBold] = await Promise.all([
    readFile("./fonts/Urbanist-Regular.ttf"),
    readFile("./fonts/Urbanist-SemiBold.ttf"),
    readFile("./fonts/Urbanist-Bold.ttf"),
  ]);
  console.log("✅ Polices chargées.");

  const configPath = "./data/config.json";
  const config = JSON.parse(await readFile(configPath));
  const seriesFiles = config.LOCAL_SERIES_FILES;
  console.log(`🔎 ${seriesFiles.length} séries trouvées.`);

  const outputDir = "./img/banner";
  await fs.mkdir(outputDir, { recursive: true });

  for (const filename of seriesFiles) {
    const seriesPath = `./data/series/${filename}`;
    try {
      const seriesData = JSON.parse(await readFile(seriesPath));

      const title = seriesData.title || "Titre non disponible";
      const author = seriesData.author || seriesData.artist || "Auteur inconnu";

      const coverUrl = seriesData.cover_low || seriesData.cover_hq;
      if (!coverUrl) {
        console.warn(
          `⚠️ Pas de 'cover_low' ou 'cover_hq' trouvée pour "${title}". Saut de cette image.`
        );
        continue;
      }

      console.log(`🎨 Génération de l'image pour "${title}"...`);

      const template = html`
        <div
          style="width: 100%; height: 100%; position: relative; display: flex; flex-direction: row; font-family: 'Urbanist'; color: #ffffff; overflow: hidden;"
        >
          <img
            src="${coverUrl}"
            style="position: absolute; object-fit: cover; filter: blur(14px) brightness(0.4); width: 105%; height: 105%; top: -2.5%; left: -2.5%;"
          />
          <div
            style="position: relative; display: flex; flex-direction: row; width: 100%; height: 100%; gap: 48px;"
          >
            <img
              src="${coverUrl}"
              style="height: 100%; width: 420px; object-fit: cover; border-radius: 0; box-shadow: 0 0 40px rgba(0,0,0,0.3);"
            />
            <div
              style="flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px; padding: 48px 60px 48px 0; box-sizing: border-box;"
            >
              <div
                style="font-size: 64px; font-weight: 600; line-height: 1.2; text-shadow: 2px 2px 8px rgba(0,0,0,0.7);"
              >
                ${title}
              </div>
              <div
                style="font-size: 36px; font-weight: 400; color: #cccccc; text-shadow: 1px 1px 4px rgba(0,0,0,0.7);"
              >
                ${author}
              </div>
              <div
                style="margin-top: auto; display: flex; align-items: center; gap: 20px;"
              >
                <img
                  src="https://www.bigsolo.org/img/icon.png"
                  style="width: 50px; height: 50px;"
                />
                <span
                  style="font-size: 40px; font-weight: 700; color: #ffffff; text-shadow: 1px 1px 4px rgba(0,0,0,0.7);"
                  >BigSolo.org</span
                >
              </div>
            </div>
          </div>
        </div>
      `;

      const svg = await satori(template, {
        width: 1200,
        height: 630,
        fonts: [
          { name: "Urbanist", data: fontRegular, weight: 400, style: "normal" },
          {
            name: "Urbanist",
            data: fontSemiBold,
            weight: 600,
            style: "normal",
          },
          { name: "Urbanist", data: fontBold, weight: 700, style: "normal" },
        ],
      });

      const { Resvg } = await import("@resvg/resvg-js");
      const resvg = new Resvg(svg);
      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      const outputFilename = filename.replace(".json", ".png");
      const outputPath = path.join(outputDir, outputFilename);
      await fs.writeFile(outputPath, pngBuffer);

      console.log(`✅ Image sauvegardée : ${outputPath}`);
    } catch (error) {
      console.error(`❌ Erreur lors de la génération pour ${filename}:`, error);
    }
  }

  console.log("🎉 Terminé ! Toutes les images ont été générées.");
}

generateImages();
