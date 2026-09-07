import Phaser from "phaser";
import { PIXEL_FONT_FAMILY } from "./constants";

const CHARACTER_DISPLAY_HEIGHT = 460;
// Leichte Schräglage für den "Mugshot"-Look.
const CHARACTER_ANGLE_DEGREES = 10;
// Bei den Charakter-Grafiken sitzt das Gesicht ungefähr in den oberen ~28%
// der Bildhöhe (Haarspitzen/Kopf ragen darüber hinaus). Der Origin-Punkt legt
// genau diese Stelle als Bezugspunkt fest, damit unabhängig von der
// Anzeigegröße immer das Gesicht (nicht der ganze Körper) hinter den Gittern
// landet.
const CHARACTER_FACE_ORIGIN_Y = 0.28;
const CHARACTER_FACE_SCREEN_Y_FRACTION = 0.56;
const BAR_COUNT = 7;
const BAR_WIDTH = 26;

/**
 * Vollbild-Overlay im GTA-Stil: Maia hinter Gittern auf weißem Hintergrund,
 * "WASTED" in roter Schrift. Bleibt an der Kamera fixiert (scrollFactor 0).
 */
export class WastedScreen {
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, characterTextureKey: string) {
    const width = scene.scale.width;
    const height = scene.scale.height;

    const background = scene.add.rectangle(0, 0, width, height, 0xffffff).setOrigin(0, 0);

    const character = scene.add.image(width / 2, height * CHARACTER_FACE_SCREEN_Y_FRACTION, characterTextureKey);
    character.setOrigin(0.5, CHARACTER_FACE_ORIGIN_Y);
    character.setScale(CHARACTER_DISPLAY_HEIGHT / character.height);
    character.setAngle(CHARACTER_ANGLE_DEGREES);

    const bars: Phaser.GameObjects.Rectangle[] = [];
    const spacing = width / BAR_COUNT;
    for (let i = 0; i < BAR_COUNT; i++) {
      bars.push(scene.add.rectangle(spacing * i + spacing / 2, height / 2, BAR_WIDTH, height, 0x000000));
    }

    const text = scene.add
      .text(width / 2, height * 0.22, "WASTED".toUpperCase(), {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "72px",
        color: "#c40000",
      })
      .setOrigin(0.5);

    this.container = scene.add.container(0, 0, [background, character, ...bars, text]);
    this.container.setScrollFactor(0);
    this.container.setDepth(2000);
    this.container.setVisible(false);
  }

  show(): void {
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}
