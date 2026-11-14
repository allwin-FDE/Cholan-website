// Photo handling for short posts: reading a picked photo, cropping it, and
// keeping an unfinished post on this device.
import { prepareImage } from '../dashboard/api.js';

export const POST_CATEGORIES = ['Recipes', 'Health & nutrition', 'Rice guide', 'Farming & sourcing', 'News', 'Offers'];
export const MAX_PHOTOS = 10;
// Every picture of a blog, the cover and the main pictures alike, is saved at
// one size: 16:9, exactly 1600 x 900 pixels.
export const PHOTO_RATIO = '16:9';
export const PHOTO_WIDTH = 1600;
export const PHOTO_HEIGHT = 900;
export const RATIOS = [
  { key: '4:5', label: 'Portrait', value: 4 / 5 },
  { key: '1:1', label: 'Square', value: 1 },
  { key: '16:9', label: 'Wide', value: 16 / 9 },
];
// Free: the whole picture as it is, whatever its shape, with nothing cut off.
export const FREE = 'free';
const FREE_CHIP = { key: FREE, label: 'Free', value: null };
// The other main pictures can also be left as they are.
export const PICTURE_RATIOS = [...RATIOS, FREE_CHIP];
// The first main picture is the big one at the top of the blog: wide, or free.
export const HERO_RATIO = '5:2';
export const HERO_RATIOS = [{ key: HERO_RATIO, label: 'Wide', value: 5 / 2 }, FREE_CHIP];
export const ratioValue = (key) => {
  if (key === FREE) return null;
  return key === HERO_RATIO ? 5 / 2 : RATIOS.find((r) => r.key === key)?.value ?? 4 / 5;
};

let nextId = 0;
export const newPhoto = (blob, extra = {}) => ({
  id: `p${Date.now()}-${(nextId += 1)}`,
  blob,
  src: URL.createObjectURL(blob),
  rotation: 0,
  crop: { x: 0, y: 0 },
  zoom: 1,
  area: null, // the crop in pixels; null until adjusted means "the centre"
  uploaded: null, // { url, width, height } once on the server, cleared by any edit
  ...extra,
});

// A photo from the phone or computer, shrunk for keeping and cropping.
export async function readPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not a photo.`);
  let blob;
  try {
    blob = await prepareImage(file, 2400);
    await createImageBitmap(blob);
  } catch {
    throw new Error(`${file.name} could not be opened. Try a JPG or PNG photo.`);
  }
  return newPhoto(blob);
}

// A photo already on the server, fetched so it can be cropped again. The
// cache is skipped because a plain image load may have stored it without the
// permission a canvas needs.
export async function fetchPhoto(media) {
  const response = await fetch(media.url, { mode: 'cors', cache: 'reload' });
  if (!response.ok) throw new Error('A photo could not be loaded. Please try again.');
  return newPhoto(await response.blob(), { uploaded: { url: media.url, width: media.width, height: media.height } });
}

const encode = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// The finished photo: turned and cropped, then sized. The crop is measured on
// the turned photo, as the crop tool reports it. A 16:9 picture always comes
// out at exactly PHOTO_WIDTH x PHOTO_HEIGHT, a smaller photo enlarged to fit.
export async function renderPhoto(photo, ratioKey = PHOTO_RATIO, maxWidth = PHOTO_WIDTH) {
  const bitmap = await createImageBitmap(photo.blob);
  const sideways = photo.rotation % 180 !== 0;
  const fullW = sideways ? bitmap.height : bitmap.width;
  const fullH = sideways ? bitmap.width : bitmap.height;
  const ratio = ratioValue(ratioKey);
  let area = ratio ? photo.area : { x: 0, y: 0, width: fullW, height: fullH };
  if (!area) {
    const width = Math.min(fullW, fullH * ratio);
    const height = width / ratio;
    area = { x: (fullW - width) / 2, y: (fullH - height) / 2, width, height };
  }
  const exact = ratioKey === PHOTO_RATIO;
  const scale = exact ? PHOTO_WIDTH / area.width : Math.min(1, maxWidth / area.width);
  const canvas = document.createElement('canvas');
  canvas.width = exact ? PHOTO_WIDTH : Math.round(area.width * scale);
  canvas.height = exact ? PHOTO_HEIGHT : Math.round(area.height * scale);
  canvas.getContext('2d').imageSmoothingQuality = 'high';
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.translate(-area.x + fullW / 2, -area.y + fullH / 2);
  ctx.rotate((photo.rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  // Some phones cannot write WebP and hand back a far larger PNG instead.
  let blob = await encode(canvas, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/jpeg', 0.88);
  return { blob, width: canvas.width, height: canvas.height };
}

// ---- The unfinished post, kept on this device (photos and all) ----
const DB = 'cholan-admin';
const KEY = 'draft';

function store(mode, work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode);
      const request = work(tx.objectStore('kv'));
      tx.oncomplete = () => {
        open.result.close();
        resolve(request.result);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

// Keeping the draft is a convenience: if the browser refuses, the post still works.
export async function saveDraft(draft) {
  const keep = ({ id, blob, rotation, crop, zoom, area }) => ({ id, blob, rotation, crop, zoom, area });
  const value = { ...draft, cover: draft.cover && keep(draft.cover), photos: draft.photos.map(keep), savedAt: Date.now() };
  await store('readwrite', (kv) => kv.put(value, KEY)).catch(() => {});
}

export async function loadDraft() {
  const draft = await store('readonly', (kv) => kv.get(KEY)).catch(() => null);
  if (!draft) return null;
  const restore = (p) => ({ ...newPhoto(p.blob), ...p });
  return { ...draft, cover: draft.cover && restore(draft.cover), photos: draft.photos.map(restore) };
}

export const clearDraft = () => store('readwrite', (kv) => kv.delete(KEY)).catch(() => {});
