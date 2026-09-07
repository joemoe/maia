import Phaser from "phaser";
import { CHARACTER_OPTIONS, setSelectedCharacterPath } from "../characterSelection";
import { PIXEL_FONT_FAMILY } from "../constants";

const CARD_DISPLAY_HEIGHT = 200;
const CARD_SPACING_X = 300;
const CARD_CENTER_Y = 260;
const HIGHLIGHT_COLOR = 0xffd23f;
const HIGHLIGHT_PADDING = 20;

export class CharacterSelectScene extends Phaser.Scene {
  constructor() {
    super("CharacterSelectScene");
  }

  preload(): void {
    for (const option of CHARACTER_OPTIONS) {
      this.load.image(option.id, option.path);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#7ec0ee");

    this.add
      .text(this.scale.width / 2, 80, "Wer soll spielen?".toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "36px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(this.scale.width / 2, 140, "Klick auf einen Charakter".toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const startX = this.scale.width / 2 - CARD_SPACING_X;

    CHARACTER_OPTIONS.forEach((option, index) => {
      this.createCard(option, startX + index * CARD_SPACING_X, CARD_CENTER_Y);
    });
  }

  private createCard(option: (typeof CHARACTER_OPTIONS)[number], x: number, y: number): void {
    const portrait = this.add.image(x, y, option.id);
    portrait.setScale(CARD_DISPLAY_HEIGHT / portrait.height);

    const highlight = this.add.rectangle(
      x,
      y,
      portrait.displayWidth + HIGHLIGHT_PADDING * 2,
      portrait.displayHeight + HIGHLIGHT_PADDING * 2,
      HIGHLIGHT_COLOR,
    );
    highlight.setStrokeStyle(4, 0xffffff);
    highlight.setVisible(false);
    highlight.setDepth(-1);

    this.add
      .text(x, y + portrait.displayHeight / 2 + 30, option.label.toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 5,
      })
      .setOrigin(0.5);

    portrait.setInteractive({ useHandCursor: true });
    portrait.on("pointerover", () => {
      highlight.setVisible(true);
      portrait.setScale((CARD_DISPLAY_HEIGHT / portrait.height) * 1.08);
    });
    portrait.on("pointerout", () => {
      highlight.setVisible(false);
      portrait.setScale(CARD_DISPLAY_HEIGHT / portrait.height);
    });
    portrait.on("pointerdown", () => {
      setSelectedCharacterPath(option.path);
      this.scene.start("MainScene");
    });
  }
}
