// =============================================
// GAPLE GAME LOGIC
// =============================================

// Generate all 28 domino tiles (0-0 to 6-6)
export function generateDominoes() {
  const tiles = []
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      tiles.push({ left: i, right: j, id: `${i}-${j}` })
    }
  }
  return tiles
}

// Shuffle array (Fisher-Yates)
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Deal 7 tiles to each of 4 players
export function dealTiles() {
  const all = shuffle(generateDominoes())
  return {
    hands: [
      all.slice(0, 7),
      all.slice(7, 14),
      all.slice(14, 21),
      all.slice(21, 28),
    ],
    stock: [],
  }
}

// Find who starts (player with 6-6, or highest double)
export function findStarter(hands) {
  const doubles = [
    { val: 6, tile: '6-6' },
    { val: 5, tile: '5-5' },
    { val: 4, tile: '4-4' },
    { val: 3, tile: '3-3' },
    { val: 2, tile: '2-2' },
    { val: 1, tile: '1-1' },
    { val: 0, tile: '0-0' },
  ]
  for (const d of doubles) {
    for (let p = 0; p < 4; p++) {
      if (hands[p].find((t) => t.id === d.tile)) return p
    }
  }
  return 0
}

// Check if a tile can be placed on the board
export function canPlace(tile, boardLeft, boardRight, isFirstMove) {
  if (isFirstMove) return true
  return (
    tile.left === boardLeft ||
    tile.right === boardLeft ||
    tile.left === boardRight ||
    tile.right === boardRight
  )
}

// Get valid moves for a player
export function getValidMoves(hand, boardLeft, boardRight, isFirstMove) {
  return hand.filter((tile) =>
    canPlace(tile, boardLeft, boardRight, isFirstMove)
  )
}

// Place tile on board - returns new board ends
export function placeTile(tile, side, boardLeft, boardRight, isFirstMove) {
  if (isFirstMove) {
    return { newLeft: tile.left, newRight: tile.right }
  }
  if (side === 'left') {
    if (tile.right === boardLeft) {
      return { newLeft: tile.left, newRight: boardRight }
    } else {
      return { newLeft: tile.right, newRight: boardRight }
    }
  } else {
    if (tile.left === boardRight) {
      return { newLeft: boardLeft, newRight: tile.right }
    } else {
      return { newLeft: boardLeft, newRight: tile.left }
    }
  }
}

// Check if game is blocked (no one can move)
export function isBlocked(hands, boardLeft, boardRight) {
  return hands.every(
    (hand) => getValidMoves(hand, boardLeft, boardRight, false).length === 0
  )
}

// Count pip total of a hand (for blocked game winner)
export function countPips(hand) {
  return hand.reduce((sum, t) => sum + t.left + t.right, 0)
}

// Check winner
export function checkWinner(hands) {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].length === 0) return i
  }
  return -1
}

// Initial game state
export function createInitialState(playerIds) {
  const { hands } = dealTiles()
  const starterIdx = findStarter(hands)

  return {
    hands, // array of 4 hand arrays
    board: [], // placed tiles on board
    boardLeft: null,
    boardRight: null,
    currentPlayer: starterIdx,
    firstMove: true,
    winner: -1,
    blocked: false,
    playerIds, // [p0_id, p1_id, p2_id, p3_id]
    scores: [0, 0, 0, 0],
    lastAction: null,
  }
}
