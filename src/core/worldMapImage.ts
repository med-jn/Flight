// The pre-rendered world map (see scripts/build-world-map.mjs) — a plain image, exactly like
// the original photo-based map, except generated from real coastline data so it's complete
// and accurate at any zoom level, with no calibration needed: it's built so the pole sits
// exactly at the image's center and its radius is exactly half its width, by construction.
let img: HTMLImageElement | null = null;
let loaded = false;

export function loadWorldMapImage(): HTMLImageElement {
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}images/world-map.png`;
    img.onload = () => { loaded = true; };
  }
  return img;
}

export function isWorldMapImageLoaded(): boolean {
  return loaded;
}

export function getWorldMapImage(): HTMLImageElement | null {
  return loaded ? img : null;
}