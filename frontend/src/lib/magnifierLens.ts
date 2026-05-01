import {
  Application,
  Container,
  Graphics,
  RenderTexture,
  Sprite,
} from "pixi.js";

export class MagnifierLens {
  public container: Container;
  private lensSprite: Sprite;
  private lensMask: Graphics;
  private ring: Graphics;
  private rt: RenderTexture;
  private zoom: number;
  private radius: number;
  private sceneContainer: Container;
  private app: Application;

  constructor(
    app: Application,
    sceneContainer: Container,
    radius = 110,
    zoom = 3.5,
  ) {
    this.app = app;
    this.sceneContainer = sceneContainer;
    this.zoom = zoom;
    this.radius = radius;

    this.rt = RenderTexture.create({ width: radius * 2, height: radius * 2 });

    this.lensSprite = new Sprite(this.rt);
    this.lensSprite.x = -radius;
    this.lensSprite.y = -radius;

    this.lensMask = new Graphics();
    this.lensMask.circle(0, 0, radius);
    this.lensMask.fill({ color: 0xffffff });

    // Gold ring border — matches wheel border style
    this.ring = new Graphics();
    this.ring.circle(0, 0, radius);
    this.ring.stroke({ color: 0xffffff, width: 1 });
    this.ring.circle(0, 0, radius - 7);

    // Triangle pointer at TOP of lens pointing downward (like the wheel pointer)
 

    this.container = new Container();
    this.container.addChild(this.lensSprite);
    this.container.addChild(this.lensMask);
    this.lensSprite.mask = this.lensMask;
    this.container.addChild(this.ring);
   
    this.container.visible = false;
    this.container.eventMode = "none";
  }

  /**
   * Re-renders the zoomed view centered on the wheel's top pointer position.
   * The focal point is the midpoint of the outer number band at 12 o'clock.
   *
   * @param outerRadius  OUTER_RADIUS constant (unscaled, local wheel space)
   * @param middleRadius MIDDLE_RADIUS constant (unscaled, local wheel space)
   */
// In MagnifierLens.ts — updateAtPointer method, change the localY:

updateAtPointer(outerRadius: number, middleRadius: number) {
  const localX = 0;
  const localY = -(outerRadius - (outerRadius - middleRadius) / 2);
  this.updateAtLocal(localX, localY);
}

updateAtLocal(localX: number, localY: number) {
  const { radius, zoom, rt, sceneContainer } = this;

  const savedX = sceneContainer.x;
  const savedY = sceneContainer.y;
  const savedSX = sceneContainer.scale.x;
  const savedSY = sceneContainer.scale.y;

  sceneContainer.scale.set(savedSX * zoom, savedSY * zoom);
  sceneContainer.x = radius - localX * savedSX * zoom;
  sceneContainer.y = radius - localY * savedSY * zoom;

  this.app.renderer.render({
    container: sceneContainer,
    target: rt,
    clear: true,
  });

  sceneContainer.scale.set(savedSX, savedSY);
  sceneContainer.x = savedX;
  sceneContainer.y = savedY;
}
  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }

  moveTo(x: number, y: number) {
    this.container.x = x;
    this.container.y = y;
  }

  destroy() {
    this.rt.destroy();
    this.container.destroy({ children: true });
  }
}
