import Phaser from "phaser";
import { MAIA_SPEED, MAIA_DISPLAY_HEIGHT, DOG_DISPLAY_HEIGHT, DOG_LAG_FRAMES } from "../constants";
import { DogFollower } from "../DogFollower";
import { Npc, type NpcBehavior } from "../Npc";
import { Villain, type VillainConfig } from "../Villain";
import { WastedScreen } from "../WastedScreen";
import { TouchControls } from "../TouchControls";
import { getSelectedCharacterPath } from "../characterSelection";

// MVP: eine sehr breite, aber endliche Welt simuliert "endlos" genug für den
// aktuellen Spielumfang. Für echtes endloses Scrolling später durch
// prozedural nachgeladene Boden-Chunks ersetzen.
const WORLD_WIDTH = 100_000;
const GAME_HEIGHT = 540;
const GROUND_HEIGHT = 60;
const GROUND_Y = GAME_HEIGHT - GROUND_HEIGHT;

// Die oberen 20px von weed.png sind transparentes Gras (Grasbüschel), das
// über die eigentliche Standfläche hinausragt. Die Charaktere stehen auf der
// Linie, an der das Gras im Boden verwurzelt ist.
const GRASS_HEIGHT = 20;
const STAND_LINE_Y = GROUND_Y + GRASS_HEIGHT;
const GROUND_FILL_COLOR = 0x3abe2e;

// Hoch genug, dass die Sprung-Scheitelhöhe (v²/2g ≈ 235px) über den
// größten Bösewicht (monsta, 175px) hinausragt - richtig getimed kommt Maia
// so über sie drüber, statt gefangen zu werden.
const MAIA_JUMP_VELOCITY = -650;

// Horizontaler Abstand, den der Hund im Stand zu Maia hält, damit sich beide
// Sprites nicht überlappen.
const DOG_STAND_OFFSET_X = 85;

const SUN_DISPLAY_HEIGHT = 110;
const SUN_START_X = 700;
const SUN_Y = 100;
// Wie weit und wie lange die Sonne gemächlich hin- und herwandert.
const SUN_DRIFT_DISTANCE = 100;
const SUN_DRIFT_DURATION = 14_000;

// Kleinere Sonderfaktor als 1 lässt die Berge langsamer scrollen als der
// Vordergrund - dadurch wirken sie weiter entfernt (Parallax-Tiefeneffekt).
const MOUNTAIN_SCROLL_FACTOR = 0.4;
const MOUNTAIN_SPACING = 320;
const MOUNTAIN_SPACING_JITTER = 90;
const MOUNTAIN_MIN_DISPLAY_HEIGHT = 140;
const MOUNTAIN_MAX_DISPLAY_HEIGHT = 260;
// mountain.png hat auch am unteren Rand ein paar antialiaste, leicht
// transparente Pixel - ohne diesen Versatz schimmert dort wieder der Himmel durch.
const MOUNTAIN_BASE_OFFSET = 5;

// Wolken liegen näher am Himmel als die Berge, scrollen also noch langsamer -
// zusätzliche Tiefenebene zwischen Himmel (0) und Bergen (0.4).
const CLOUD_SCROLL_FACTOR = 0.15;
const CLOUD_SPACING = 500;
const CLOUD_SPACING_JITTER = 150;
const CLOUD_MIN_DISPLAY_HEIGHT = 60;
const CLOUD_MAX_DISPLAY_HEIGHT = 120;
const CLOUD_MIN_Y = 40;
const CLOUD_MAX_Y = 150;

const HOUSE_DISPLAY_HEIGHT = 220;
// Nah genug am Start, dass man es innerhalb weniger Sekunden erreicht
// (bei MAIA_SPEED=220px/s sind das ca. 3-8 Sekunden Laufzeit).
const HOUSE_MIN_X = 600;
const HOUSE_MAX_X = 1800;
// Wie nah Maia an der Haustür stehen muss und wie lange, damit sie automatisch
// hineingeht.
const HOUSE_DOOR_TRIGGER_RADIUS = 40;
const HOUSE_ENTER_STAND_DURATION_MS = 1000;
// Beim Verlassen tritt Maia etwas nach rechts vor die Tür, damit sie nicht
// sofort wieder im Auslöseradius steht und erneut hineingeht.
const HOUSE_EXIT_OFFSET_X = 60;

interface NpcDefinition {
  textureKey: string;
  count: number;
  displayHeight: number;
}

// "pferd" und die drei "eiakopf"-Varianten kommen mehrfach vor.
const NPC_DEFINITIONS: NpcDefinition[] = [
  { textureKey: "pferd", count: 5, displayHeight: 150 },
  { textureKey: "eiakopf-1", count: 4, displayHeight: 115 },
  { textureKey: "eiakopf-2", count: 4, displayHeight: 115 },
  { textureKey: "eiakopf-3", count: 3, displayHeight: 115 },
];
// "Maia mit Haar" soll nur genau einmal vorkommen.
const NPC_SINGLE_TEXTURE_KEY = "maia-mit-haar";
const NPC_SINGLE_DISPLAY_HEIGHT = 130;

// NPCs verteilen sich in der gleichen erreichbaren Größenordnung wie das Haus.
const NPC_ROAM_MIN_X = 300;
const NPC_ROAM_MAX_X = 20_000;
// Anteil der NPCs, die umherlaufen statt nur zu stehen.
const NPC_WALK_PROBABILITY = 0.5;
const NPC_PATROL_RANGE_MIN = 80;
const NPC_PATROL_RANGE_MAX = 200;
// Deutlich gemächlicher als Maia (220px/s) - wirkt wie beiläufiges Herumstehen/-schlendern.
const NPC_SPEED_MIN = 40;
const NPC_SPEED_MAX = 90;

interface VillainDefinition {
  textureKey: string;
  count: number;
  displayHeight: number;
  config: VillainConfig;
}

// Alle Bösewicht-Typen sind langsamer als Maia (220px/s) - wer aufmerksam
// bleibt, kann ihnen entkommen. Nachtninja schießt zusätzlich mit "bullet.png".
const VILLAIN_DEFINITIONS: VillainDefinition[] = [
  {
    textureKey: "monsta",
    count: 5,
    displayHeight: 175,
    config: { detectionRadius: 350, catchRadius: 55, chaseSpeed: 140, canShoot: false, shootCooldownMs: 0 },
  },
  {
    textureKey: "bm-besserwisser",
    count: 5,
    displayHeight: 140,
    config: { detectionRadius: 350, catchRadius: 50, chaseSpeed: 175, canShoot: false, shootCooldownMs: 0 },
  },
  {
    textureKey: "nachtninja",
    count: 5,
    displayHeight: 125,
    config: { detectionRadius: 420, catchRadius: 50, chaseSpeed: 160, canShoot: true, shootCooldownMs: 2200 },
  },
];
const VILLAIN_ROAM_MIN_X = 500;
const VILLAIN_ROAM_MAX_X = 20_000;

const BULLET_DISPLAY_HEIGHT = 20;
const BULLET_SPEED = 320;
const BULLET_MAX_RANGE = 900;
const BULLET_HIT_RADIUS = 35;

const WASTED_DURATION_MS = 5000;
// Wo Maia nach "Wasted" wieder auftaucht - ihre ursprüngliche Startposition.
const MAIA_RESPAWN_X = 200;

interface ActiveBullet {
  sprite: Phaser.GameObjects.Image;
  direction: 1 | -1;
  traveledDistance: number;
}

export class MainScene extends Phaser.Scene {
  private maia!: Phaser.Physics.Arcade.Sprite;
  private dog!: Phaser.GameObjects.Sprite;
  private dogFollower!: DogFollower;
  private groundFill!: Phaser.GameObjects.Rectangle;
  private grassStrip!: Phaser.GameObjects.TileSprite;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private touchControls!: TouchControls;

  private houseX = 0;
  private doorStandTimerMs = 0;
  private npcs: Npc[] = [];
  private villains: Villain[] = [];
  private bullets: ActiveBullet[] = [];
  private wastedScreen!: WastedScreen;
  private isWasted = false;
  private wastedTimerMs = 0;

  constructor() {
    super("MainScene");
  }

  preload(): void {
    // Falls schon eine andere Auswahl geladen war (z.B. nach Neustart mit
    // gewechseltem Charakter), alten Textur-Cache-Eintrag verwerfen, damit
    // wirklich das neu gewählte Bild geladen wird.
    if (this.textures.exists("maia")) {
      this.textures.remove("maia");
    }
    this.load.image("maia", getSelectedCharacterPath());
    this.load.image("amber", "img/amber.png");
    this.load.image("weed", "img/weed.png");
    this.load.image("sky", "img/sky.png");
    this.load.image("sun", "img/sun.png");
    this.load.image("mountain", "img/mountain.png");
    this.load.image("cloud", "img/cloud.png");
    this.load.image("house", "img/house.png");
    this.load.image("pferd", "img/pferd.png");
    this.load.image("maia-mit-haar", "img/maia-mit-haar.png");
    this.load.image("eiakopf-1", "img/eiakopf-1.png");
    this.load.image("eiakopf-2", "img/eiakopf-2.png");
    this.load.image("eiakopf-3", "img/eiakopf-3.png");
    this.load.image("monsta", "img/monsta.png");
    this.load.image("bm-besserwisser", "img/bm-besserwisser.png");
    this.load.image("nachtninja", "img/nachtninja.png");
    this.load.image("bullet", "img/bullet.png");
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);

    this.createBackground();
    this.createClouds();
    this.createMountains();
    this.createGround();
    this.createHouse();
    this.createNpcs();
    this.createVillains();
    this.createDog();
    this.createMaia();
    this.dogFollower = new DogFollower(this.dog, this.maia, DOG_LAG_FRAMES, DOG_STAND_OFFSET_X);

    this.physics.add.collider(this.maia, this.groundFill);

    // Kamera folgt Maia horizontal, bleibt vertikal stabil (Sprünge sollen
    // nicht den ganzen Bildschirm wackeln lassen).
    this.cameras.main.startFollow(this.maia, true, 0.1, 0);

    this.wastedScreen = new WastedScreen(this, "maia");

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.touchControls = new TouchControls(this, { showJump: true });
  }

  private createBackground(): void {
    // Fix an der Kamera (scrollFactor 0), damit der Himmel nicht mit der
    // 100.000px breiten Welt mitscrollen muss.
    this.add
      .image(0, 0, "sky")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDisplaySize(this.scale.width, this.scale.height);

    const sun = this.add.image(SUN_START_X, SUN_Y, "sun").setScrollFactor(0);
    sun.setScale(SUN_DISPLAY_HEIGHT / sun.height);

    this.tweens.add({
      targets: sun,
      x: SUN_START_X - SUN_DRIFT_DISTANCE,
      duration: SUN_DRIFT_DURATION,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private createClouds(): void {
    const count = Math.ceil(WORLD_WIDTH / CLOUD_SPACING);

    for (let i = 0; i < count; i++) {
      const x = i * CLOUD_SPACING + Phaser.Math.Between(-CLOUD_SPACING_JITTER, CLOUD_SPACING_JITTER);
      const y = Phaser.Math.Between(CLOUD_MIN_Y, CLOUD_MAX_Y);
      const displayHeight = Phaser.Math.Between(CLOUD_MIN_DISPLAY_HEIGHT, CLOUD_MAX_DISPLAY_HEIGHT);

      const cloud = this.add.image(x, y, "cloud");
      cloud.setScale(displayHeight / cloud.height);
      cloud.setScrollFactor(CLOUD_SCROLL_FACTOR);
    }
  }

  private createMountains(): void {
    // Größere "Berge" entstehen einfach dadurch, dass mehrere Dreiecke aus
    // mountain.png in unterschiedlicher Größe überlappend aneinandergereiht
    // werden. Die Basis sitzt auf STAND_LINE_Y (nicht GROUND_Y!), damit sie
    // hinter dem transparenten Gras-Saum aus weed.png liegt - sonst schimmert
    // durch die Lücken zwischen den Grasbüscheln der Himmel und die Berge
    // wirken schwebend. Der massive grüne Boden überdeckt sie ab dort ohnehin.
    const count = Math.ceil(WORLD_WIDTH / MOUNTAIN_SPACING);

    for (let i = 0; i < count; i++) {
      const x = i * MOUNTAIN_SPACING + Phaser.Math.Between(-MOUNTAIN_SPACING_JITTER, MOUNTAIN_SPACING_JITTER);
      const displayHeight = Phaser.Math.Between(MOUNTAIN_MIN_DISPLAY_HEIGHT, MOUNTAIN_MAX_DISPLAY_HEIGHT);

      const mountain = this.add.image(x, STAND_LINE_Y + MOUNTAIN_BASE_OFFSET, "mountain");
      mountain.setOrigin(0.5, 1);
      mountain.setScale(displayHeight / mountain.height);
      mountain.setScrollFactor(MOUNTAIN_SCROLL_FACTOR);
    }
  }

  private createGround(): void {
    const fillHeight = GROUND_HEIGHT - GRASS_HEIGHT;
    this.groundFill = this.add.rectangle(
      WORLD_WIDTH / 2,
      STAND_LINE_Y + fillHeight / 2,
      WORLD_WIDTH,
      fillHeight,
      GROUND_FILL_COLOR,
    );
    this.physics.add.existing(this.groundFill, true);

    this.grassStrip = this.add.tileSprite(0, GROUND_Y, WORLD_WIDTH, GRASS_HEIGHT, "weed");
    this.grassStrip.setOrigin(0, 0);
  }

  private createHouse(): void {
    this.houseX = Phaser.Math.Between(HOUSE_MIN_X, HOUSE_MAX_X);

    const house = this.add.image(this.houseX, STAND_LINE_Y, "house");
    house.setOrigin(0.5, 1);
    house.setScale(HOUSE_DISPLAY_HEIGHT / house.height);
  }

  private createNpcs(): void {
    for (const def of NPC_DEFINITIONS) {
      for (let i = 0; i < def.count; i++) {
        this.spawnNpc(def.textureKey, def.displayHeight);
      }
    }
    this.spawnNpc(NPC_SINGLE_TEXTURE_KEY, NPC_SINGLE_DISPLAY_HEIGHT);
  }

  private spawnNpc(textureKey: string, displayHeight: number): void {
    const x = Phaser.Math.Between(NPC_ROAM_MIN_X, NPC_ROAM_MAX_X);

    const sprite = this.add.sprite(x, 0, textureKey);
    sprite.setScale(displayHeight / sprite.height);
    sprite.setY(STAND_LINE_Y - sprite.displayHeight / 2);

    const behavior: NpcBehavior = Math.random() < NPC_WALK_PROBABILITY ? "walking" : "standing";
    const patrolRange = Phaser.Math.Between(NPC_PATROL_RANGE_MIN, NPC_PATROL_RANGE_MAX);
    const speed = Phaser.Math.Between(NPC_SPEED_MIN, NPC_SPEED_MAX);

    this.npcs.push(new Npc(this, sprite, behavior, patrolRange, speed));
  }

  private createVillains(): void {
    for (const def of VILLAIN_DEFINITIONS) {
      for (let i = 0; i < def.count; i++) {
        const x = Phaser.Math.Between(VILLAIN_ROAM_MIN_X, VILLAIN_ROAM_MAX_X);

        const sprite = this.add.sprite(x, 0, def.textureKey);
        sprite.setScale(def.displayHeight / sprite.height);
        sprite.setY(STAND_LINE_Y - sprite.displayHeight / 2);

        this.villains.push(new Villain(sprite, def.config));
      }
    }
  }

  private spawnBullet(x: number, y: number, direction: 1 | -1): void {
    const sprite = this.add.image(x, y, "bullet");
    sprite.setScale(BULLET_DISPLAY_HEIGHT / sprite.height);
    sprite.setFlipX(direction < 0);
    this.bullets.push({ sprite, direction, traveledDistance: 0 });
  }

  /** Bewegt alle Projektile; gibt zurück, ob eines Maia gerade getroffen hat. */
  private updateBullets(deltaSeconds: number, playerFeetY: number): boolean {
    let hit = false;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      const step = BULLET_SPEED * deltaSeconds;
      bullet.sprite.x += bullet.direction * step;
      bullet.traveledDistance += step;

      const bulletTopY = bullet.sprite.y - bullet.sprite.displayHeight / 2;
      const jumpedClear = playerFeetY < bulletTopY;
      const inRange = Math.abs(bullet.sprite.x - this.maia.x) < BULLET_HIT_RADIUS;

      if (inRange && !jumpedClear) {
        hit = true;
        bullet.sprite.destroy();
        this.bullets.splice(i, 1);
      } else if (bullet.traveledDistance > BULLET_MAX_RANGE) {
        bullet.sprite.destroy();
        this.bullets.splice(i, 1);
      }
    }

    return hit;
  }

  private triggerWasted(): void {
    this.isWasted = true;
    this.wastedTimerMs = WASTED_DURATION_MS;
    (this.maia.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.wastedScreen.show();
  }

  private respawnAfterWasted(): void {
    this.isWasted = false;
    this.wastedScreen.hide();
    this.maia.setX(MAIA_RESPAWN_X);
    (this.maia.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private createMaia(): void {
    const sprite = this.physics.add.sprite(200, 0, "maia");
    const scale = MAIA_DISPLAY_HEIGHT / sprite.height;
    sprite.setScale(scale);
    sprite.setY(STAND_LINE_Y - sprite.displayHeight / 2);
    sprite.setCollideWorldBounds(true);
    this.maia = sprite;
  }

  private createDog(): void {
    const sprite = this.add.sprite(140, 0, "amber");
    const scale = DOG_DISPLAY_HEIGHT / sprite.height;
    sprite.setScale(scale);
    sprite.setY(STAND_LINE_Y - sprite.displayHeight / 2);
    this.dog = sprite;
  }

  update(_time: number, delta: number): void {
    if (this.isWasted) {
      this.wastedTimerMs -= delta;
      if (this.wastedTimerMs <= 0) {
        this.respawnAfterWasted();
      }
      return;
    }

    this.handleMaiaMovement();
    this.dogFollower.update();
    this.checkHouseDoor(delta);

    const deltaSeconds = delta / 1000;
    for (const npc of this.npcs) {
      npc.update(deltaSeconds, this.maia.x);
    }

    const feetY = this.maia.y + this.maia.displayHeight / 2;
    let catcher: Villain | undefined;
    for (const villain of this.villains) {
      const result = villain.update(deltaSeconds, this.maia.x, feetY);
      if (result.caught && !catcher) {
        catcher = villain;
      }
      if (result.shouldShoot) {
        const direction = this.maia.x >= villain.x ? 1 : -1;
        this.spawnBullet(villain.x, villain.y, direction);
      }
    }

    let caught = false;
    if (catcher) {
      // Der fangende Bösewicht verschwindet.
      catcher.destroy();
      this.villains = this.villains.filter((villain) => villain !== catcher);
      caught = true;
    }

    if (this.updateBullets(deltaSeconds, feetY)) {
      caught = true;
    }

    if (caught) {
      this.triggerWasted();
    }
  }

  /** Wird von HouseScene beim Verlassen des Hauses aufgerufen. */
  public exitFromHouse(): void {
    this.maia.setX(this.houseX + HOUSE_EXIT_OFFSET_X);
    (this.maia.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.doorStandTimerMs = 0;
  }

  private checkHouseDoor(delta: number): void {
    const body = this.maia.body as Phaser.Physics.Arcade.Body;
    const nearDoor = Math.abs(this.maia.x - this.houseX) < HOUSE_DOOR_TRIGGER_RADIUS;
    const standingStill = body.velocity.x === 0 && (body.blocked.down || body.touching.down);

    if (nearDoor && standingStill) {
      this.doorStandTimerMs += delta;
      if (this.doorStandTimerMs >= HOUSE_ENTER_STAND_DURATION_MS) {
        this.doorStandTimerMs = 0;
        this.scene.sleep();
        this.scene.launch("HouseScene");
      }
    } else {
      this.doorStandTimerMs = 0;
    }
  }

  private handleMaiaMovement(): void {
    const body = this.maia.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;

    if (this.cursors.left?.isDown || this.touchControls.leftDown) {
      body.setVelocityX(-MAIA_SPEED);
      this.maia.setFlipX(true);
    } else if (this.cursors.right?.isDown || this.touchControls.rightDown) {
      body.setVelocityX(MAIA_SPEED);
      this.maia.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.jumpKey) || this.touchControls.consumeJumpPress();
    if (jumpPressed && onGround) {
      body.setVelocityY(MAIA_JUMP_VELOCITY);
    }
  }
}
