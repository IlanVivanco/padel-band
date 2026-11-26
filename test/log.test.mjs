import test from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/common/padel.js'
import * as L from '../src/common/log.js'

const game = (w) => w.repeat(4)
function play(points, id = 1000) {
  let m = p.setId(p.setFirst(p.newMatch(false), 'u'), id)
  for (const s of points) m = p.addPoint(m, s)
  return m
}
const set64 = (game('u') + game('t')).repeat(4) + game('u') + game('u')

test('an entry has the finished sets plus the one in play', () => {
  const e = L.entryOf(play(set64 + game('t')), 5)
  assert.deepEqual(e, { id: 1000, end: 5, sets: [[6, 4], [0, 1]], w: null })
  assert.equal(L.setsText(e), '6-4  0-1')
})

test('a won match has no set in play and names the winner', () => {
  const e = L.entryOf(play(set64 + set64), 9)
  assert.deepEqual(e.sets, [[6, 4], [6, 4]])
  assert.equal(e.w, 'u')
})

test('recording the same match again updates its entry, newest first', () => {
  let log = L.record([], play('u', 1), 1)
  log = L.record(log, play('u', 2), 2)
  log = L.record(log, play('uu', 1), 3)
  assert.deepEqual(log.map((e) => e.id), [1, 2])
  assert.deepEqual(log[0].end, 3)
})

test('an undo after the win updates the entry instead of adding one', () => {
  const won = play(set64 + set64)
  let log = L.record([], won, 1)
  log = L.record(log, p.removePoint(won, 'u'), 2)
  assert.equal(log.length, 1)
  assert.equal(log[0].w, null)
})

test('rewinding to 0-0 drops the match, and a match with no id is not logged', () => {
  let log = L.record([], play('u', 7), 1)
  log = L.record(log, p.removePoint(play('u', 7), 'u'), 2)
  assert.deepEqual(log, [])
  assert.deepEqual(L.record([], p.addPoint(p.newMatch(false), 'u'), 1), [])
})

test('the log keeps the last ten', () => {
  let log = []
  for (let i = 1; i <= 12; i++) log = L.record(log, play('u', i), i)
  assert.equal(log.length, L.LOG_MAX)
  assert.equal(log[0].id, 12)
  assert.equal(log[9].id, 3)
})

test('the log round-trips and drops junk', () => {
  const log = L.record([], play(set64), 3)
  assert.deepEqual(L.deserializeLog(L.serializeLog(log)), log)
  assert.deepEqual(L.deserializeLog(''), [])
  assert.deepEqual(L.deserializeLog('{"v":1,"l":[{"id":"x"},{"id":1,"end":2,"sets":[[1,0]],"w":null}]}'), [{ id: 1, end: 2, sets: [[1, 0]], w: null }])
})

test('times are zero-padded', () => {
  assert.equal(L.clockText(new Date(2026, 0, 2, 3, 4)), '03:04')
  assert.equal(L.dateText(new Date(2026, 10, 24, 18, 13).getTime()), '24/11 · 18:13')
})
