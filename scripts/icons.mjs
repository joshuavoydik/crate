// Generates the PWA icons from an inline SVG mark. Run: node scripts/icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0a0a0b"/>
  <circle cx="256" cy="256" r="${pad ? 150 : 172}" fill="none" stroke="#efe9df" stroke-width="14"/>
  <circle cx="256" cy="256" r="${pad ? 96 : 110}" fill="none" stroke="#efe9df" stroke-opacity="0.35" stroke-width="10"/>
  <circle cx="256" cy="256" r="${pad ? 30 : 34}" fill="#c8b89a"/>
  <circle cx="${pad ? 356 : 370}" cy="${pad ? 156 : 142}" r="14" fill="#c8b89a"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const normal = Buffer.from(mark(false));
const maskable = Buffer.from(mark(true));
await sharp(normal).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(normal).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(normal).resize(180, 180).png().toFile("public/icons/apple-touch-icon.png");
await sharp(maskable).resize(512, 512).png().toFile("public/icons/maskable-512.png");
console.log("icons written");
