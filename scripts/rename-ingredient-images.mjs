import { readdirSync, renameSync } from 'fs'
import { join } from 'path'

const IMAGES_DIR = new URL('../public/images/ingredients', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1') // fix Windows path: /C:/... → C:/...

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

const files = readdirSync(IMAGES_DIR)
let renamed = 0

for (const file of files) {
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
  if (!IMAGE_EXTS.has(ext)) continue
  if (!file.includes(' ')) continue

  const newName = file.replaceAll(' ', '-')
  renameSync(join(IMAGES_DIR, file), join(IMAGES_DIR, newName))
  console.log(`renamed: '${file}' → '${newName}'`)
  renamed++
}

if (renamed === 0) {
  console.log('no files needed renaming')
} else {
  console.log(`done — ${renamed} file${renamed !== 1 ? 's' : ''} renamed`)
}
