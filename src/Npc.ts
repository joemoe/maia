import Phaser from "phaser";
import { PIXEL_FONT_FAMILY } from "./constants";

export type NpcBehavior = "standing" | "walking";

const SPEECH_TEXTS = ["MÄBA", "EIAKOPFSTAD", "Brudi", "6x7=42"];

// Wie nah Maia herankommen muss, damit es als "Begegnung" zählt, und wie
// wahrscheinlich diese Begegnung eine Sprechblase auslöst ("hin und wieder",
// nicht bei jeder Begegnung).
const ENCOUNTER_RADIUS = 150;
const SPEECH_CHANCE = 0.4;
const SPEECH_DURATION_MS = 2500;

const BUBBLE_GAP_ABOVE_HEAD = 14;
const BUBBLE_PADDING_X = 14;
const BUBBLE_PADDING_Y = 10;
const BUBBLE_TAIL_WIDTH = 16;
const BUBBLE_TAIL_HEIGHT = 12;

/**
 * Ein Hintergrund-NPC, der entweder einfach steht oder gemächlich zwischen
 * zwei Punkten um seine Startposition hin- und herwandert. Begegnet Maia dem
 * NPC, zeigt er hin und wieder eine Sprechblase mit einem zufälligen Spruch.
 */
export class Npc {
  private sprite: Phaser.GameObjects.Sprite;
  private behavior: NpcBehavior;
  private speed: number;
  private minX: number;
  private maxX: number;
  private direction: 1 | -1;

  private bubbleContainer: Phaser.GameObjects.Container;
  private bubbleBg: Phaser.GameObjects.Rectangle;
  private bubbleTail: Phaser.GameObjects.Triangle;
  private bubbleText: Phaser.GameObjects.Text;
  private bubbleTimerMs = 0;
  private wasNearPlayer = false;

  constructor(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    behavior: NpcBehavior,
    patrolRange: number,
    speed: number,
  ) {
    this.sprite = sprite;
    this.behavior = behavior;
    this.speed = speed;
    this.minX = sprite.x - patrolRange;
    this.maxX = sprite.x + patrolRange;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    this.sprite.setFlipX(this.direction < 0);

    this.bubbleText = scene.add
      .text(0, 0, "", {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: "16px",
        color: "#000000",
      })
      .setOrigin(0.5, 0.5);
    this.bubbleBg = scene.add.rectangle(0, 0, 10, 10, 0xffffff).setStrokeStyle(3, 0x000000);
    this.bubbleTail = scene.add.triangle(
      0,
      0,
      -BUBBLE_TAIL_WIDTH / 2,
      0,
      BUBBLE_TAIL_WIDTH / 2,
      0,
      0,
      BUBBLE_TAIL_HEIGHT,
      0xffffff,
    );
    this.bubbleTail.setStrokeStyle(3, 0x000000);

    this.bubbleContainer = scene.add.container(sprite.x, 0, [this.bubbleBg, this.bubbleTail, this.bubbleText]);
    this.bubbleContainer.setDepth(1000);
    this.bubbleContainer.setVisible(false);
  }

  update(deltaSeconds: number, playerX: number): void {
    if (this.behavior === "walking") {
      this.sprite.x += this.direction * this.speed * deltaSeconds;

      if (this.sprite.x <= this.minX) {
        this.sprite.x = this.minX;
        this.direction = 1;
        this.sprite.setFlipX(false);
      } else if (this.sprite.x >= this.maxX) {
        this.sprite.x = this.maxX;
        this.direction = -1;
        this.sprite.setFlipX(true);
      }
    }

    this.updateSpeechBubble(deltaSeconds, playerX);
  }

  private updateSpeechBubble(deltaSeconds: number, playerX: number): void {
    const headTopY = this.sprite.y - this.sprite.displayHeight / 2;
    this.bubbleContainer.setPosition(this.sprite.x, headTopY - BUBBLE_GAP_ABOVE_HEAD);

    if (this.bubbleTimerMs > 0) {
      this.bubbleTimerMs -= deltaSeconds * 1000;
      if (this.bubbleTimerMs <= 0) {
        this.bubbleContainer.setVisible(false);
      }
    }

    const isNear = Math.abs(this.sprite.x - playerX) < ENCOUNTER_RADIUS;
    if (isNear && !this.wasNearPlayer && Math.random() < SPEECH_CHANCE) {
      this.showSpeechBubble();
    }
    this.wasNearPlayer = isNear;
  }

  private showSpeechBubble(): void {
    const text = SPEECH_TEXTS[Math.floor(Math.random() * SPEECH_TEXTS.length)];
    this.bubbleText.setText(text.toUpperCase());

    const width = this.bubbleText.width + BUBBLE_PADDING_X * 2;
    const height = this.bubbleText.height + BUBBLE_PADDING_Y * 2;
    // Tail-Spitze zeigt auf lokal (0,0); die Blase sitzt darüber, zentriert
    // auf ihre eigene Mitte.
    const bubbleCenterY = -height / 2 - BUBBLE_TAIL_HEIGHT;
    this.bubbleBg.setSize(width, height);
    this.bubbleBg.setPosition(0, bubbleCenterY);
    this.bubbleTail.setPosition(0, -BUBBLE_TAIL_HEIGHT);
    this.bubbleText.setPosition(0, bubbleCenterY);

    this.bubbleContainer.setVisible(true);
    this.bubbleTimerMs = SPEECH_DURATION_MS;
  }
}
