import Phaser from "phaser";
import { MAIA_SPEED, MAIA_DISPLAY_HEIGHT, DOG_DISPLAY_HEIGHT, DOG_LAG_FRAMES } from "../constants";
import { DogFollower } from "../DogFollower";
import { TouchControls } from "../TouchControls";
import type { MainScene } from "./MainScene";

// house-floor-1.png ist 1060x675px. Es wird nie kleiner als in Originalgröße
// dargestellt (Skalierung >= 1) und seitenverhältnistreu nach oben skaliert,
// falls der Viewport das Bild sonst nicht abdecken würde. Bei unserer festen
// 960x540-Canvas gewinnt der "immer mindestens 1"-Fall: das Bild bleibt in
// Originalgröße (1060px breit), was mehr Weltbreite als der Viewport ergibt -
// die Kamera scrollt also wie in der Außenwelt. Verankert wird unten links,
// damit der Boden immer sichtbar bleibt; überschüssige Höhe oben (Decke)
// wird vom Kamera-Ausschnitt einfach abgeschnitten.
const IMAGE_WIDTH = 1060;
const IMAGE_HEIGHT = 675;
// Der Boden beginnt bei y=501 (Wand- zu Fußboden-Farbwechsel), gemessen vom
// oberen Bildrand in Bildquell-Pixeln.
const FLOOR_SOURCE_Y = 501;
// Die reine Wand-/Boden-Grenze liegt weit hinten im Raum. Damit die
// Charaktere nicht wie an der Rückwand klebend wirken, laufen sie stattdessen
// zwei Drittel der restlichen Strecke bis zum unteren Bildrand weiter unten.
const FLOOR_Y_DOWNWARD_SHIFT_FRACTION = 2 / 3;

// Die Treppengrafik im Hintergrundbild, in Bildquell-Pixeln - wird zur
// Laufzeit mit dem Skalierungsfaktor multipliziert, damit die Auslösezone bei
// jeder Viewport-Größe zur tatsächlichen Grafik passt.
const STAIRS_UP_SOURCE_WIDTH = 120;

// Im Haus doppelt so groß wie draußen.
const HOUSE_MAIA_DISPLAY_HEIGHT = MAIA_DISPLAY_HEIGHT * 2;

// Diese Abstände beziehen sich auf Maias feste Anzeigegröße (nicht auf das
// Hintergrundbild) und bleiben daher in Anzeige-Pixeln. Maia ist bei
// HOUSE_MAIA_DISPLAY_HEIGHT=260 rund 174px breit (87px Halbbreite) - die
// Ränder müssen groß genug sein, damit sie nie sichtbar über den Bildschirm-
// rand hinausragt, bevor eine Auslösezone greift.
const MAIA_START_X_FROM_RIGHT = 200;
const MAIA_MIN_X = 100;
// Ab hier gilt: Maia hat den rechten Bildrand erreicht und verlässt das Haus.
const EXIT_MARGIN = 120;
// Kommt sie von oben zurück, taucht sie etwas rechts der Treppe wieder auf,
// damit sie nicht sofort wieder hochgeht.
const REENTRY_FROM_UPSTAIRS_OFFSET = 100;

// Der Hund bleibt normal groß, braucht aber wegen Maias größerer Silhouette
// mehr Abstand im Stand als draußen.
const DOG_STAND_OFFSET_X = 135;

export class HouseScene extends Phaser.Scene {
  private maia!: Phaser.Physics.Arcade.Sprite;
  private dog!: Phaser.GameObjects.Sprite;
  private dogFollower!: DogFollower;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private touchControls!: TouchControls;
  private floorY = 0;
  private worldWidth = 0;
  private stairsUpTriggerWidth = 0;
  private reentryFromUpstairsX = 0;

  constructor() {
    super("HouseScene");
  }

  preload(): void {
    this.load.image("house-floor", "img/house-floor-1.png");
  }

  create(): void {
    this.physics.world.gravity.y = 0;

    const scale = Math.max(this.scale.width / IMAGE_WIDTH, this.scale.height / IMAGE_HEIGHT, 1);
    this.worldWidth = IMAGE_WIDTH * scale;
    this.stairsUpTriggerWidth = STAIRS_UP_SOURCE_WIDTH * scale;
    this.reentryFromUpstairsX = this.stairsUpTriggerWidth + REENTRY_FROM_UPSTAIRS_OFFSET;

    // Unten anverankert: Abstand der Bodenlinie zum unteren Bildrand bleibt
    // beim Skalieren proportional erhalten.
    const distanceFromBottom = (IMAGE_HEIGHT - FLOOR_SOURCE_Y) * scale;
    const baseFloorY = this.scale.height - distanceFromBottom;
    this.floorY = baseFloorY + FLOOR_Y_DOWNWARD_SHIFT_FRACTION * (this.scale.height - baseFloorY);

    this.physics.world.setBounds(0, 0, this.worldWidth, this.scale.height);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.scale.height);

    this.add.image(0, this.scale.height, "house-floor").setOrigin(0, 1).setScale(scale);

    const startX = this.worldWidth - MAIA_START_X_FROM_RIGHT;

    const sprite = this.physics.add.sprite(startX, 0, "maia");
    sprite.setScale(HOUSE_MAIA_DISPLAY_HEIGHT / sprite.height);
    sprite.setY(this.floorY - sprite.displayHeight / 2);
    this.maia = sprite;

    const dogSprite = this.add.sprite(startX - DOG_STAND_OFFSET_X, 0, "amber");
    dogSprite.setScale(DOG_DISPLAY_HEIGHT / dogSprite.height);
    dogSprite.setY(this.floorY - dogSprite.displayHeight / 2);
    this.dog = dogSprite;
    this.dogFollower = new DogFollower(this.dog, this.maia, DOG_LAG_FRAMES, DOG_STAND_OFFSET_X);

    this.cameras.main.startFollow(this.maia, true, 0.1, 0);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.touchControls = new TouchControls(this, { showJump: false });
  }

  update(): void {
    const body = this.maia.body as Phaser.Physics.Arcade.Body;

    if (this.cursors.left?.isDown || this.touchControls.leftDown) {
      body.setVelocityX(-MAIA_SPEED);
      this.maia.setFlipX(true);
    } else if (this.cursors.right?.isDown || this.touchControls.rightDown) {
      body.setVelocityX(MAIA_SPEED);
      this.maia.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    if (this.maia.x < MAIA_MIN_X) {
      this.maia.setX(MAIA_MIN_X);
    }

    this.dogFollower.update();

    if (this.maia.x < this.stairsUpTriggerWidth) {
      this.goUpstairs();
    } else if (this.maia.x >= this.worldWidth - EXIT_MARGIN) {
      this.exitHouse();
    }
  }

  /** Wird von HouseLevel2Scene beim Herunterkommen aufgerufen. */
  public enterFromUpstairs(): void {
    this.maia.setX(this.reentryFromUpstairsX);
    (this.maia.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private goUpstairs(): void {
    this.scene.sleep();
    this.scene.launch("HouseLevel2Scene");
  }

  private exitHouse(): void {
    const mainScene = this.scene.get("MainScene") as MainScene;
    mainScene.exitFromHouse();
    this.scene.stop();
    this.scene.wake("MainScene");
  }
}
