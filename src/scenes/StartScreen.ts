import Phaser from "phaser";
import { PIXEL_FONT_FAMILY } from "../constants";

const GAME_TITLE = "Maia und die große Welt";
const BUTTON_LABEL = "MÄÄÄÄBAAAAAA!";

const SKY_COLOR = 0x7ec0ee;

/**
 * Bestmöglicher Versuch, Querformat zu erzwingen (Android Chrome im
 * Vollbildmodus). iOS Safari unterstützt diese API grundsätzlich nicht - dort
 * greift stattdessen der CSS-Dreh-Trick in style.css. Deshalb hier bewusst
 * ohne Fehlerbehandlung, die den Nutzer stört: schlägt einfach lautlos fehl.
 */
function requestLandscapeOrientation(): void {
  const root = document.documentElement;
  root.requestFullscreen?.()?.catch(() => undefined);

  const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
  orientation.lock?.("landscape")?.catch(() => undefined);
}

// Spielbare Charaktere unter eigenen Keys geladen (nicht "maia" - das ist der
// dynamische Key für den in CharacterSelectScene gewählten Charakter).
const BACKGROUND_CHARACTERS = [
  { key: "start-maia", path: "img/maia.png" },
  { key: "start-benni", path: "img/benni.png" },
  { key: "start-maia-google", path: "img/maia-google.png" },
  { key: "pferd", path: "img/pferd.png" },
  { key: "maia-mit-haar", path: "img/maia-mit-haar.png" },
  { key: "eiakopf-1", path: "img/eiakopf-1.png" },
  { key: "eiakopf-2", path: "img/eiakopf-2.png" },
  { key: "eiakopf-3", path: "img/eiakopf-3.png" },
  { key: "monsta", path: "img/monsta.png" },
  { key: "bm-besserwisser", path: "img/bm-besserwisser.png" },
  { key: "nachtninja", path: "img/nachtninja.png" },
];

type LaneKind = "title" | "button" | "characters";

// Der Bildschirm wird von oben nach unten in Linien unterschiedlicher Höhe
// aufgeteilt. Titel und Button bekommen feste, an ihren Inhalt angepasste
// Höhen; der Rest verteilt sich gleichmäßig auf die restlichen Linien.
const LANE_LAYOUT: LaneKind[] = ["title", "characters", "characters", "button", "characters", "characters"];
// Höher als bei einer normalen Schrift bemessen, weil der Titel im
// Pixel-Font zweizeilig umbricht.
const TITLE_LANE_HEIGHT = 150;
const BUTTON_LANE_HEIGHT = 130;

// Zufälliges Gewicht pro Charakter-Linie, damit die Linien unterschiedlich
// hoch werden (nicht alle gleich groß).
const LANE_WEIGHT_MIN = 0.6;
const LANE_WEIGHT_MAX = 1.8;

// Anteil der Linienhöhe, den die Charaktere einnehmen (Rest ist Luft nach oben/unten).
const CHARACTER_HEIGHT_RATIO = 0.75;
const CHARACTER_SPEED_MIN = 40;
const CHARACTER_SPEED_MAX = 95;

// Je niedriger die Linie (=kleinere Figuren), desto mehr Figuren passen
// hinein - umgekehrt proportional zur Linienhöhe.
const CHARACTER_COUNT_SCALE = 650;
const CHARACTER_COUNT_MIN = 2;
const CHARACTER_COUNT_MAX = 9;

// Durchschnittlicher Abstand ist Bildschirmbreite/Anzahl; der tatsächliche
// Abstand zwischen zwei Figuren schwankt zufällig um diesen Wert.
const SPACING_FACTOR_MIN = 0.6;
const SPACING_FACTOR_MAX = 1.6;

interface Lane {
  kind: LaneKind;
  top: number;
  height: number;
}

interface CharacterWalker {
  sprite: Phaser.GameObjects.Sprite;
  speed: number;
  direction: 1 | -1;
  halfWidth: number;
}

export class StartScreen extends Phaser.Scene {
  private walkers: CharacterWalker[] = [];
  // Einmal pro Startscreen gemischt, damit keine Figur in zwei Linien auftaucht.
  private availableCharacters: (typeof BACKGROUND_CHARACTERS)[number][] = [];

  constructor() {
    super("StartScreen");
  }

  preload(): void {
    for (const character of BACKGROUND_CHARACTERS) {
      if (!this.textures.exists(character.key)) {
        this.load.image(character.key, character.path);
      }
    }
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.add.rectangle(0, 0, width, height, SKY_COLOR).setOrigin(0, 0);

    this.availableCharacters = Phaser.Utils.Array.Shuffle([...BACKGROUND_CHARACTERS]);

    const lanes = this.computeLanes(height);

    for (const lane of lanes) {
      const centerY = lane.top + lane.height / 2;

      if (lane.kind === "title") {
        this.createTitle(width / 2, centerY, lane.height);
      } else if (lane.kind === "button") {
        this.createStartButton(width / 2, centerY);
      } else {
        this.createCharacterLane(lane);
      }
    }
  }

  /**
   * Titel/Button bekommen feste Höhen (nach Lesbarkeit/Bedienbarkeit
   * bemessen). Der Rest teilt sich auf die übrigen Linien auf - mit
   * zufälligem Gewicht pro Linie, damit sie unterschiedlich hoch werden.
   */
  private computeLanes(totalHeight: number): Lane[] {
    const fixedHeight = LANE_LAYOUT.filter((kind) => kind !== "characters").reduce(
      (sum, kind) => sum + (kind === "title" ? TITLE_LANE_HEIGHT : BUTTON_LANE_HEIGHT),
      0,
    );
    const remainingHeight = totalHeight - fixedHeight;

    const weights = LANE_LAYOUT.map((kind) =>
      kind === "characters" ? Phaser.Math.FloatBetween(LANE_WEIGHT_MIN, LANE_WEIGHT_MAX) : 0,
    );
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    const lanes: Lane[] = [];
    let top = 0;
    LANE_LAYOUT.forEach((kind, i) => {
      const height =
        kind === "title" ? TITLE_LANE_HEIGHT : kind === "button" ? BUTTON_LANE_HEIGHT : (weights[i] / totalWeight) * remainingHeight;
      lanes.push({ kind, top, height });
      top += height;
    });
    return lanes;
  }

  private createTitle(x: number, y: number, laneHeight: number): void {
    this.add
      .text(x, y, GAME_TITLE.toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: `${Math.round(laneHeight * 0.34)}px`,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 8,
        align: "center",
        wordWrap: { width: this.scale.width - 80 },
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  private createStartButton(x: number, y: number): void {
    const label = this.add
      .text(0, 0, BUTTON_LABEL.toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "22px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const paddingX = 36;
    const paddingY = 20;
    const button = this.add.rectangle(0, 0, label.width + paddingX * 2, label.height + paddingY * 2, 0xc40000);
    button.setStrokeStyle(5, 0xffffff);

    const container = this.add.container(x, y, [button, label]);
    container.setSize(button.width, button.height);
    container.setDepth(10);
    container.setInteractive({ useHandCursor: true });

    container.on("pointerover", () => {
      button.setScale(1.06);
      label.setScale(1.06);
    });
    container.on("pointerout", () => {
      button.setScale(1);
      label.setScale(1);
    });
    container.on("pointerdown", () => {
      requestLandscapeOrientation();
      this.scene.start("CharacterSelectScene");
    });
  }

  /**
   * Pro Linie: eine Figur, eine Richtung, ein Tempo - aber zufällig viele
   * Figuren mit zufälligem Abstand zueinander. Niedrigere Linien (kleinere
   * Figuren) bekommen mehr Figuren, hohe Linien weniger.
   */
  private createCharacterLane(lane: Lane): void {
    const direction: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const speed = Phaser.Math.Between(CHARACTER_SPEED_MIN, CHARACTER_SPEED_MAX);
    const character = this.availableCharacters.pop();
    if (!character) {
      return;
    }

    const displayHeight = lane.height * CHARACTER_HEIGHT_RATIO;
    const standY = lane.top + lane.height - (lane.height - displayHeight) / 2;

    const count = Phaser.Math.Clamp(
      Math.round(CHARACTER_COUNT_SCALE / lane.height),
      CHARACTER_COUNT_MIN,
      CHARACTER_COUNT_MAX,
    );
    const averageSpacing = this.scale.width / count;

    let x = Phaser.Math.Between(0, this.scale.width);
    for (let i = 0; i < count; i++) {
      const sprite = this.add.sprite(x, 0, character.key);
      sprite.setScale(displayHeight / sprite.height);
      sprite.setY(standY - sprite.displayHeight / 2);
      sprite.setDepth(1);
      sprite.setFlipX(direction < 0);

      this.walkers.push({
        sprite,
        speed,
        direction,
        halfWidth: sprite.displayWidth / 2,
      });

      const spacing = averageSpacing * Phaser.Math.FloatBetween(SPACING_FACTOR_MIN, SPACING_FACTOR_MAX);
      x = (x + spacing) % this.scale.width;
    }
  }

  update(_time: number, delta: number): void {
    const deltaSeconds = delta / 1000;
    const width = this.scale.width;

    for (const walker of this.walkers) {
      walker.sprite.x += walker.direction * walker.speed * deltaSeconds;

      if (walker.direction === 1 && walker.sprite.x - walker.halfWidth > width) {
        walker.sprite.x = -walker.halfWidth;
      } else if (walker.direction === -1 && walker.sprite.x + walker.halfWidth < 0) {
        walker.sprite.x = width + walker.halfWidth;
      }
    }
  }
}
