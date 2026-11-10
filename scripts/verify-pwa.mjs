import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(process.cwd(), 'dist')
const manifestPath = join(distDir, 'manifest.webmanifest')
const serviceWorkerPath = join(distDir, 'firebase-messaging-sw.js')

let failed = false

function check(condition, successMessage, errorMessage) {
  if (condition) {
    console.log(`✅ ${successMessage}`)
  } else {
    console.error(`❌ ${errorMessage}`)
    failed = true
  }
}

check(
  existsSync(manifestPath),
  'PWA manifest exists',
  'PWA manifest is missing'
)

if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

    check(manifest.name && manifest.short_name,
      'Manifest has name and short_name',
      'Manifest is missing name or short_name')

    check(manifest.start_url && manifest.scope,
      'Manifest has start_url and scope',
      'Manifest is missing start_url or scope')

    check(
      ['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display),
      'Manifest has a supported display mode',
      'Manifest display mode is invalid'
    )

    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons?.find(item => item.sizes === size)

      check(
        icon && existsSync(join(distDir, icon.src.replace(/^\/+/, ''))),
        `${size} icon exists`,
        `${size} icon is missing`
      )
    }
  } catch (error) {
    check(false, '', `Invalid manifest JSON: ${error.message}`)
  }
}

check(
  existsSync(serviceWorkerPath),
  'Firebase service worker exists',
  'Firebase service worker is missing'
)

if (failed) {
  console.error('\nPWA verification failed.')
  process.exit(1)
}

console.log('\n🎉 PWA verification passed!')