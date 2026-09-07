import Phaser from "phaser";

interface TrailPoint {
  feetX: number;
  feetY: number;
  flipX: boolean;
}

/**
 * Lässt einen Hund-Sprite der Positionshistorie eines Anführers (z.B. Maia)
 * mit Verzögerung folgen. Dadurch läuft er nicht nur hinterher, sondern
 * übernimmt verzögert auch dessen Bewegungen (z.B. Sprünge).
 */
export class DogFollower {
  private trail: TrailPoint[] = [];
  private dog: Phaser.GameObjects.Sprite;
  private leader: Phaser.GameObjects.Sprite;
  private lagFrames: number;
  private standOffsetX: number;

  constructor(
    dog: Phaser.GameObjects.Sprite,
    leader: Phaser.GameObjects.Sprite,
    lagFrames: number,
    standOffsetX: number,
  ) {
    this.dog = dog;
    this.leader = leader;
    this.lagFrames = lagFrames;
    this.standOffsetX = standOffsetX;
  }

  update(): void {
    this.trail.push({
      feetX: this.leader.x,
      feetY: this.leader.y + this.leader.displayHeight / 2,
      flipX: this.leader.flipX,
    });

    const maxTrailLength = this.lagFrames + 1;
    if (this.trail.length > maxTrailLength) {
      this.trail.shift();
    }

    const target = this.trail[0];
    const behindSign = target.flipX ? 1 : -1;

    this.dog.setPosition(
      target.feetX + this.standOffsetX * behindSign,
      target.feetY - this.dog.displayHeight / 2,
    );
    this.dog.setFlipX(target.flipX);
  }
}
