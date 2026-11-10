import { readdir, readFile, appendFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_DIR = 'dist'
const ASSET_EXTENSIONS = new Set(['.js', '.css'])

async function getAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const assets = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      assets.push(...await getAssets(fullPath))
    } else if (ASSET_EXTENSIONS.has(extname(entry.name))) {
      const content = await readFile(fullPath)

      assets.push({
        name: relative(DIST_DIR, fullPath).replaceAll('\\', '/'),
        type: extname(entry.name).slice(1).toUpperCase(),
        size: content.length,
        gzipSize: gzipSync(content).length,
      })
    }
  }

  return assets
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`
}

async function main() {
  const assets = await getAssets(DIST_DIR)

  if (assets.length === 0) {
    throw new Error(`No JavaScript or CSS assets found in ${DIST_DIR}`)
  }

  assets.sort((a, b) => b.size - a.size)

  const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0)
  const totalGzip = assets.reduce((sum, asset) => sum + asset.gzipSize, 0)

  const rows = assets.map(asset =>
    `| ${asset.name} | ${asset.type} | ${formatBytes(asset.size)} | ${formatBytes(asset.gzipSize)} |`
  )

  const report = [
    '## Bundle Size Report',
    '',
    '| Asset | Type | Original Size | Gzip Size |',
    '|---|---|---:|---:|',
    ...rows,
    '',
    `**Total:** ${formatBytes(totalSize)} original · ${formatBytes(totalGzip)} gzip`,
    '',
    `_${assets.length} JavaScript/CSS assets analyzed._`,
  ].join('\n')

  console.log(report)

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
  }
}

main().catch(error => {
  console.error('Bundle size reporting failed:', error)
  process.exitCode = 1
})
