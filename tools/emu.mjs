// Drives the running Vela emulator (`npm run emu`) from the command line:
// screenshots and touches, so changes can be checked on Xiaomi's own
// renderer, not only in Chromium. Talks to the emulator's gRPC controller,
// as the AIoT toolkit does.
//
//   node tools/emu.mjs install              install dist/*.rpk and open it
//   node tools/emu.mjs shot out.png          screenshot (PNG)
//   node tools/emu.mjs tap X Y               tap at screen px
//   node tools/emu.mjs hold X Y [MS]         long press (default 800 ms)
//   node tools/emu.mjs swipe X1 Y1 X2 Y2 [MS]  drag (default 300 ms)
//   node tools/emu.mjs run "tap 100 100; wait 500; shot a.png; ..."
//   frames DIR MS (inside run): records every frame for MS ms into DIR while
//   the next commands run, e.g. run "frames out 800; swipe 106 40 106 200"
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { getRunningAvdConfig } = require('@aiot-toolkit/emulator/lib/emulatorutil/running')
const grpc = require('@grpc/grpc-js')
const loader = require('@grpc/proto-loader')

const conf = getRunningAvdConfig()[0]
if (!conf) {
  console.error('No emulator running: start it with `npm run emu`.')
  process.exit(1)
}
const proto = path.join(path.dirname(require.resolve('@aiot-toolkit/emulator/package.json')), 'lib/static/proto/emulator_controller.proto')
const ctl = grpc.loadPackageDefinition(loader.loadSync(proto, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })).android.emulation.control
const client = new ctl.EmulatorController('127.0.0.1:' + conf['grpc.port'], grpc.credentials.createInsecure())
const meta = new grpc.Metadata()
if (conf['grpc.token']) meta.set('Authorization', 'Bearer ' + conf['grpc.token'])

const call = (name, msg) =>
  new Promise((resolve, reject) => client[name](msg, meta, (err, res) => (err ? reject(err) : resolve(res))))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mouse = (x, y, buttons) => call('sendMouse', { x: Math.round(x), y: Math.round(y), buttons })

async function swipe(x1, y1, x2, y2, ms = 300) {
  const steps = Math.max(2, Math.round(ms / 16))
  await mouse(x1, y1, 1)
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps)
    await mouse(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 1)
  }
  await mouse(x2, y2, 0)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ADB = path.join(ROOT, 'node_modules', '@miwt', 'adb', 'bin', process.platform === 'darwin' ? 'mac' : 'linux', 'adb')
const adb = (...a) => execFileSync(ADB, ['-s', 'emulator-' + conf['port.serial'], ...a], { encoding: 'utf8' })
const APP = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'manifest.json'), 'utf8')).package

const commands = {
  // The newest package in dist/, installed fresh and opened.
  async install() {
    const dist = path.join(ROOT, 'dist')
    const rpk = fs.readdirSync(dist).filter((f) => f.endsWith('.rpk'))
      .map((f) => path.join(dist, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
    if (!rpk) throw new Error('no .rpk in dist/: run `npx aiot build` first')
    adb('push', rpk, '/data/app/' + APP + '.rpk')
    adb('shell', 'am', 'stop', APP)
    console.log(adb('shell', 'pm', 'install', '/data/app/' + APP + '.rpk').trim())
    // Right after an install the start is dropped; and the app takes a
    // while to come up on the emulator.
    await sleep(1500)
    adb('shell', 'am', 'start', APP)
    await sleep(12000)
    console.log('opened', APP, 'from', path.basename(rpk))
  },
  async shot(file) {
    const res = await call('getScreenshot', { format: { format: 'PNG' } })
    fs.writeFileSync(file, res.image)
    console.log(file, res.format.width + 'x' + res.format.height)
  },
  async tap(x, y) {
    await mouse(+x, +y, 1)
    await sleep(60)
    await mouse(+x, +y, 0)
  },
  async hold(x, y, ms = 800) {
    await mouse(+x, +y, 1)
    await sleep(+ms)
    await mouse(+x, +y, 0)
  },
  async swipe(x1, y1, x2, y2, ms) {
    await swipe(+x1, +y1, +x2, +y2, ms ? +ms : undefined)
  },
  async wait(ms) {
    await sleep(+ms)
  },
  // Streams frames in the background; doesn't wait.
  async frames(dir, ms = 1000) {
    fs.mkdirSync(dir, { recursive: true })
    const t0 = Date.now()
    let n = 0
    const stream = client.streamScreenshot({ format: { format: 'PNG' } }, meta)
    stream.on('data', (res) => {
      fs.writeFileSync(path.join(dir, String(n++).padStart(3, '0') + '-' + (Date.now() - t0) + 'ms.png'), res.image)
    })
    stream.on('error', () => {})
    pending.push(sleep(+ms).then(() => stream.cancel()))
  }
}

const pending = []

async function run(line) {
  const [cmd, ...args] = line.trim().split(/\s+/)
  if (!cmd) return
  if (!commands[cmd]) throw new Error('unknown command: ' + cmd)
  await commands[cmd](...args)
}

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === 'run') for (const line of args.join(' ').split(';')) await run(line)
  else await run([cmd, ...args].join(' '))
  await Promise.all(pending)
} catch (e) {
  console.error(e.message || e)
  process.exitCode = 1
}
client.close()
