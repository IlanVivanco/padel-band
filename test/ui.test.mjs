// UI tests: drive the compiled page (build/) in headless Chromium through
// test/harness (adapted from Calc+). Run a plain build first:
//   npx aiot build && node --test test/ui.test.mjs
// Layout is Chromium's flexbox, not the band's renderer, so pixel-exact
// results can differ slightly on the device; bindings, logic and events are
// the real compiled code.
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let playwright
try {
  playwright = require('playwright')
} catch {
  playwright = require('/opt/node22/lib/node_modules/playwright')
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = path.join(ROOT, 'test', 'screens')
const STORE = 'st:padel-band-state'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' }
let server, base, browser

test.before(async () => {
  if (!fs.existsSync(path.join(ROOT, 'build', 'pages', 'index', 'index.js'))) {
    throw new Error('build/ missing (or JSC-only): run `npx aiot build` first')
  }
  fs.mkdirSync(SHOTS, { recursive: true })
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' })
    fs.createReadStream(p).pipe(res)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await playwright.chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.close()
})

// Opens the app with a saved match (history of point winners).
async function open(history = '', golden = false) {
  const page = await browser.newPage({ viewport: { width: 212, height: 520 } })
  await page.goto(base + '/test/harness/index.html')
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, JSON.stringify({ v: 1, h: history, g: golden })])
  await page.reload()
  await page.waitForFunction(() => window.__ready && window.__storageGets >= 1)
  await page.waitForTimeout(30)
  const errors = await page.evaluate(() => window.__errors)
  assert.deepEqual(errors, [])
  return page
}

const g = (w) => w.repeat(4) // a game won to love
const set = (w, l, n, m) => {
  // n games for w, m for l, alternating so it never ends early
  let s = ''
  for (let i = 0; i < Math.max(n, m); i++) {
    if (i < m) s += g(l)
    if (i < n) s += g(w)
  }
  return s
}

// Boxes (relative to the screen) for a few elements.
async function boxes(page, ids) {
  return page.evaluate((ids) => {
    const s = document.getElementById('screen').getBoundingClientRect()
    const out = {}
    for (const id of ids) {
      const el = document.getElementById(id)
      if (!el) { out[id] = null; continue }
      const r = el.getBoundingClientRect()
      out[id] = { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 }
    }
    return out
  }, ids)
}

// Equal within half a pixel.
function near(a, b, msg) {
  assert.ok(Math.abs(a - b) <= 0.5, `${msg}: ${a} vs ${b}`)
}

async function shot(page, name) {
  await page.evaluate(() => document.body.classList.add('clean'))
  await page.locator('#screen').screenshot({ path: path.join(SHOTS, name + '.png') })
}

const STATES = {
  '01-start': [''],
  '02-normal': [set('u', 't', 6, 4) + set('t', 'u', 3, 2) + 'tut'],
  '03-ad-us': [set('u', 't', 6, 4) + 'uuuttt' + 'u'],
  '04-ad-them': [set('u', 't', 6, 4) + 'uuuttt' + 't'],
  '05-golden': [set('t', 'u', 6, 4) + set('u', 't', 2, 1) + 'uuuttt', true],
  '06-tiebreak': [set('t', 'u', 6, 4) + set('u', 't', 6, 3) + set('u', 't', 6, 6).slice(0) + 'uuuuuttttt' + 'u'],
  '07-win-us': [set('t', 'u', 6, 4) + set('u', 't', 6, 3) + set('u', 't', 7, 5)],
  '08-win-them': [set('t', 'u', 6, 4) + set('t', 'u', 6, 2)]
}

test('every state renders inside the capsule with no overflow', async () => {
  for (const [name, args] of Object.entries(STATES)) {
    const page = await open(...args)
    // The halves and the board are full-bleed backgrounds: the capsule's own
    // shape trims them, so only their contents must stay inside it.
    const FULL_BLEED = /^outside the capsule: (board|half-them|half-us) at/
    const issues = (await page.evaluate(() => window.harness.layoutIssues())).filter((i) => !FULL_BLEED.test(i))
    assert.deepEqual(issues, [], name)
    await shot(page, name)
    await page.close()
  }
})

test('halves, board and points are centred', async () => {
  const page = await open(STATES['02-normal'][0])
  const b = await boxes(page, ['half-them', 'half-us', 'pts-them', 'pts-us'])
  assert.deepEqual([b['half-them'].y, b['half-them'].h], [0, 200])
  assert.deepEqual([b['half-us'].y, b['half-us'].h], [320, 200])
  near(b['pts-them'].cx, 106, 'them points x')
  near(b['pts-them'].cy, 100, 'them points y')
  near(b['pts-us'].cy, 420, 'us points y')
  await page.close()
})

test('scoreboard columns are centred and symmetric', async () => {
  for (const name of ['01-start', '02-normal', '06-tiebreak']) {
    const page = await open(...STATES[name])
    const ids = ['c0-them', 'c0-us', 'c1-them', 'c1-us', 'c2-them', 'c2-us']
    const b = await boxes(page, ids)
    const present = ids.filter((id) => b[id])
    const left = Math.min(...present.map((id) => b[id].x))
    const right = Math.max(...present.map((id) => b[id].x + b[id].w))
    near((left + right) / 2, 106, name + ': horizontally centred')
    // the two rows sit symmetrically about the board's middle (y = 260)
    near((b['c0-them'].cy + b['c0-us'].cy) / 2, 260, name + ': vertically centred')
    await page.close()
  }
})

test('the pill is centred on the board / us edge and moves nothing', async () => {
  const plain = await open(STATES['02-normal'][0])
  const before = await boxes(plain, ['c0-them', 'pts-us'])
  await plain.close()
  for (const name of ['05-golden', '06-tiebreak']) {
    const page = await open(...STATES[name])
    const b = await boxes(page, ['pill', 'c0-them', 'pts-us'])
    assert.ok(b.pill, name + ': pill shown')
    near(b.pill.cy, 320, name + ': pill centred on the edge')
    near(b.pill.cx, 106, name + ': pill centred horizontally')
    near(b['c0-them'].cy, before['c0-them'].cy, name + ': board did not move')
    near(b['pts-us'].cy, before['pts-us'].cy, name + ': points did not move')
    await page.close()
  }
})

test('labels and texts for each state', async () => {
  const t = async (name, ids) => {
    const page = await open(...STATES[name])
    const out = {}
    for (const id of ids) out[id] = await page.evaluate((id) => window.harness.text(id), id)
    await page.close()
    return out
  }
  assert.deepEqual(await t('03-ad-us', ['pts-us', 'label-us', 'pts-them']), { 'pts-us': 'AD', 'label-us': 'VENTAJA', 'pts-them': '40' })
  assert.deepEqual(await t('04-ad-them', ['pts-them', 'label-them']), { 'pts-them': 'AD', 'label-them': 'VENTAJA' })
  assert.deepEqual(await t('05-golden', ['pill', 'pts-us', 'pts-them']), { pill: 'PUNTO DE ORO', 'pts-us': '40', 'pts-them': '40' })
  assert.deepEqual(await t('06-tiebreak', ['pill']), { pill: 'TIE-BREAK' })
  assert.deepEqual(await t('07-win-us', ['pts-us', 'label-us', 'pts-them']), { 'pts-us': 'WIN', 'label-us': 'GANAMOS', 'pts-them': '-' })
  assert.deepEqual(await t('08-win-them', ['pts-them', 'label-them']), { 'pts-them': 'WIN', 'label-them': 'GANAN' })
})

test('tap and swipes score on the right side', async () => {
  const page = await open('')
  const pts = () => page.evaluate(() => [window.harness.text('pts-them'), window.harness.text('pts-us')])
  const tap = async (x, y) => {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.up()
  }
  const swipe = async (x0, x1, y) => {
    await page.mouse.move(x0, y)
    await page.mouse.down()
    await page.mouse.move((x0 + x1) / 2, y)
    await page.mouse.move(x1, y)
    await page.mouse.up()
  }
  await tap(106, 420)
  assert.deepEqual(await pts(), ['0', '15'])
  await swipe(40, 170, 100)
  assert.deepEqual(await pts(), ['15', '15'])
  await swipe(170, 40, 420)
  assert.deepEqual(await pts(), ['15', '0'])
  await swipe(170, 40, 420) // nothing left to take
  assert.deepEqual(await pts(), ['15', '0'])
  const vib = await page.evaluate(() => window.__vibrations)
  assert.deepEqual(vib, ['short', 'short', 'short'])
  await page.close()
})
