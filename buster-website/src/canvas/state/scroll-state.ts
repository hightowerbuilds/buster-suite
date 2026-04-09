export let scrollY = 0;
export let scrollVelocity = 0;
export let totalContentHeight = 0;

export const sectionOffsets = { hero: 0, features: 0, extensions: 0, footer: 0 };

export function setScrollY(v: number) { scrollY = v; }
export function setScrollVelocity(v: number) { scrollVelocity = v; }
export function setTotalContentHeight(v: number) { totalContentHeight = v; }
