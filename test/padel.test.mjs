import test from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/common/padel.js'

// Points as a string: u = us, t = them.
function play(points, golden = false) {
  let m = p.newMatch(golden)
  for (const s of points) m = p.addPoint(m, s)
  return m
}
const labels = (m) => p.pointLabels(p.score(m), m.golden)
const game = (w) => w.repeat(4)

test('counts 0 / 15 / 30 / 40', () => {
  assert.deepEqual(labels(play('')), { u: '0', t: '0' })
  assert.deepEqual(labels(play('u')), { u: '15', t: '0' })
  assert.deepEqual(labels(play('uut')), { u: '30', t: '15' })
  assert.deepEqual(labels(play('uuut')), { u: '40', t: '15' })
})

test('deuce and advantage', () => {
  assert.deepEqual(labels(play('uuuttt')), { u: '40', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'u')), { u: 'AD', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'ut')), { u: '40', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'tt')), { u: '0', t: '0' })
  assert.deepEqual(p.score(play('uuuttt' + 'tt')).games, { u: 0, t: 1 })
})

test('golden point decides at 40-40', () => {
  const m = play('uuuttt' + 'u', true)
  assert.deepEqual(p.score(m).games, { u: 1, t: 0 })
  assert.deepEqual(labels(m), { u: '0', t: '0' })
})

test('set at 6-4, not at 6-5', () => {
  let s = p.score(play(game('u').repeat(5) + game('t').repeat(4) + game('u')))
  assert.deepEqual(s.sets, { u: 1, t: 0 })
  assert.deepEqual(s.setScores, [[6, 4]])
  s = p.score(play(game('u').repeat(5) + game('t').repeat(5) + game('u')))
  assert.deepEqual(s.sets, { u: 0, t: 0 })
  assert.deepEqual(s.games, { u: 6, t: 5 })
})

test('tiebreak at 6-6, to 7 by 2', () => {
  const sixAll = game('u').repeat(5) + game('t').repeat(5) + game('u') + game('t')
  let s = p.score(play(sixAll))
  assert.equal(s.tiebreak, true)
  s = p.score(play(sixAll + 'uuu'))
  assert.deepEqual(labels(play(sixAll + 'uuu')), { u: '3', t: '0' })
  s = p.score(play(sixAll + 'u'.repeat(6) + 't'.repeat(6) + 'u'))
  assert.equal(s.tiebreak, true)
  s = p.score(play(sixAll + 'u'.repeat(6) + 't'.repeat(6) + 'uu'))
  assert.deepEqual(s.setScores, [[7, 6]])
  assert.equal(s.tiebreak, false)
})

test('match ends at 2 sets and ignores further points', () => {
  const set = game('u').repeat(6)
  const m = play(set + set)
  assert.equal(p.score(m).winner, 'u')
  assert.equal(p.addPoint(m, 't'), m)
})

test('remove undoes the side\'s last point', () => {
  assert.deepEqual(labels(p.removePoint(play('uut'), 't')), { u: '30', t: '0' })
  assert.deepEqual(labels(p.removePoint(play('uut'), 'u')), { u: '15', t: '15' })
  assert.equal(p.removePoint(play('t'), 'u').history, 't')
  assert.equal(p.removePoint(play(''), 'u').history, '')
})

test('remove can reopen the game the last point closed', () => {
  const m = p.removePoint(play('uuuu'), 'u')
  assert.deepEqual(p.score(m).games, { u: 0, t: 0 })
  assert.deepEqual(labels(m), { u: '40', t: '0' })
})

test('remove does not reach into a finished game for the other side', () => {
  const m = play('uuuu' + 't')
  assert.equal(p.removePoint(m, 'u').history, m.history)
})

test('serialize round-trips and rejects junk', () => {
  const m = play('uutt', true)
  assert.deepEqual(p.deserialize(p.serialize(m)), m)
  assert.deepEqual(p.deserialize('nope'), p.newMatch(false))
  assert.deepEqual(p.deserialize('{"v":1,"h":"ux"}'), p.newMatch(false))
})

// --- serve -----------------------------------------------------------------

const withFirst = (m, f) => p.setFirst(m, f)
const sv = (points, first, golden = false) => p.serve(withFirst(play(points, golden), first))
const corner = (points, first, golden) => sv(points, first, golden).corner

test('no serve before the first server is chosen, or after the match', () => {
  assert.equal(p.serve(play('uu')), null)
  const set = game('u').repeat(6)
  assert.equal(sv(set + set, 'u'), null)
})

test('each game starts from the right and alternates sides every point', () => {
  assert.deepEqual(sv('', 'u'), { server: 'u', side: 'R', corner: 'BR' })
  assert.deepEqual(sv('t', 'u'), { server: 'u', side: 'L', corner: 'BL' })
  assert.deepEqual(sv('tu', 'u'), { server: 'u', side: 'R', corner: 'BR' })
  // deuce and advantage keep alternating
  assert.equal(sv('uuuttt', 'u').side, 'R')
  assert.equal(sv('uuuttt' + 'u', 'u').side, 'L')
})

test('their right is the screen\'s left (they face us)', () => {
  assert.deepEqual(sv('', 't'), { server: 't', side: 'R', corner: 'TL' })
  assert.deepEqual(sv('u', 't'), { server: 't', side: 'L', corner: 'TR' })
})

test('teams alternate games, also across sets', () => {
  assert.equal(sv(game('u'), 'u').server, 't')
  assert.equal(sv(game('u') + game('t'), 'u').server, 'u')
  // 6-4 = 10 games: the first server serves the first game of set 2
  const set64 = (game('u') + game('t')).repeat(4) + game('u') + game('u')
  assert.equal(p.score(play(set64)).setScores.length, 1)
  assert.equal(sv(set64, 'u').server, 'u')
  // 6-3 = 9 games: the other team opens set 2
  const set63 = (game('u') + game('t')).repeat(3) + game('u').repeat(3)
  assert.equal(sv(set63, 'u').server, 't')
})

test('tiebreak: one point, then two each, sides alternating', () => {
  // 6-6 after 12 games: the first server opens the tiebreak
  const sixAll = (game('u') + game('t')).repeat(6)
  assert.equal(p.score(play(sixAll)).tiebreak, true)
  const servers = []
  const sides = []
  for (let k = 0; k < 7; k++) {
    const pts = 'ut'.repeat(4).slice(0, k)
    const s = sv(sixAll + pts, 'u')
    servers.push(s.server)
    sides.push(s.side)
  }
  assert.deepEqual(servers, ['u', 't', 't', 'u', 'u', 't', 't'])
  assert.deepEqual(sides, ['R', 'L', 'R', 'L', 'R', 'L', 'R'])
  // the tiebreak counts as a game: the team that received first opens the next set
  const tb = sixAll + 'u'.repeat(7)
  assert.equal(p.score(play(tb)).setScores.length, 1)
  assert.equal(sv(tb, 'u').server, 't')
})

test('golden point keeps the side rule', () => {
  assert.equal(corner('uuuttt', 'u', true), 'BR')
})

test('changing the first server re-labels the match', () => {
  const m = p.setFirst(play('u'), 'u')
  assert.equal(p.serve(m).corner, 'BL')
  assert.equal(p.serve(p.setFirst(m, 't')).corner, 'TR')
})

test('first server survives every edit and the save', () => {
  let m = p.setFirst(p.newMatch(false), 't')
  m = p.addPoint(m, 'u')
  m = p.removePoint(m, 'u')
  m = p.setGolden(m, true)
  assert.equal(m.first, 't')
  assert.equal(p.deserialize(p.serialize(m)).first, 't')
  // saves from before 0.4.0 have no `f`
  assert.equal(p.deserialize('{"v":1,"h":"ut","g":false}').first, null)
})
