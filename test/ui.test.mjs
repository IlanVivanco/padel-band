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

// Opens the app with a saved match (history of point winners). `deuce` is
// the deuce rule ('adv', 'gold', 'star'; false / true as in old saves);
// `first` is the team that served first; null shows the who-serves screen.
// Animations are off (?noanim), so every state shows at once.
// `lang` is the saved language; none leaves the prefs unset (Spanish).
async function open(history = '', deuce = 'adv', first = 'u', lang = null) {
  const page = await browser.newPage({ viewport: { width: 212, height: 520 } })
  await page.goto(base + '/test/harness/index.html?noanim')
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [STORE, JSON.stringify({ v: 1, h: history, d: deuce, f: first })])
  if (lang) await page.evaluate((l) => localStorage.setItem('st:padel-band-prefs', JSON.stringify({ keepOn: true, lang: l })), lang)
  await page.reload()
  await page.waitForFunction(() => window.__ready && window.__storageGets >= 2)
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
  '05-golden': [set('t', 'u', 6, 4) + set('u', 't', 2, 1) + 'uuuttt', 'gold'],
  '05-star': [set('t', 'u', 6, 4) + set('u', 't', 2, 1) + 'uuuttt' + 'ut' + 'tu', 'star'],
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

// Opening the panel ignores clicks this long (the finger that opened it).
const CLICK_GUARD = 420
// Closing slides the sheet up, then drops it.
const CLOSE = 240
const closePanel = async (page) => {
  await page.evaluate(() => window.harness.vm.closePanel())
  await page.waitForTimeout(CLOSE)
}
// Scrolls the list on screen to `y` px, as a finger would.
const scrollList = async (page, y) => {
  await page.evaluate((y) => {
    const el = document.querySelector('#screen [data-type="scroll"]')
    el.scrollTop = y
    el.dispatchEvent(new Event('scroll'))
  }, y)
  await page.waitForTimeout(20)
}

// Opens a panel view directly, as the page would, and waits out the click
// guard.
async function view(page, v) {
  // openHistory is a button's handler: it ignores a click right after a
  // swipe or a scroll
  if (v === 'history') await page.waitForTimeout(CLICK_GUARD)
  await page.evaluate((v) => {
    const vm = window.harness.vm
    if (v === 'history') vm.openHistory()
    else if (v === 'panel') vm.openPanel()
    else vm.show(v)
  }, v)
  await page.waitForTimeout(v === 'panel' ? CLICK_GUARD : 20)
}

// Six matches in the log, newest first: the one still on, then finished.
async function seedLog(page) {
  await page.evaluate(() => {
    const l = []
    for (let i = 0; i < 6; i++) l.push({ id: new Date(2026, 10, 25 - i, 18, 13).getTime(), end: 0, sets: [[6, 4], [3, 6], [7 - (i % 2), 6 - (i % 2) * 2]], w: i % 2 ? 'u' : 't' })
    l[0] = { id: l[0].id, end: 0, sets: [[6, 4], [2, 1]], w: null }
    localStorage.setItem('st:padel-band-log', JSON.stringify({ v: 1, l }))
  })
  await page.reload()
  await page.waitForFunction(() => window.__ready && window.__storageGets >= 3)
}

// Layout issues, leaving out the item that peeks past the bottom edge on
// purpose (the capsule hides its lower part, as on the band's own lists).
// Also returns how much of each item is on screen, in items.
async function panelLayout(page) {
  return page.evaluate(() => {
    const s = document.getElementById('screen').getBoundingClientRect()
    const items = Array.from(document.querySelectorAll('#screen .item, #screen .card'))
    const peek = items.filter((el) => { const r = el.getBoundingClientRect(); return r.top - s.top < 520 && r.bottom - s.top > 520 })
    peek.forEach((el) => { el.style.visibility = 'hidden' })
    // the score under the sheet is full-bleed (see the first test)
    const issues = window.harness.layoutIssues().filter((i) => !/^outside the capsule: (board|half-them|half-us) at/.test(i))
    peek.forEach((el) => { el.style.visibility = '' })
    // items on screen, counting the visible part of the peeking one; the
    // step is item plus gap
    const r = items.map((el) => el.getBoundingClientRect())
    const step = r.length > 1 ? r[1].top - r[0].top : 0
    const shown = r.length ? (520 - (r[0].top - s.top)) / step : 0
    return { issues, peek: peek.length, shown }
  })
}

test('every panel view fits the capsule, and lists peek past the edge', async () => {
  const page = await open(STATES['02-normal'][0])
  await seedLog(page)
  for (const [v, name] of [['panel', '09-panel'], ['panel-2', '09-panel-2'], ['more', '10-more'], ['history', '11-history'], ['confirm', '12-confirm']]) {
    if (v === 'panel-2') await scrollList(page, 1000)
    else await view(page, v)
    await page.waitForTimeout(20)
    const r = await panelLayout(page)
    assert.deepEqual(r.issues, [], v)
    if (v === 'panel' || v === 'history') {
      assert.equal(r.peek, 1, v + ': one item peeks')
      assert.ok(r.shown >= 2.6 && r.shown <= 2.9, v + ': ' + r.shown.toFixed(2) + ' items on screen')
    }
    await shot(page, name)
  }
  await page.close()
})

test('the panel has the time, and big buttons and type', async () => {
  const page = await open(STATES['02-normal'][0])
  await view(page, 'panel')
  assert.match(await page.evaluate(() => window.harness.text('clock')), /^\d\d:\d\d$/)
  assert.equal(await page.evaluate(() => window.harness.text('title')), 'Pádel')
  const st = await page.evaluate(() => Array.from(document.querySelectorAll('.circle, .item-label')).map((el) => {
    const r = el.getBoundingClientRect()
    return { cls: el.className, w: r.width, fs: parseFloat(getComputedStyle(el).fontSize) }
  }))
  for (const e of st) {
    if (/circle/.test(e.cls)) assert.ok(e.w >= 0.5 * 212, 'circle ' + e.w)
    else assert.equal(e.fs, 22, 'label')
  }
  await page.close()
})

test('the history is empty at first, and lists a match once it has a point', async () => {
  const page = await open('', false, 'u')
  await view(page, 'history')
  assert.equal(await page.evaluate(() => window.harness.text('h-empty')), 'Sin partidos todavía')
  await closePanel(page)
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(106, 427)
    await page.waitForTimeout(10)
  }
  await view(page, 'history')
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('.card')).map((c) => ({
    date: c.querySelector('.h-date').textContent,
    nums: Array.from(c.querySelectorAll('.num')).map((n) => n.textContent)
  })))
  assert.equal(cards.length, 1)
  assert.deepEqual(cards[0].nums, ['0', '1']) // their games over ours
  await page.close()
})

test('history cards copy the scoreboard: set winner bold, loser dimmed', async () => {
  const page = await open(STATES['02-normal'][0])
  await seedLog(page)
  await view(page, 'history')
  const second = await page.evaluate(() => Array.from(document.querySelectorAll('.card')[1].querySelectorAll('.num')).map((n) => n.textContent + ' ' + n.className))
  // 6-4 for us, 3-6 for them, 6-4 for us: we won
  assert.deepEqual(second, [
    '4 num h-num num-them-dim', '6 num h-num num-us num-won',
    '6 num h-num num-them num-won', '3 num h-num num-us-dim',
    '4 num h-num num-them-dim', '6 num h-num num-us num-won'
  ])
  await page.close()
})

test('lists scroll freely, and the indicator follows', async () => {
  const page = await open(STATES['02-normal'][0])
  await seedLog(page)
  await view(page, 'history')
  const bar = () => page.evaluate(() => window.harness.vm.sbar)
  assert.equal(await page.evaluate(() => document.querySelectorAll('.card').length), 6, 'every card drawn')
  assert.equal(await bar(), 'sp0')
  await scrollList(page, 80) // any offset, not a card at a time
  assert.equal(await page.evaluate(() => document.querySelector('#history').scrollTop), 80)
  assert.match(await bar(), /^sp[12]$/)
  await scrollList(page, 5000)
  assert.equal(await bar(), 'sp10')
  // the last card clears the handle
  const gap = await page.evaluate(() => {
    const cards = document.querySelectorAll('.card')
    return document.getElementById('grab').getBoundingClientRect().top - cards[cards.length - 1].getBoundingClientRect().bottom
  })
  assert.ok(gap >= 0, 'last card above the handle: ' + gap)
  // the panel resets to the top, and More has nothing to scroll
  await page.evaluate(() => window.harness.vm.show('panel'))
  await page.waitForTimeout(20)
  assert.equal(await page.evaluate(() => document.querySelector('#panel').scrollTop), 0)
  await page.evaluate(() => window.harness.vm.show('more'))
  await page.waitForTimeout(20)
  assert.equal(await bar(), '')
  await page.close()
})

test('the panel slides down on open and up on close', async () => {
  const page = await open(STATES['02-normal'][0])
  const st = () => page.evaluate(() => [window.harness.vm.view, window.harness.vm.sheetCls])
  await page.evaluate(() => window.harness.vm.openPanel())
  assert.deepEqual(await st(), ['panel', 'sheet-in'])
  // the score stays drawn underneath
  assert.ok(await page.evaluate(() => !!document.getElementById('pts-us')))
  await page.evaluate(() => window.harness.vm.show('more'))
  assert.deepEqual(await st(), ['more', 'sheet-in'], 'sub-views do not slide again')
  await page.evaluate(() => window.harness.vm.closePanel())
  assert.deepEqual(await st(), ['more', 'sheet-out'])
  await page.waitForTimeout(CLOSE)
  assert.deepEqual(await st(), ['score', ''])
  await page.close()
})

test('halves, board and points are centred', async () => {
  const page = await open(STATES['02-normal'][0])
  const b = await boxes(page, ['half-them', 'half-us', 'pts-them', 'pts-us'])
  assert.deepEqual([b['half-them'].y, b['half-them'].h], [0, 185])
  assert.deepEqual([b['half-us'].y, b['half-us'].h], [335, 185])
  near(b['pts-them'].cx, 106, 'them points x')
  near(b['pts-them'].cy, 99.5, 'them points y')
  near(b['pts-us'].cy, 420.5, 'us points y')
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

test('the pill sits just below the board and moves nothing', async () => {
  const plain = await open(STATES['02-normal'][0])
  const before = await boxes(plain, ['c0-them', 'pts-us'])
  await plain.close()
  for (const name of ['05-golden', '06-tiebreak']) {
    const page = await open(...STATES[name])
    const b = await boxes(page, ['pill', 'c0-them', 'pts-us'])
    assert.ok(b.pill, name + ': pill shown')
    near(b.pill.cy, 353, name + ': pill 5px below the board edge')
    near(b.pill.cx, 106, name + ': pill centred horizontally')
    near(b['c0-them'].cy, before['c0-them'].cy, name + ': board did not move')
    near(b['pts-us'].cy, before['pts-us'].cy, name + ': points did not move')
    // the board edge (y 320) stays visible, and the pill clears our points
    assert.ok(b.pill.y >= 337, name + ': pill clears the board edge')
    const ink = await page.evaluate(() => {
      const s = document.getElementById('screen').getBoundingClientRect()
      const r = document.createRange(); r.selectNodeContents(document.getElementById('pts-us'))
      return r.getBoundingClientRect().top - s.top
    })
    assert.ok(b.pill.y + b.pill.h <= ink, name + ': pill clears our points')
    await page.close()
  }
})

test('every big-points glyph uses one size and weight', async () => {
  for (const [name, args] of Object.entries(STATES)) {
    const page = await open(...args)
    const styles = await page.evaluate(() =>
      ['pts-them', 'pts-us'].map((id) => document.getElementById(id)).filter(Boolean)
        .map((el) => { const cs = getComputedStyle(el); return cs.fontSize + ' ' + cs.fontWeight })
    )
    for (const st of styles) assert.equal(st, '88px 700', name)
    await page.close()
  }
})

test("the loser's bar sits where the digits' centre is", async () => {
  for (const [name, id, cy] of [['07-win-us', 'lost-them', 99.5], ['08-win-them', 'lost-us', 420.5]]) {
    const page = await open(...STATES[name])
    const b = await page.evaluate((id) => {
      const s = document.getElementById('screen').getBoundingClientRect()
      const r = document.querySelector('#' + id + ' .lost-bar').getBoundingClientRect()
      return { cx: r.left - s.left + r.width / 2, cy: r.top - s.top + r.height / 2 }
    }, id)
    near(b.cx, 106, name + ' bar x')
    near(b.cy, cy, name + ' bar y')
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
  assert.deepEqual(await t('07-win-us', ['pts-us', 'label-us', 'pts-them']), { 'pts-us': 'WIN', 'label-us': 'GANAMOS', 'pts-them': null })
  assert.deepEqual(await t('08-win-them', ['pts-them', 'label-them']), { 'pts-them': 'WIN', 'label-them': 'GANAN' })
})

const tap = async (page, x, y) => {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(10)
}
const swipe = async (page, x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2)
  await page.mouse.move(x1, y1)
  await page.mouse.up()
  await page.waitForTimeout(10)
}
const viewOf = (page) => page.evaluate(() => window.harness.vm.view)

test('tap adds, swipe left subtracts, swipe right does nothing', async () => {
  const page = await open('')
  const pts = () => page.evaluate(() => [window.harness.text('pts-them'), window.harness.text('pts-us')])
  await tap(page, 106, 420)
  assert.deepEqual(await pts(), ['0', '15'])
  await tap(page, 106, 100)
  assert.deepEqual(await pts(), ['15', '15'])
  await swipe(page, 40, 100, 170, 100) // right: the system's back, not a point
  assert.deepEqual(await pts(), ['15', '15'])
  await swipe(page, 170, 420, 40, 420)
  assert.deepEqual(await pts(), ['15', '0'])
  // nothing of ours left: the swipe rewinds their last point
  await swipe(page, 170, 420, 40, 420)
  assert.deepEqual(await pts(), ['0', '0'])
  const vib = await page.evaluate(() => window.__vibrations)
  assert.deepEqual(vib, ['short', 'short', 'short', 'short'])
  await page.close()
})

test('swiping left on one half rewinds a finished set and a won match', async () => {
  const page = await open(STATES['07-win-us'][0])
  const h = () => page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-state')).h.length)
  const n = await h()
  await swipe(page, 170, 100, 40, 100) // the loser's half
  assert.equal(await h(), n - 1)
  assert.equal(await page.evaluate(() => window.harness.text('pts-them')), '0') // match back on, set 3 at 6-5
  for (let i = 0; i < 6; i++) await swipe(page, 170, 100, 40, 100)
  assert.equal(await h(), n - 7)
  await page.close()
})

test('swipe down opens the panel, up from the handle closes it', async () => {
  const page = await open(STATES['02-normal'][0])
  const before = await page.evaluate(() => [window.harness.text('pts-them'), window.harness.text('pts-us')])
  await swipe(page, 106, 30, 106, 160)
  assert.equal(await viewOf(page), 'panel')
  await swipe(page, 106, 505, 106, 380) // up from the handle closes
  await page.waitForTimeout(CLOSE)
  assert.equal(await viewOf(page), 'score')
  await swipe(page, 106, 360, 106, 470) // from our half too
  assert.equal(await viewOf(page), 'panel')
  await page.evaluate(() => window.harness.vm.show('history'))
  await page.waitForTimeout(20)
  await swipe(page, 106, 505, 106, 380) // and from every panel view
  await page.waitForTimeout(CLOSE)
  assert.equal(await viewOf(page), 'score')
  const after = await page.evaluate(() => [window.harness.text('pts-them'), window.harness.text('pts-us')])
  assert.deepEqual(after, before, 'no point changed')
  await page.close()
})

test('the who-serves screen opens the panel too, without choosing', async () => {
  const page = await open('', false, null)
  await swipe(page, 106, 30, 106, 160)
  assert.equal(await viewOf(page), 'panel')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-state')))
  assert.equal(saved.f, null)
  await page.close()
})

test('the history marks the match in play with the scoreboard tile, no text', async () => {
  const page = await open('', false, 'u')
  await page.mouse.click(106, 427)
  await page.waitForTimeout(20)
  await view(page, 'history')
  const c = await page.evaluate(() => {
    const card = document.querySelector('.card')
    const s = document.getElementById('screen').getBoundingClientRect()
    const d = card.querySelector('.h-date').getBoundingClientRect()
    const b = card.querySelector('.h-col').getBoundingClientRect()
    return { date: card.querySelector('.h-date').textContent, tile: card.querySelector('.h-col').className, gap: b.top - d.bottom }
  })
  assert.match(c.date, /^\d\d\/\d\d · \d\d:\d\d$/)
  assert.match(c.tile, /h-cur/)
  assert.ok(c.gap >= 9, 'gap ' + c.gap)
  await page.close()
})

test('back goes up a level, and exits from the score', async () => {
  const page = await open(STATES['02-normal'][0])
  const back = () => page.evaluate(() => window.harness.vm.onBackPress())
  await view(page, 'panel')
  await page.click('#p-more')
  await page.waitForTimeout(20)
  assert.equal(await viewOf(page), 'more')
  assert.equal(await back(), true)
  await page.waitForTimeout(20)
  assert.equal(await viewOf(page), 'panel')
  await back()
  await page.waitForTimeout(CLOSE)
  assert.equal(await viewOf(page), 'score')
  assert.equal(await page.evaluate(() => !!window.__terminated), false)
  await back()
  assert.equal(await page.evaluate(() => !!window.__terminated), true)
  await page.close()
})

test('more cycles the deuce rule and toggles keep screen on', async () => {
  const page = await open('', 'adv', 'u')
  await view(page, 'more')
  const deuce = () => page.evaluate(() => [window.harness.text('m-deuce-value'), JSON.parse(localStorage.getItem('st:padel-band-state') || '{}').d])
  const screenOn = () => page.evaluate(() => document.getElementById('m-screen-tg').classList.contains('tg-on'))
  assert.equal((await deuce())[0], 'Ventaja')
  assert.equal(await screenOn(), true)
  for (const [name, d] of [['Punto de oro', 'gold'], ['Star Point', 'star'], ['Ventaja', 'adv']]) {
    await page.click('#m-deuce')
    await page.waitForTimeout(20)
    assert.deepEqual(await deuce(), [name, d])
  }
  await page.click('#m-screen')
  await page.waitForTimeout(20)
  assert.equal(await screenOn(), false)
  assert.equal(await page.evaluate(() => window.__keepScreenOn), false)
  await page.close()
})

test('Star Point: advantage twice, then the pill at the third deuce', async () => {
  const page = await open(set('u', 't', 2, 1) + 'uuuttt', 'star')
  const t = () => page.evaluate(() => [window.harness.text('pts-them'), window.harness.text('pts-us'), window.harness.text('pill')])
  assert.deepEqual(await t(), ['40', '40', null])
  await tap(page, 106, 420)
  assert.deepEqual(await t(), ['40', 'AD', null])
  await tap(page, 106, 100)
  await tap(page, 106, 100)
  assert.deepEqual(await t(), ['AD', '40', null])
  await tap(page, 106, 420)
  assert.deepEqual(await t(), ['40', '40', 'STAR POINT'])
  await tap(page, 106, 420)
  assert.deepEqual((await t()).slice(0, 2), ['0', '0'], 'the Star Point wins the game')
  await page.close()
})

test('undoing the point that closed a set clears its marks (bar, bold, tile)', async () => {
  // Them 6-0 up after the set's last point; a swipe left on their half
  // takes it back to 5-0 in the set in play. On the band a removed class
  // kept its look (the harness mimics that), so the bar stayed.
  const page = await open(set('t', 'u', 6, 0), 'adv', 'u')
  const marks = () => page.evaluate(() => {
    const n = document.getElementById('c0-them')
    const col = document.getElementById('col0')
    return {
      text: n.textContent,
      bold: getComputedStyle(n).fontWeight,
      bars: Array.from(col.querySelectorAll('.bar')).filter((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)').length,
      tile: getComputedStyle(col).backgroundColor,
      cur: col.className.includes('col-cur')
    }
  })
  const done = await marks()
  assert.deepEqual([done.text, done.bold, done.bars, done.cur], ['6', '700', 1, false], 'a won set: bold, with its bar')
  const board = done.tile
  await swipe(page, 170, 100, 40, 100)
  await page.waitForTimeout(20)
  const back = await marks()
  assert.deepEqual([back.text, back.bold, back.bars, back.cur], ['5', '400', 0, true], 'back in play: plain, no bar')
  assert.equal(back.tile, 'rgb(46, 46, 46)', 'on the grey tile')
  // And forward again: the finished set leaves the tile.
  await page.mouse.click(106, 92)
  await page.waitForTimeout(20)
  const again = await marks()
  assert.deepEqual([again.text, again.bars, again.tile], ['6', 1, board])
  await page.close()
})

// --- serve -----------------------------------------------------------------

test('a new match asks who serves, and a tap chooses', async () => {
  for (const [y, first] of [[92, 't'], [427, 'u']]) {
    const page = await open('', false, null)
    assert.ok(await page.evaluate(() => !!document.getElementById('ask-them')), 'ask screen shown')
    const issues = await page.evaluate(() => window.harness.layoutIssues())
    assert.deepEqual(issues.filter((i) => !/^outside the capsule: (board|ask-them|ask-us)/.test(i)), [])
    if (first === 't') await shot(page, '00-ask')
    const balls = await page.evaluate(() => ['ask-them', 'ask-us'].map((id) => document.getElementById(id).querySelectorAll('img').length)
      .concat(document.querySelectorAll('.board-ask img').length))
    assert.deepEqual(balls, [0, 0, 1], 'the ball heads the question; the answers are text only')
    await page.mouse.click(106, y)
    await page.waitForTimeout(20)
    assert.equal(await page.evaluate(() => !!document.getElementById('ask-them')), false, 'score view after choosing')
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-state')))
    assert.equal(saved.f, first)
    await page.close()
  }
})

test('the serve cue sits exactly on a corner of the current-set tile', async () => {
  const cases = [
    // [history, first, expected corner]
    ['', 'u', 'br'],
    ['', 't', 'tl'],
    ['t', 'u', 'bl'],
    ['u', 't', 'tr'],
    [set('u', 't', 6, 4) + set('t', 'u', 3, 2), 'u', 'tl'], // 15 games: they serve, 0 points
    [STATES['06-tiebreak'][0], 'u', null], // checked separately below
  ]
  for (const [h, first, want] of cases) {
    const page = await open(h, false, first)
    const r = await page.evaluate(() => {
      const s = document.getElementById('screen').getBoundingClientRect()
      const cue = document.getElementById('serve-cue')
      const tiles = Array.from(document.querySelectorAll('.col-cur'))
      const rel = (el) => { const b = el.getBoundingClientRect(); return { x: b.left - s.left, y: b.top - s.top, r: b.right - s.left, b: b.bottom - s.top } }
      return { cue: cue && rel(cue), cls: cue && cue.className, tile: tiles.length === 1 ? rel(tiles[0]) : null }
    })
    assert.ok(r.cue && r.tile, 'cue and tile present')
    const corner = r.cls.match(/cn\d-(\w\w)/)[1]
    if (want) assert.equal(corner, want, `history ${h.length} pts, first ${first}`)
    // the bracket must sit flush in that corner of the tile
    near(corner[1] === 'l' ? r.cue.x : r.cue.r, corner[1] === 'l' ? r.tile.x : r.tile.r, 'cue x flush')
    near(corner[0] === 't' ? r.cue.y : r.cue.b, corner[0] === 't' ? r.tile.y : r.tile.b, 'cue y flush')
    await page.close()
  }
})

test('the cue is flush with the tile with 1, 2 and 3 sets on the board', async () => {
  const boards = [
    '', // 1 column
    set('u', 't', 6, 4), // 2 columns
    set('u', 't', 6, 4) + set('t', 'u', 6, 3), // 3 columns
  ]
  for (const h of boards) {
    for (const [pts, first] of [['', 'u'], ['t', 'u'], ['', 't'], ['u', 't']]) {
      // shift who serves the current game so all four corners show up
      const page = await open(h + pts, false, first)
      const r = await page.evaluate(() => {
        const s = document.getElementById('screen').getBoundingClientRect()
        const rel = (el) => { const b = el.getBoundingClientRect(); return { x: b.left - s.left, y: b.top - s.top, r: b.right - s.left, b: b.bottom - s.top } }
        const cue = document.getElementById('serve-cue')
        return { cue: rel(cue), cls: cue.className, tile: rel(document.querySelector('.col-cur')) }
      })
      const c = r.cls.match(/cn\d-(\w\w)/)[1]
      near(c[1] === 'l' ? r.cue.x : r.cue.r, c[1] === 'l' ? r.tile.x : r.tile.r, `${h.length}/${pts}/${first} x`)
      near(c[0] === 't' ? r.cue.y : r.cue.b, c[0] === 't' ? r.tile.y : r.tile.b, `${h.length}/${pts}/${first} y`)
      await page.close()
    }
  }
})

test('no serve cue once the match is over', async () => {
  const page = await open(STATES['07-win-us'][0])
  assert.equal(await page.evaluate(() => !!document.getElementById('serve-cue')), false)
  await page.close()
})

test('the cue is a bold bracket in the server\'s colour that turns the corner with the tile', async () => {
  for (const [first, pts, want] of [['u', '', 'br'], ['t', '', 'tl'], ['u', 't', 'bl'], ['t', 'u', 'tr']]) {
    const page = await open(pts, 'adv', first)
    const r = await page.evaluate(() => {
      const el = document.getElementById('serve-cue')
      const b = el.getBoundingClientRect()
      const f = el.firstElementChild
      const k = f.getBoundingClientRect()
      const cs = getComputedStyle(f)
      const tile = getComputedStyle(document.querySelector('.col-cur'))
      return { box: [b.width, b.height], cls: el.className, clip: getComputedStyle(el).overflow, kids: el.children.length,
        img: el.querySelectorAll('img').length, frame: [k.left - b.left, k.top - b.top, k.width, k.height],
        border: [cs.borderTopWidth, cs.borderLeftWidth, cs.borderTopColor, cs.borderTopLeftRadius, cs.backgroundColor],
        tileRadius: tile.borderTopLeftRadius }
    })
    assert.deepEqual(r.box, [24, 24])
    assert.match(r.cls, new RegExp('-' + want + '\\b'))
    assert.deepEqual([r.kids, r.img], [1, 0], 'one frame, no image')
    // One corner of a 48x48 lime frame shows; the rest is clipped away.
    assert.equal(r.clip, 'hidden')
    assert.deepEqual(r.frame, [want[1] === 'l' ? 0 : -24, want[0] === 't' ? 0 : -24, 48, 48], want + ' frame')
    const team = want[0] === 't' ? 'rgb(251, 133, 0)' : 'rgb(142, 202, 230)' // top corners are theirs
    assert.deepEqual(r.border, ['6px', '6px', team, r.tileRadius, 'rgba(0, 0, 0, 0)'], 'bold, in the server\'s colour, rounded like the tile, hollow')
    await page.close()
  }
})

const cueCorner = (page) => page.evaluate(() => document.getElementById('serve-cue').className.match(/cn\d-(\w\w)/)[1])

test('the panel button switches who serves, and the cue follows', async () => {
  const page = await open('', false, 'u')
  const label = () => page.evaluate(() => window.harness.text('p-serve-label'))
  // The team's colour fills the button; the icon is white for both.
  const look = () => page.evaluate(() => {
    const c = document.getElementById('p-serve-circle')
    return [getComputedStyle(c).backgroundColor, c.querySelector('img').getAttribute('src').split('/').pop()]
  })
  assert.equal(await cueCorner(page), 'br')
  await view(page, 'panel')
  assert.equal(await label(), 'Sacamos')
  assert.deepEqual(await look(), ['rgb(33, 158, 188)', 'icon-serve.png'])
  await page.click('#p-serve')
  await page.waitForTimeout(20)
  assert.equal(await label(), 'Sacan')
  assert.deepEqual(await look(), ['rgb(251, 133, 0)', 'icon-serve.png'])
  await shot(page, '09-panel-them')
  await closePanel(page)
  assert.equal(await cueCorner(page), 'tl')
  await page.close()
})

test('the serve button names who serves now, not who served first', async () => {
  const page = await open(g('u'), false, 'u') // game 2: they serve
  await view(page, 'panel')
  assert.equal(await page.evaluate(() => window.harness.text('p-serve-label')), 'Sacan')
  await page.close()
})

test('a new match asks first, and cancelling keeps the score', async () => {
  const page = await open(STATES['02-normal'][0])
  const usPts = () => page.evaluate(() => window.harness.text('pts-us'))
  const before = await usPts()
  await view(page, 'panel')
  await page.click('#p-new')
  await page.waitForTimeout(20)
  assert.equal(await viewOf(page), 'confirm')
  // One button (confirm), and a bare cross centred under it to cancel.
  const d = await page.evaluate(() => {
    const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { cx: r.left + r.width / 2, top: r.top, bottom: r.bottom } }
    return { yes: box('c-yes'), no: box('c-no'), noBg: getComputedStyle(document.getElementById('c-no')).backgroundColor,
      img: document.querySelector('#c-no img').getAttribute('src').split('/').pop() }
  })
  assert.deepEqual([d.yes.cx, d.no.cx], [106, 106], 'both centred')
  assert.ok(d.no.top >= d.yes.bottom, 'the cross is under the button')
  assert.deepEqual([d.noBg, d.img], ['rgba(0, 0, 0, 0)', 'icon-close.png'], 'no button behind the cross')
  await page.click('#c-no')
  await page.waitForTimeout(20)
  assert.equal(await viewOf(page), 'panel', 'back on the panel')
  await closePanel(page)
  assert.equal(await usPts(), before)
  await page.close()
})

test('confirming a new match goes to who serves, with no tap-through', async () => {
  const page = await open(STATES['02-normal'][0])
  await view(page, 'panel')
  await page.click('#p-new')
  await page.waitForTimeout(20)
  await page.click('#c-yes')
  await page.waitForTimeout(CLOSE)
  assert.ok(await page.evaluate(() => !!document.getElementById('ask-us')), 'who serves')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-state')))
  assert.deepEqual([saved.h, saved.f], ['', null], 'nothing chosen by the same tap')
  await page.close()
})

test('the previous match stays in the history, no longer in play', async () => {
  const page = await open('', false, 'u')
  await page.mouse.click(106, 420) // its first point gives it a place in the log
  await page.waitForTimeout(20)
  await view(page, 'panel')
  await page.waitForTimeout(CLICK_GUARD)
  await page.click('#p-new')
  await page.waitForTimeout(20)
  await page.click('#c-yes')
  await page.waitForTimeout(CLOSE)
  await page.mouse.click(106, 420) // who serves: us
  await page.waitForTimeout(20)
  await page.mouse.click(106, 100) // the new match's first point
  await page.waitForTimeout(20)
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-log')).l)
  assert.equal(log.length, 2)
  assert.deepEqual(log.map((e) => e.sets), [[[0, 0]], [[0, 0]]])
  await view(page, 'history')
  const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('.card')).map((c) => !!c.querySelector('.h-cur')))
  assert.deepEqual(tiles, [true, false], 'only the match in play has the tile')
  await page.close()
})

test('six type sizes, no more', async () => {
  const sizes = new Set()
  const collect = async (page) => {
    for (const f of await page.evaluate(() => Array.from(document.querySelectorAll('#screen span')).filter((e) => e.textContent).map((e) => getComputedStyle(e).fontSize))) sizes.add(f)
  }
  for (const args of [STATES['03-ad-us'], STATES['05-golden'], STATES['05-star'], ['', false, null]]) {
    const page = await open(...args)
    await collect(page)
    await page.close()
  }
  const page = await open(STATES['02-normal'][0])
  for (const v of ['panel', 'more', 'history', 'confirm']) { await view(page, v); await collect(page) }
  await page.close()
  assert.deepEqual([...sizes].map(parseFloat).sort((a, b) => a - b), [20, 22, 24, 36, 48, 88])
})

const LANGS = ['es', 'en', 'fr', 'de', 'it']

test('every language fits: each state, the who-serves screen and every panel view', async () => {
  const FULL_BLEED = /^outside the capsule: (board|board board-ask|half-them|half-us|ask-them|ask-us) at/
  fs.mkdirSync(path.join(SHOTS, 'lang'), { recursive: true })
  const all = [] // every issue in every language, to see them all at once
  for (const lang of LANGS) {
    const states = { ...STATES, '00-ask': ['', 'adv', null] }
    for (const [name, [h, d = 'adv', f = 'u']] of Object.entries(states)) {
      const page = await open(h, d, f, lang)
      const issues = (await page.evaluate(() => window.harness.layoutIssues())).filter((i) => !FULL_BLEED.test(i))
      for (const i of issues) all.push(lang + ' ' + name + ': ' + i)
      await shot(page, 'lang/' + lang + '-' + name)
      await page.close()
    }
    // Both serve labels, an empty history and a full one.
    for (const [first, seed] of [['u', false], ['t', true]]) {
      const page = await open(STATES['02-normal'][0], 'gold', first, lang)
      if (seed) await seedLog(page)
      for (const v of ['panel', 'more', 'history', 'confirm']) {
        await view(page, v)
        const r = await panelLayout(page)
        for (const i of r.issues) all.push(lang + ' ' + v + ': ' + i)
        await shot(page, 'lang/' + lang + '-' + v + (seed ? '-2' : ''))
      }
      await page.close()
    }
  }
  assert.deepEqual(all, [])
})

test('more cycles the language, and every text follows', async () => {
  const page = await open(set('u', 't', 6, 4) + 'uuuttt' + 'u', 'adv')
  await view(page, 'more')
  const state = () => page.evaluate(() => ({
    value: window.harness.text('m-lang-value'),
    label: window.harness.text('m-lang-label'),
    title: window.harness.text('title'),
    deuce: window.harness.text('m-deuce-value'),
    adv: window.harness.text('label-us'),
    saved: JSON.parse(localStorage.getItem('st:padel-band-prefs') || '{}').lang
  }))
  assert.deepEqual(await state(), { value: 'Español', label: 'Idioma', title: 'Más', deuce: 'Ventaja', adv: 'VENTAJA', saved: undefined })
  const want = [
    ['English', 'Language', 'More', 'Advantage', 'ADV', 'en'],
    ['Français', 'Langue', 'Plus', 'Avantage', 'AVANTAGE', 'fr'],
    ['Deutsch', 'Sprache', 'Mehr', 'Vorteil', 'VORTEIL', 'de'],
    ['Italiano', 'Lingua', 'Altro', 'Vantaggi', 'VANT.', 'it'],
    ['Español', 'Idioma', 'Más', 'Ventaja', 'VENTAJA', 'es']
  ]
  for (const [value, label, title, deuce, adv, saved] of want) {
    await page.click('#m-lang')
    await page.waitForTimeout(20)
    assert.deepEqual(await state(), { value, label, title, deuce, adv, saved })
  }
  await page.close()
})

test('the language survives a restart, and the screen toggle keeps it', async () => {
  const page = await open('', 'adv', null, 'de')
  assert.equal(await page.evaluate(() => window.harness.text('ask-title')), 'Wer schlägt auf?')
  await view(page, 'more')
  await page.click('#m-screen')
  await page.waitForTimeout(20)
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('st:padel-band-prefs')))
  assert.deepEqual(await prefs(), { keepOn: false, lang: 'de' })
  await page.click('#m-lang')
  await page.waitForTimeout(20)
  assert.deepEqual(await prefs(), { keepOn: false, lang: 'it' }, 'the language keeps keep-screen-on')
  await page.reload()
  await page.waitForFunction(() => window.__ready && window.__storageGets >= 2)
  await page.waitForTimeout(30)
  assert.equal(await page.evaluate(() => window.harness.text('ask-title')), 'Chi serve?')
  assert.equal(await page.evaluate(() => window.__keepScreenOn), false)
  await page.close()
})

