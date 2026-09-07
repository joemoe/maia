import Phaser from "phaser";

export interface VillainConfig {
  detectionRadius: number;
  catchRadius: number;
  chaseSpeed: number;
  canShoot: boolean;
  shootCooldownMs: number;
}

export interface VillainUpdateResult {
  caught: boolean;
  shouldShoot: boolean;
}

/**
 * Ein Bösewicht: steht herum, bis Maia in Sichtweite (detectionRadius) kommt,
 * dann rennt er ihr hinterher. Fängt er sie ein (catchRadius), ist das ein
 * Treffer. Manche Typen (canShoot) feuern zusätzlich in Abständen einen
 * Schuss in ihre Richtung, solange sie in Sichtweite ist.
 */
export class Villain {
  private sprite: Phaser.GameObjects.Sprite;
  private config: VillainConfig;
  private shootTimerMs: number;

  constructor(sprite: Phaser.GameObjects.Sprite, config: VillainConfig) {
    this.sprite = sprite;
    this.config = config;
    // Zufälliger Start-Versatz, damit nicht alle im selben Moment feuern.
    this.shootTimerMs = Math.random() * config.shootCooldownMs;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /**
   * @param playerFeetY Y-Position von Maias Füßen - liegt sie im Sprung über
   * dem Kopf des Bösewichts, zählt das (richtig getimed) nicht als Fang.
   */
  update(deltaSeconds: number, playerX: number, playerFeetY: number): VillainUpdateResult {
    const distance = Math.abs(this.sprite.x - playerX);
    const isNear = distance < this.config.detectionRadius;

    if (isNear) {
      const direction = playerX >= this.sprite.x ? 1 : -1;
      this.sprite.x += direction * this.config.chaseSpeed * deltaSeconds;
      this.sprite.setFlipX(direction < 0);
    }

    let shouldShoot = false;
    if (this.config.canShoot) {
      this.shootTimerMs -= deltaSeconds * 1000;
      if (isNear && this.shootTimerMs <= 0) {
        this.shootTimerMs = this.config.shootCooldownMs;
        shouldShoot = true;
      }
    }

    const headY = this.sprite.y - this.sprite.displayHeight / 2;
    const jumpedClear = playerFeetY < headY;

    return { caught: distance < this.config.catchRadius && !jumpedClear, shouldShoot };
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
