import Phaser from "phaser";
import "./style.css";
import { StartScreen } from "./scenes/StartScreen";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { MainScene } from "./scenes/MainScene";
import { HouseScene } from "./scenes/HouseScene";
import { HouseLevel2Scene } from "./scenes/HouseLevel2Scene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: "#7ec0ee",
  // Ohne responsiven Scale-Modus bleibt die Canvas eine feste 960x540px-Box,
  // die ein schmaleres Browserfenster per CSS-Overflow einfach zuschneidet
  // (der interne Scroll funktioniert dann zwar korrekt, ist aber teilweise
  // unsichtbar). FIT skaliert die komplette, unveränderte 960x540-Welt immer
  // vollständig sichtbar in den verfügbaren Platz, ohne etwas abzuschneiden.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: "app",
    width: 960,
    height: 540,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false,
    },
  },
  scene: [StartScreen, CharacterSelectScene, MainScene, HouseScene, HouseLevel2Scene],
};

// Bei Hochformat dreht style.css die ganze Seite per CSS-Transform um 90°
// (siehe dort - iOS Safari unterstützt keine JS-Bildschirmsperre). Ein
// CSS-transform ändert aber nur die sichtbare Bounding-Box, nicht die
// Layout-Maße - Phasers Scale.FIT misst den Elternknoten über
// getBoundingClientRect() und bekäme dadurch weiterhin die vertauschten
// Hochformat-Maße, obwohl #app selbst korrekt auf Querformat gestellt ist.
// Deshalb hier die Canvas-Größe manuell mit den transformationsunabhängigen
// clientWidth/clientHeight erzwingen, sooft sich das ändern könnte.
// Muss exakt zur Media Query in style.css passen.
const FORCED_LANDSCAPE_QUERY = "(orientation: portrait) and (max-width: 1024px) and (pointer: coarse)";

function syncScaleForForcedLandscape(game: Phaser.Game): void {
  if (!window.matchMedia(FORCED_LANDSCAPE_QUERY).matches) {
    return;
  }
  const app = document.getElementById("app");
  if (app) {
    game.scale.setParentSize(app.clientWidth, app.clientHeight);
  }
}

// Erst die Pixelfont laden, damit Phaser sie schon beim allerersten Frame
// verwendet (sonst evtl. kurzes Aufblitzen mit der Standardschrift).
document.fonts
  .load('16px "Press Start 2P"')
  .catch(() => undefined)
  .finally(() => {
    const game = new Phaser.Game(config);

    // Direkt nach dem Konstruktor hat Phaser seine eigene (noch falsche)
    // Boot-Messung oft noch nicht abgeschlossen - erst nach READY überschreiben.
    game.events.once(Phaser.Core.Events.READY, () => syncScaleForForcedLandscape(game));
    window.addEventListener("resize", () => syncScaleForForcedLandscape(game));
    // orientationchange feuert oft, bevor der Browser innerWidth/innerHeight
    // aktualisiert hat - kurz verzögert nochmal synchronisieren.
    window.addEventListener("orientationchange", () => {
      setTimeout(() => syncScaleForForcedLandscape(game), 150);
    });
  });
