// Match log: the last few matches, newest first. Pure, like padel.js, so it
// runs under plain Node for the unit tests.
//
// An entry is { id, end, sets, w }: `id` is the match id (time of its first
// point, ms), `end` the time of its latest change, `sets` the games per set
// as [us, them] (the set in play included while the match is on) and `w`
// the winner ('u' / 't') or null while it's still on. The page rewrites the
// entry on every point, so an unfinished match is never lost and an undo
// after the last point simply updates it again.

import { score } from './padel.js'

export var LOG_MAX = 10

export function entryOf(m, now) {
  var s = score(m)
  var sets = []
  for (var i = 0; i < s.setScores.length; i++) sets.push([s.setScores[i][0], s.setScores[i][1]])
  if (!s.winner) sets.push([s.games.u, s.games.t])
  return { id: m.id, end: now, sets: sets, w: s.winner || null }
}

// Puts `entry` first, replacing any entry with the same id.
export function upsert(log, entry) {
  var out = [entry]
  for (var i = 0; i < log.length && out.length < LOG_MAX; i++) {
    if (log[i].id !== entry.id) out.push(log[i])
  }
  return out
}

export function drop(log, id) {
  var out = []
  for (var i = 0; i < log.length; i++) if (log[i].id !== id) out.push(log[i])
  return out
}

// The log after match `m` changed at time `now`. A match with no points
// (rewound to 0-0) leaves the log.
export function record(log, m, now) {
  if (m.id === null || m.id === undefined) return log
  if (!m.history.length) return drop(log, m.id)
  return upsert(log, entryOf(m, now))
}

function validEntry(e) {
  if (!e || typeof e.id !== 'number' || typeof e.end !== 'number') return false
  if (e.w !== null && e.w !== 'u' && e.w !== 't') return false
  if (!Array.isArray(e.sets)) return false
  for (var i = 0; i < e.sets.length; i++) {
    var p = e.sets[i]
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number') return false
  }
  return true
}

export function serializeLog(log) {
  return JSON.stringify({ v: 1, l: log })
}

export function deserializeLog(str) {
  try {
    var o = JSON.parse(str)
    if (o && o.v === 1 && Array.isArray(o.l)) {
      var out = []
      for (var i = 0; i < o.l.length && out.length < LOG_MAX; i++) if (validEntry(o.l[i])) out.push(o.l[i])
      return out
    }
  } catch (e) {}
  return []
}

// "6-4  3-6  2-1": games per set, ours first.
export function setsText(e) {
  var parts = []
  for (var i = 0; i < e.sets.length; i++) parts.push(e.sets[i][0] + '-' + e.sets[i][1])
  return parts.join('  ')
}

function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

export function clockText(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// "24/11 · 18:13"
export function dateText(ms) {
  var d = new Date(ms)
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' · ' + clockText(d)
}
