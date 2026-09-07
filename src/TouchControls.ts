import Phaser from "phaser";

const BUTTON_RADIUS = 46;
const BUTTON_MARGIN = 30;
const BUTTON_GAP = 110;
const BUTTON_FILL_ALPHA = 0.35;
const BUTTON_FILL_COLOR = 0xffffff;
const BUTTON_STROKE_COLOR = 0x000000;
const ICON_COLOR = 0x000000;
const DEPTH = 1500;

export interface TouchControlsOptions {
  /** Ob zusätzlich zu Links/Rechts auch ein Sprung-Button gezeigt wird (nicht in Innenräumen nötig). */
  showJump: boolean;
}

/**
 * Virtuelles D-Pad (links/rechts) unten links und optional ein Sprung-Button
 * unten rechts - der auf Touchgeräten übliche Standard für Jump&Run-Spiele
 * mit echter Links/Rechts-Bewegung (kein Auto-Runner). Erscheint nur auf
 * Geräten, die Touch tatsächlich unterstützen.
 */
export class TouchControls {
  leftDown = false;
  rightDown = false;

  private jumpJustPressed = false;
  private enabled: boolean;

  constructor(scene: Phaser.Scene, options: TouchControlsOptions) {
    this.enabled = scene.sys.game.device.input.touch;
    if (!this.enabled) {
      return;
    }

    const width = scene.scale.width;
    const height = scene.scale.height;

    const leftX = BUTTON_MARGIN + BUTTON_RADIUS;
    const rightX = leftX + BUTTON_GAP;
    const buttonY = height - BUTTON_MARGIN - BUTTON_RADIUS;

    this.createDirectionButton(scene, leftX, buttonY, "left");
    this.createDirectionButton(scene, rightX, buttonY, "right");

    if (options.showJump) {
      const jumpX = width - BUTTON_MARGIN - BUTTON_RADIUS;
      this.createJumpButton(scene, jumpX, buttonY);
    }
  }

  /** Wie Phaser.Input.Keyboard.JustDown - liefert einmalig true und setzt sich dann zurück. */
  consumeJumpPress(): boolean {
    const pressed = this.jumpJustPressed;
    this.jumpJustPressed = false;
    return pressed;
  }

  private createDirectionButton(scene: Phaser.Scene, x: number, y: number, direction: "left" | "right"): void {
    const zone = this.createButtonBase(scene, x, y);

    const arrowSign = direction === "left" ? -1 : 1;
    const arrow = scene.add.triangle(
      x,
      y,
      -12 * arrowSign,
      0,
      12 * arrowSign,
      -16,
      12 * arrowSign,
      16,
      ICON_COLOR,
    );
    arrow.setScrollFactor(0);
    arrow.setDepth(DEPTH);

    zone.on("pointerdown", () => {
      if (direction === "left") this.leftDown = true;
      else this.rightDown = true;
    });
    const release = () => {
      if (direction === "left") this.leftDown = false;
      else this.rightDown = false;
    };
    zone.on("pointerup", release);
    zone.on("pointerout", release);
  }

  private createJumpButton(scene: Phaser.Scene, x: number, y: number): void {
    const zone = this.createButtonBase(scene, x, y);

    const arrow = scene.add.triangle(x, y, -16, 12, 16, 12, 0, -12, ICON_COLOR);
    arrow.setScrollFactor(0);
    arrow.setDepth(DEPTH);

    zone.on("pointerdown", () => {
      this.jumpJustPressed = true;
    });
  }

  private createButtonBase(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Arc {
    const circle = scene.add.circle(x, y, BUTTON_RADIUS, BUTTON_FILL_COLOR, BUTTON_FILL_ALPHA);
    circle.setStrokeStyle(3, BUTTON_STROKE_COLOR, 0.6);
    circle.setScrollFactor(0);
    circle.setDepth(DEPTH);
    circle.setInteractive({ useHandCursor: true });
    return circle;
  }
}
