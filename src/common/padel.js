// Pure padel scoring. No system modules here, so it runs under plain Node for
// the unit tests.
//
// The match is stored as the list of point winners ('u' = us, 't' = them) and
// the score is always derived by replaying it. That makes "subtract" an edit
// of the history instead of hand-written reverse rules.
//
// Rules: points 0/15/30/40, deuce and advantage (or golden point at 40-40 if
// enabled), sets to 6 games won by 2, tiebreak to 7 won by 2 at 6-6, best of 3.
//
// Serve: `first` is the team that served the first game (null until chosen).
// Teams alternate games, also across sets; each game starts from the
// server's right and alternates sides every point. In a tiebreak the team
// whose turn it is serves one point, then two each.

export var US = 'u'
export var THEM = 't'
var SETS_TO_WIN = 2

function other(side) {
  return side === US ? THEM : US
}

export function newMatch(golden) {
  return { history: '', golden: !!golden, first: null }
}

function withHistory(m, history) {
  return { history: history, golden: m.golden, first: m.first || null }
}

// Replays the history. Returns the full derived score.
export function score(m) {
  var sets = { u: 0, t: 0 }
  var games = { u: 0, t: 0 }
  var pts = { u: 0, t: 0 }
  var setScores = [] // finished sets as [us, them]
  var tiebreak = false
  var winner = null
  var gameStart = 0 // history index where the current game started

  for (var i = 0; i < m.history.length; i++) {
    if (winner) break
    var w = m.history[i]
    var l = other(w)
    pts[w]++

    var gameWon
    if (tiebreak) gameWon = pts[w] >= 7 && pts[w] - pts[l] >= 2
    else if (m.golden) gameWon = pts[w] >= 4
    else gameWon = pts[w] >= 4 && pts[w] - pts[l] >= 2
    if (!gameWon) continue

    pts = { u: 0, t: 0 }
    gameStart = i + 1
    games[w]++
    var setWon
    if (tiebreak) setWon = true
    else setWon = games[w] >= 6 && games[w] - games[l] >= 2
    if (setWon) {
      setScores.push([games.u, games.t])
      sets[w]++
      games = { u: 0, t: 0 }
      tiebreak = false
      if (sets[w] >= SETS_TO_WIN) winner = w
    } else if (games.u === 6 && games.t === 6) {
      tiebreak = true
    }
  }

  return {
    sets: sets,
    games: games,
    points: pts,
    setScores: setScores,
    tiebreak: tiebreak,
    winner: winner,
    gameStart: gameStart
  }
}

// Adds a point for `side`. Ignored once the match is over.
export function addPoint(m, side) {
  if (score(m).winner) return m
  return withHistory(m, m.history + side)
}

// Takes a point away from `side`:
// - if `side` won the last point, that point is undone (this can reopen a
//   game or set that point closed);
// - otherwise, the most recent point `side` won in the current game is
//   removed;
// - if `side` has no points in the current game, nothing happens.
export function removePoint(m, side) {
  var h = m.history
  if (!h.length) return m
  if (h[h.length - 1] === side) return withHistory(m, h.slice(0, -1))
  var start = score(m).gameStart
  var i = h.lastIndexOf(side)
  if (i < start) return m
  return withHistory(m, h.slice(0, i) + h.slice(i + 1))
}

export function setGolden(m, golden) {
  return { history: m.history, golden: !!golden, first: m.first || null }
}

// Sets which team served the first game. The whole serve sequence is
// derived from it, so changing it mid-match re-labels every game.
export function setFirst(m, side) {
  return { history: m.history, golden: m.golden, first: side === US || side === THEM ? side : null }
}

// Who serves the next point and from where. Returns null before the first
// server is chosen and once the match is over. `side` is the server's own
// 'R' / 'L'. `corner` is the server's quadrant on screen, which shows the
// court from our side: them on top, us below; our right is the screen's
// right, their right (they face us) is the screen's left.
export function serve(m, s) {
  if (!s) s = score(m)
  if (s.winner || !m.first) return null
  var n = s.games.u + s.games.t // games played so far
  for (var i = 0; i < s.setScores.length; i++) n += s.setScores[i][0] + s.setScores[i][1]
  var gameServer = n % 2 === 0 ? m.first : other(m.first)
  var k = s.points.u + s.points.t // points played in this game
  var server = gameServer
  if (s.tiebreak && Math.floor((k + 1) / 2) % 2 === 1) server = other(gameServer)
  var side = k % 2 === 0 ? 'R' : 'L'
  var corner
  if (server === US) corner = side === 'R' ? 'BR' : 'BL'
  else corner = side === 'R' ? 'TL' : 'TR'
  return { server: server, side: side, corner: corner }
}

var LABELS = ['0', '15', '30', '40']

// Text for each side's points: { u: '30', t: '40' }, 'AD', or tiebreak numbers.
export function pointLabels(s, golden) {
  var p = s.points
  if (s.tiebreak) return { u: String(p.u), t: String(p.t) }
  if (!golden && p.u >= 3 && p.t >= 3) {
    if (p.u === p.t) return { u: '40', t: '40' }
    return p.u > p.t ? { u: 'AD', t: '40' } : { u: '40', t: 'AD' }
  }
  return { u: LABELS[Math.min(p.u, 3)], t: LABELS[Math.min(p.t, 3)] }
}

export function serialize(m) {
  return JSON.stringify({ v: 1, h: m.history, g: m.golden, f: m.first || null })
}

export function deserialize(str) {
  try {
    var o = JSON.parse(str)
    if (o && o.v === 1 && typeof o.h === 'string' && /^[ut]*$/.test(o.h)) {
      // `f` was added in 0.4.0; older saves have no first server yet.
      return { history: o.h, golden: !!o.g, first: o.f === US || o.f === THEM ? o.f : null }
    }
  } catch (e) {}
  return newMatch(false)
}
