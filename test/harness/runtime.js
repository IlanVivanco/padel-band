// A minimal stand-in for the Vela JS runtime, for testing in Chromium.
// Adapted from Calc+ by Ari Wilson (MIT): https://github.com/arimwilson/calcplus
//
// It loads the *compiled* bundle from build/ (the same JS that goes into the
// .rpk), implements the three template builtins the compiler emits
// (aiot.__ce__ element, __ci__ if, __cf__ for), turns the compiled style table
// into CSS, and stubs the system modules the app imports. Re-renders patch the
// DOM in place, as the band's runtime keeps its nodes, so a key that re-renders
// on touchstart still receives the click. Layout is Chromium's flexbox, not
// the band's renderer, so pixel-exact results can differ on the device;
// logic, bindings and events are the real code.

const SCREEN_W = 212
const SCREEN_H = 520
// The panel is a capsule: corner radius 106 (half the width). Everything drawn
// must stay inside a 103 px radius in the top and bottom 106 px, and 8 px from
// the sides elsewhere.
const CAP_R = 106
const SAFE_R = 103
const SIDE_MARGIN = 8

window.__errors = []
window.__storageGets = 0

const systemModules = {
  'system.storage': {
    get(o) {
      // Async like the device.
      setTimeout(() => {
        const v = localStorage.getItem('st:' + o.key)
        o.success && o.success(v === null ? o.default : v)
        window.__storageGets++
      }, 0)
    },
    set(o) {
      localStorage.setItem('st:' + o.key, o.value)
      o.success && setTimeout(o.success, 0)
    }
  },
  'system.vibrator': { vibrate(o) { window.__vibrations = (window.__vibrations || []).concat([o && o.mode]) } },
  'system.brightness': { setKeepScreenOn(o) { window.__keepScreenOn = o.keepScreenOn; o.success && o.success() } },
  'system.app': { terminate() { window.__terminated = true } }
}

window.$app_require$ = function (name) {
  const m = name.replace('@app-module/', '')
  if (!systemModules[m]) throw new Error('harness: no stub for ' + name)
  return systemModules[m]
}

window.aiot = {
  __ce__: (type, o, children) => ({ k: 'el', type, opts: (o && o.__opts__) || {}, children: children || [] }),
  __ci__: (o, fn) => ({ k: 'if', opts: o.__opts__, fn }),
  __cf__: (o, fn) => ({ k: 'for', opts: o.__opts__, fn })
}

async function loadBundle(url, exportsObj) {
  const src = await (await fetch(url, { cache: 'no-store' })).text()
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
  mod.default(globalThis, globalThis, window, exportsObj, null)
}

function kebab(s) {
  return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

function keyframesCss(name, json) {
  const frames = JSON.parse(json)
    .map((f) => {
      const { time, transform, ...rest } = f
      let body = Object.entries(rest).map(([k, v]) => kebab(k) + ':' + v)
      if (transform) body.push('transform:' + Object.entries(transform).map(([k, v]) => k + '(' + v + ')').join(' '))
      return time + '%{' + body.join(';') + '}'
    })
    .join('')
  return '@keyframes ' + name + '{' + frames + '}'
}

// The properties each class sets (single-class rules only), to mimic a Vela
// quirk: a property set by a class stays after the class is removed, unless
// another class still on the element sets it. See update().
const classProps = {}

function styleTableToCss(table) {
  for (const [parts, decls] of table) {
    if (parts.length === 1 && parts[0][0] === 0) {
      const set = (classProps[parts[0][1]] = classProps[parts[0][1]] || new Set())
      for (const k of Object.keys(decls)) set.add(kebab(k))
    }
  }
  return table
    .map(([parts, decls]) => {
      // kind 3: @keyframes, with its frames as JSON
      if (parts.length === 1 && parts[0][0] === 3) return keyframesCss(parts[0][1], decls.keyframes)
      // parts: a descendant chain of [kind, name]; kind 0 is a class.
      const sel = parts
        .map(([kind, name]) => {
          if (kind !== 0) throw new Error('harness: unsupported selector kind ' + kind)
          return '.' + name
        })
        .join(' ')
      const body = Object.entries(decls)
        .map(([k, v]) => kebab(k) + ':' + v)
        .join(';')
      return '#screen ' + sel + '{' + body + '}'
    })
    .join('\n')
}

const val = (x) => (typeof x === 'function' ? x() : x)

// Vela touch events, driven by the mouse in Chromium. Order matches a tap on
// the band: touchstart, touchend, click.
const EVENT_MAP = { touchstart: 'pointerdown', touchmove: 'pointermove', touchend: 'pointerup', touchcancel: 'pointercancel', click: 'click', longpress: null, scroll: 'scroll' }
// <scroll> is a div that scrolls natively (see the scroll CSS in index.html).
const TAGS = { div: 'div', text: 'span', image: 'img', scroll: 'div' }

// Expand if/for into a flat list of element vnodes.
function expand(node, out) {
  if (Array.isArray(node)) {
    node.forEach((n) => expand(n, out))
  } else if (node.k === 'if') {
    if (val(node.opts.shown)) expand(node.fn(), out)
  } else if (node.k === 'for') {
    ;(val(node.opts.exp) || []).forEach((item, i) => expand(node.fn(i, item), out))
  } else {
    out.push(node)
  }
  return out
}

function create(v) {
  if (!TAGS[v.type]) throw new Error('harness: unsupported element ' + v.type)
  const el = document.createElement(TAGS[v.type])
  el.dataset.type = v.type
  el.__handlers = {}
  el.__bound = new Set()
  update(el, v)
  return el
}

// Registers a DOM listener for each Vela event the element has. Called on
// every update: the diff can reuse an element for a node with other events
// (e.g. a view swapped by `if`), so new event types must be bound then too.
function bindEvents(el, events) {
  for (const ev of Object.keys(events || {})) {
    if (!(ev in EVENT_MAP)) throw new Error('harness: unsupported event ' + ev)
    const domEv = EVENT_MAP[ev]
    if (!domEv || el.__bound.has(ev)) continue
    el.__bound.add(ev)
    el.addEventListener(domEv, (e) => {
      const fn = el.__handlers[ev]
      if (!fn) return
      // Vela's scroll event carries the offsets.
      if (ev === 'scroll') e = { scrollX: el.scrollLeft, scrollY: el.scrollTop }
      // Vela touch events carry touches / changedTouches lists.
      if (ev.startsWith('touch')) {
        const pt = { identifier: 0, clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY }
        const lifted = ev === 'touchend' || ev === 'touchcancel'
        e = { touches: lifted ? [] : [pt], changedTouches: [pt] }
      }
      try {
        fn(e)
      } catch (err) {
        window.__errors.push(String(err && err.stack ? err.stack : err))
      }
    })
  }
}


function update(el, v) {
  const o = v.opts
  const id = o.id ? val(o.id) : ''
  if (el.id !== id) {
    el.id = id
    // A reused scroller showing another list starts at its top, as the
    // band builds it afresh.
    if (v.type === 'scroll') el.scrollTop = 0
  }
  const cls = val(o.classList)
  const className = cls ? (Array.isArray(cls) ? cls : String(cls).split(' ')).filter(Boolean).join(' ') : ''
  // The same template node keeps what its removed classes set (Vela's
  // quirk); a node reused for another template node starts clean.
  // (Identified by its type, id and class binding: vnodes are rebuilt on
  // each render.)
  const tpl = v.type + '|' + String(o.id) + '|' + String(o.classList)
  const same = el.__tpl === tpl
  if (!same) el.__sticky = {}
  el.__tpl = tpl
  if (same && el.className !== className) {
    const now = className.split(' ')
    const kept = new Set(now.flatMap((c) => Array.from(classProps[c] || [])))
    const old = getComputedStyle(el)
    for (const c of el.className.split(' ').filter((c) => c && !now.includes(c))) {
      for (const k of classProps[c] || []) if (!kept.has(k)) el.__sticky[k] = old.getPropertyValue(k)
    }
    for (const k of kept) delete el.__sticky[k]
  }
  if (el.className !== className) el.className = className
  el.removeAttribute('style')
  for (const [k, s] of Object.entries(el.__sticky)) el.style.setProperty(k, s)
  const st = val(o.style)
  if (st) for (const [k, s] of Object.entries(st)) el.style[k] = s
  if (v.type === 'scroll') {
    const y = val(o.scrollY)
    el.style.overflowY = y === 'true' || y === true ? 'auto' : 'hidden'
  }
  if (v.type === 'image') {
    // Absolute app paths resolve against the package root, which is build/.
    const src = '/build' + val(o.src)
    if (el.getAttribute('src') !== src) el.setAttribute('src', src)
  }
  // A text with no content compiles without a value. It still has to clear
  // a reused node's old text (the band builds each view's nodes afresh).
  if (v.type === 'text' || o.value !== undefined) {
    const text = o.value === undefined ? '' : String(val(o.value))
    if (el.textContent !== text) el.textContent = text
  }
  el.__handlers = Object.assign({}, o.events || {})
  bindEvents(el, o.events)
  patchChildren(el, expand(v.children, []))
}

function patchChildren(parent, vnodes) {
  const olds = Array.from(parent.children)
  vnodes.forEach((v, i) => {
    const old = olds[i]
    if (old && old.dataset.type === v.type) update(old, v)
    else if (old) parent.replaceChild(create(v), old)
    else parent.appendChild(create(v))
  })
  for (let i = vnodes.length; i < olds.length; i++) olds[i].remove()
}

// ---------- layout checks ----------

function capsuleOk(x, y) {
  const e = 0.01
  if (x < SIDE_MARGIN - e || x > SCREEN_W - SIDE_MARGIN + e) return false
  if (y < CAP_R) return Math.hypot(x - SCREEN_W / 2, y - CAP_R) <= SAFE_R + e
  if (y > SCREEN_H - CAP_R) return Math.hypot(x - SCREEN_W / 2, y - (SCREEN_H - CAP_R)) <= SAFE_R + e
  return true
}

// Points on the outline of an element's rounded rectangle.
function outline(r, cs) {
  const pts = []
  const lim = Math.min(r.width, r.height) / 2
  const rad = (p) => Math.min(parseFloat(cs[p]) || 0, lim)
  const tl = rad('borderTopLeftRadius')
  const tr = rad('borderTopRightRadius')
  const br = rad('borderBottomRightRadius')
  const bl = rad('borderBottomLeftRadius')
  const corners = [
    [tl, r.left, r.top, -1, -1],
    [tr, r.right, r.top, 1, -1],
    [br, r.right, r.bottom, 1, 1],
    [bl, r.left, r.bottom, -1, 1]
  ]
  for (const [R, x, y, sx, sy] of corners) {
    const cx = x - sx * R
    const cy = y - sy * R
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2)
      pts.push([cx + sx * R * Math.cos(a), cy + sy * R * Math.sin(a)])
    }
  }
  // Straight edges, between the corner arcs.
  const edge = (x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2))
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  }
  edge(r.left + tl, r.top, r.right - tr, r.top)
  edge(r.left + bl, r.bottom, r.right - br, r.bottom)
  edge(r.left, r.top + tl, r.left, r.bottom - bl)
  edge(r.right, r.top + tr, r.right, r.bottom - br)
  return pts
}

function label(el) {
  const name = el.id || el.className || el.tagName
  return name + (el.dataset.type === 'text' ? ' "' + el.textContent + '"' : '')
}

// Report anything that would be off-screen, spill out of its parent, overflow
// its own box, or reach into the capsule's rounded corners.
function layoutIssues() {
  const screen = document.getElementById('screen')
  const issues = []
  const s = screen.getBoundingClientRect()
  for (const el of screen.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    // Inside a scrolling list only what's wholly in view is checked: the
    // rest is clipped by the list (scrolled away, or the peeking item).
    const sc = el.parentElement && el.parentElement.closest('[data-type="scroll"]')
    if (sc && sc !== el) {
      const v = sc.getBoundingClientRect()
      if (r.top < v.top - 0.5 || r.bottom > v.bottom + 0.5) continue
    }
    const tag = label(el)
    if (r.left < s.left - 0.5 || r.top < s.top - 0.5 || r.right > s.right + 0.5 || r.bottom > s.bottom + 0.5) {
      issues.push('off-screen: ' + tag + ' ' + JSON.stringify([r.left - s.left, r.top - s.top, r.right - s.left, r.bottom - s.top]))
    }
    const p = el.parentElement
    // A parent that clips (overflow: hidden) cuts what spills, on purpose.
    if (p && p !== screen && getComputedStyle(p).overflow !== 'hidden') {
      const pr = p.getBoundingClientRect()
      if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) {
        issues.push('spills out of parent: ' + tag)
      }
    }
    if (el.dataset.type === 'text' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      issues.push('text overflows its box: ' + tag)
    }
    // Capsule corners: the outline of anything with a background, the box of
    // images, and the line boxes of text glyphs (a Range rect, which is the
    // font's full ascent/descent, so a little conservative).
    const local = (pts) => pts.map(([x, y]) => [x - s.left, y - s.top])
    let pts = []
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    // Black on the black panel draws nothing.
    const drawn = bg && bg !== 'transparent' && bg !== 'rgb(0, 0, 0)' && !/rgba\(.*,\s*0\)$/.test(bg)
    if (drawn) pts = pts.concat(local(outline(r, cs)))
    if (el.dataset.type === 'image') pts = pts.concat(local(outline(r, { })))
    if (el.dataset.type === 'text' && el.firstChild) {
      const range = document.createRange()
      range.selectNodeContents(el)
      for (const g of range.getClientRects()) {
        pts = pts.concat(local([[g.left, g.top], [g.right, g.top], [g.left, g.bottom], [g.right, g.bottom]]))
      }
    }
    const bad = pts.find(([x, y]) => !capsuleOk(x, y))
    if (bad) issues.push('outside the capsule: ' + tag + ' at ' + JSON.stringify(bad.map((n) => Math.round(n * 10) / 10)))
  }
  return issues
}

async function boot() {
  const appExp = {}
  await loadBundle('/build/app.js', appExp)
  const pageExp = {}
  await loadBundle('/build/pages/index/index.js', pageExp)
  pageExp.entry(pageExp)
  const def = pageExp.default

  const css = document.createElement('style')
  css.textContent = styleTableToCss(def.style)
  // ?noanim (the UI tests): animations off, so state shows at once.
  if (new URLSearchParams(location.search).has('noanim')) css.textContent += '\n#screen *{animation:none !important}'
  document.head.appendChild(css)

  const screen = document.getElementById('screen')
  // Touch semantics: every event of a touch goes to the element it started
  // on, wherever the finger lifts (a mouse sends pointerup to whatever is
  // under it).
  screen.addEventListener('pointerdown', (e) => {
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId)
  }, true)
  const data = JSON.parse(JSON.stringify(def.data))
  const vm = {}
  let pending = false
  let renders = 0
  function render() {
    pending = false
    renders++
    patchChildren(screen, expand(def.template(vm), []))
  }
  function schedule() {
    if (pending) return
    pending = true
    queueMicrotask(render)
  }
  for (const k of Object.keys(data)) {
    Object.defineProperty(vm, k, {
      get: () => data[k],
      set: (v) => {
        if (data[k] === v) return
        data[k] = v
        schedule()
      },
      enumerable: true
    })
  }
  for (const k of Object.keys(def)) {
    if (typeof def[k] === 'function' && k !== 'template') vm[k] = def[k].bind(vm)
  }
  function lifecycle(name) {
    try {
      if (vm[name]) vm[name]()
    } catch (err) {
      window.__errors.push(name + ': ' + String(err && err.stack ? err.stack : err))
    }
  }

  window.harness = {
    vm,
    def,
    lifecycle,
    layoutIssues,
    capsuleOk,
    renders: () => renders,
    text: (id) => {
      const el = document.getElementById(id)
      return el ? el.textContent : null
    },
    size: { w: SCREEN_W, h: SCREEN_H }
  }

  lifecycle('onInit')
  render()
  lifecycle('onShow')
  if (new URLSearchParams(location.search).has('sim')) simulator(screen, vm)
  window.__ready = true
}

// ---------- simulator mode (?sim) ----------
// What the band's system does around the app, for trying it by hand: a
// long-press, the right swipe that is "back", and closing the app. Off in
// the tests, which drive these directly.
function simulator(screen, vm) {
  document.body.classList.add('sim', 'clean')
  let down = null
  let timer = null
  screen.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, el: e.target }
    timer = setTimeout(() => {
      timer = null
      // the nearest element with a longpress handler, like the band
      for (let el = down && down.el; el && el !== screen; el = el.parentElement) {
        const fn = el.__handlers && el.__handlers.longpress
        if (fn) { fn({}); break }
      }
    }, 600)
  }, true)
  screen.addEventListener('pointermove', (e) => {
    if (timer && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { clearTimeout(timer); timer = null }
  }, true)
  screen.addEventListener('pointerup', (e) => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!down) return
    const dx = e.clientX - down.x
    const dy = e.clientY - down.y
    down = null
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      vm.onBackPress()
      if (window.__terminated) closed()
    }
  }, true)
  const closed = () => {
    const o = document.createElement('div')
    o.id = 'sim-closed'
    o.innerHTML = '<p>App cerrada</p><button>Abrir de nuevo</button>'
    o.querySelector('button').onclick = () => location.reload()
    document.body.appendChild(o)
  }
}

boot().catch((err) => {
  window.__errors.push('boot: ' + String(err && err.stack ? err.stack : err))
  window.__ready = true
})
