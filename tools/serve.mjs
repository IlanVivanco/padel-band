// Serves the repo over HTTP for the dev emulator (ES modules can't load from
// file://). Usage: npm run emulator  [-- --port 5173]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--port')
const PORT = i > 0 ? Number(process.argv[i + 1]) : 5173
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' }

http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (p.endsWith(path.sep)) p = path.join(p, 'index.html')
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404)
    return res.end('not found')
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' })
  fs.createReadStream(p).pipe(res)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Emulator: http://localhost:${PORT}/tools/emulator/`)
})
