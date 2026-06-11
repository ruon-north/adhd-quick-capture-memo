import { spawn } from 'node:child_process'
import { once } from 'node:events'

const host = '127.0.0.1'
const port = '4173'
const origin = `http://${host}:${port}`
const requestedBase = process.argv
  .find((argument) => argument.startsWith('--base='))
  ?.slice('--base='.length)
const basePath = requestedBase ?? '/'
const targetUrl = new URL(basePath.replace(/^\//, ''), `${origin}/`).toString()

async function run(command) {
  const child = spawn(process.execPath, command, {
    stdio: 'inherit',
    env: process.env
  })
  const [code] = await once(child, 'exit')
  return code ?? 1
}

async function waitForPreview() {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl)
      if (response.ok) return
    } catch {
      // The preview server may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Preview server did not become ready at ${targetUrl}`)
}

async function stopPreview(preview) {
  if (preview.exitCode !== null) return

  preview.kill()
  await Promise.race([
    once(preview, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ])
}

let exitCode = 1
let preview

try {
  exitCode = await run([
    'node_modules/vite/bin/vite.js',
    'build',
    '--base',
    basePath
  ])
  if (exitCode !== 0) process.exitCode = exitCode

  if (exitCode !== 0) {
    throw new Error(`Vite build failed with exit code ${exitCode}`)
  }

  preview = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--host',
      host,
      '--port',
      port,
      '--base',
      basePath
    ],
    { stdio: 'inherit' }
  )
  await waitForPreview()
  const playwright = spawn(process.execPath, [
    'node_modules/@playwright/test/cli.js',
    'test'
  ], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BASE_URL: targetUrl }
  })
  const [playwrightCode] = await once(playwright, 'exit')
  exitCode = playwrightCode ?? 1
} finally {
  if (preview) await stopPreview(preview)
}

process.exitCode = exitCode
