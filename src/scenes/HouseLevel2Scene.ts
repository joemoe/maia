import Phaser from "phaser";
import { MAIA_SPEED, MAIA_DISPLAY_HEIGHT, DOG_DISPLAY_HEIGHT, DOG_LAG_FRAMES } from "../constants";
import { DogFollower } from "../DogFollower";
import { TouchControls } from "../TouchControls";
import type { HouseScene } from "./HouseScene";

// house-floor-2.png hat dieselben Maße und dieselbe Bodenlinie wie
// house-floor-1.png (y=501 von 675px). Wie dort: nie kleiner als
// Originalgröße, unten verankert, Kamera scrollt über die resultierende
// Weltbreite - siehe Kommentar in HouseScene.ts für Details.
const IMAGE_WIDTH = 1060;
const IMAGE_HEIGHT = 675;
const FLOOR_SOURCE_Y = 501;
// Wie in HouseScene: zwei Drittel der restlichen Strecke bis zum unteren
// Bildrand weiter unten laufen statt direkt an der Wand-/Boden-Grenze.
const FLOOR_Y_DOWNWARD_SHIFT_FRACTION = 2 / 3;

// Die Treppengrafik im Hintergrundbild, in Bildquell-Pixeln - wird zur
// Laufzeit mit dem Skalierungsfaktor multipliziert.
const STAIRS_DOWN_SOURCE_WIDTH = 150;

// Im Haus doppelt so groß wie draußen.
const HOUSE_MAIA_DISPLAY_HEIGHT = MAIA_DISPLAY_HEIGHT * 2;

// Diese Abstände beziehen sich auf Maias feste Anzeigegröße, nicht auf das
// Hintergrundbild, und bleiben daher in Anzeige-Pixeln.
const MAIA_START_X_FROM_RIGHT_OFFSET = 100;
const MAIA_MIN_X = 100;

// Der Hund bleibt normal groß, braucht aber wegen Maias größerer Silhouette
// mehr Abstand im Stand als draußen.
const DOG_STAND_OFFSET_X = 135;

export class HouseLevel2Scene extends Phaser.Scene {
  private maia!: Phaser.Physics.Arcade.Sprite;
  private dog!: Phaser.GameObjects.Sprite;
  private dogFollower!: DogFollower;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private touchControls!: TouchControls;
  private floorY = 0;
  private worldWidth = 0;
  private stairsDownTriggerWidth = 0;

  constructor() {
    super("HouseLevel2Scene");
  }

  preload(): void {
    this.load.image("house-floor-2", "img/house-floor-2.png");
  }

  create(): void {
    this.physics.world.gravity.y = 0;

    const scale = Math.max(this.scale.width / IMAGE_WIDTH, this.scale.height / IMAGE_HEIGHT, 1);
    this.worldWidth = IMAGE_WIDTH * scale;
    this.stairsDownTriggerWidth = STAIRS_DOWN_SOURCE_WIDTH * scale;

    // Unten anverankert: Abstand der Bodenlinie zum unteren Bildrand bleibt
    // beim Skalieren proportional erhalten.
    const distanceFromBottom = (IMAGE_HEIGHT - FLOOR_SOURCE_Y) * scale;
    const baseFloorY = this.scale.height - distanceFromBottom;
    this.floorY = baseFloorY + FLOOR_Y_DOWNWARD_SHIFT_FRACTION * (this.scale.height - baseFloorY);

    this.physics.world.setBounds(0, 0, this.worldWidth, this.scale.height);
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.scale.height);

    this.add.image(0, this.scale.height, "house-floor-2").setOrigin(0, 1).setScale(scale);

    const startX = this.worldWidth - this.stairsDownTriggerWidth - MAIA_START_X_FROM_RIGHT_OFFSET;

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

    if (this.maia.x >= this.worldWidth - this.stairsDownTriggerWidth) {
      this.goDownstairs();
    }
  }

  private goDownstairs(): void {
    const houseScene = this.scene.get("HouseScene") as HouseScene;
    houseScene.enterFromUpstairs();
    this.scene.stop();
    this.scene.wake("HouseScene");
  }
}
