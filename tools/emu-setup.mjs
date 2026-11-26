// Creates the Band 10 virtual device for Xiaomi's Vela emulator, once:
// `npm run emu:setup` (downloads the emulator first, about 1.8 GB in
// ~/.vela). Then `npm run emu` starts it with the app, and
// `npm run emu:install` reinstalls the app after a change.
//
// The toolkit's own `aiot createVVD` asks interactively and leaves the
// display's shape, flavour and density unset; this uses the Band 10 skin
// that ships with the emulator (212 x 520, pill-shaped).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const emu = require('@aiot-toolkit/emulator')

const NAME = 'Vela_Band10'
const IMAGE = 'vela-miwear-watch-5.0'
const SKIN = 'xiaomi_band_10'

const vvd = new emu.VvdManager({ sdkHome: emu.defaultSDKHome, vvdHome: emu.defaultVvdHome })
const dir = path.join(emu.defaultVvdHome, NAME + '.vvd')
if (fs.existsSync(dir)) {
  console.log(NAME + ' already exists in ' + emu.defaultVvdHome)
  process.exit(0)
}
const skinPath = path.join(emu.defaultSDKHome, 'skins', 'user', SKIN)
if (!fs.existsSync(skinPath)) {
  console.error('No ' + SKIN + ' skin in ' + skinPath + ': run `npx aiot initEmulatorEnv` first.')
  process.exit(1)
}
vvd.createVvd({
  name: NAME,
  skin: SKIN,
  'skin.path': skinPath,
  width: '212',
  height: '520',
  arch: emu.IVvdArchType.arm,
  imageDir: path.join(emu.defaultSDKHome, 'system-images', IMAGE),
  imageType: IMAGE,
  customLcdRadius: ''
})
const ini = path.join(dir, 'config.ini')
fs.writeFileSync(ini, fs.readFileSync(ini, 'utf8')
  .replace(/^hw\.lcd\.density=.*$/m, 'hw.lcd.density=320')
  .replace(/^hw\.lcd\.shape=.*$/m, 'hw.lcd.shape=pill-shaped')
  .replace(/^hw\.device\.flavor=.*$/m, 'hw.device.flavor=band'))
console.log('Created ' + NAME + '. Start it with `npm run emu`.')
