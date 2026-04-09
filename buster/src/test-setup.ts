globalThis.OffscreenCanvas = class OffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return {
      font: "",
      measureText: () => ({ width: 8.4 }),
    };
  }
} as any;
