import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { DropShadowFilter, BevelFilter } from "pixi-filters";

export class MagnifiedSegmentWidget {
  container: Container;
  private bg: Graphics;
  private label: Text;
  private currentColor: number = 0x333333;

  constructor(size: number = 110) {
    this.container = new Container();

    // Outer ring glow border
    const border = new Graphics();
    border.circle(0, 0, size / 2 + 6);
    border.fill({ color: 0xffd700 });
    this.container.addChild(border);

    // Colored segment background circle
    this.bg = new Graphics();
    this.bg.circle(0, 0, size / 2);
    this.bg.fill({ color: 0x333333 });
    this.container.addChild(this.bg);

    // Number label
    this.label = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Arial",
        fontSize: size * 0.45,
        fontWeight: "bold",
        fill: 0xffffff,
      }),
    });
    this.label.anchor.set(0.5, 0.5);
    this.label.filters = [
      new DropShadowFilter({ offset: { x: 2, y: 3 }, blur: 4, alpha: 0.7 }),
    ];
    this.container.addChild(this.label);

    this.container.filters = [
      new DropShadowFilter({ offset: { x: 4, y: 6 }, blur: 8, alpha: 0.7 }),
      new BevelFilter({ thickness: 3, lightAlpha: 0.8, shadowAlpha: 0.5 }),
    ];
  }

  update(label: string, color: number) {
    if (label === this.label.text && color === this.currentColor) return;
    this.label.text = label;
    this.currentColor = color;
    this.bg.clear();
    this.bg.circle(0, 0, this.bg.width / 2 || 55); // reuse radius
    this.bg.fill({ color });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
