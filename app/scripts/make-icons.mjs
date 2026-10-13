// Builds the app's logo and icon files from brand/logo-source.webp.
// Run from the app folder: node scripts/make-icons.mjs
import sharp from 'sharp'

const src = '../brand/logo-source.webp'
const meta = await sharp(src).metadata()
const w = meta.width
console.log('source', meta.width, 'x', meta.height)

// Full logo with the surrounding white space trimmed off.
await sharp(src).trim().resize({ width: 640 }).png().toFile('public/logo.png')

// Square crop around the camera mark, positioned as fractions of the source width.
const size = Math.round(w * 0.235)
const mark = { left: Math.round(w * 0.385), top: Math.round(w * 0.1775), width: size, height: size }
for (const px of [64, 192, 512]) {
  await sharp(src).extract(mark).resize(px, px).flatten({ background: '#ffffff' }).png().toFile(`public/icon-${px}.png`)
}
console.log('wrote public/logo.png and icons')
