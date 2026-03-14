import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../lib/supabase'
import DominoCard from '../../components/DominoCard'
import ChatPanel from '../../components/ChatPanel'
import VoiceChat from '../../components/VoiceChat'
import {
  createInitialState,
  getValidMoves,
  placeTile,
  checkWinner,
  isBlocked,
  countPips,
  findStarter,
} from '../../lib/gaple.js'
import {
  playCardPlace,
  playYourTurn,
  playInvalid,
  playWin,
  playLose,
  playPlayerJoin,
  resumeAudio,
} from '../../lib/sounds.js'

// Seat positions: bottom=me, top=opposite, left, right
const SEAT_POSITIONS = ['bottom', 'top', 'right', 'left']

function TileBack({ horizontal, small }) {
  const w = small ? (horizontal ? 48 : 26) : (horizontal ? 58 : 32)
  const h = small ? (horizontal ? 26 : 48) : (horizontal ? 32 : 58)
  return (
    <div style={{
      width: w, height: h,
      borderRadius: 5,
      background: 'linear-gradient(135deg, #1a3a6e, #2563a0, #1a3a6e)',
      border: '1.5px solid rgba(255,255,255,0.2)',
      boxShadow: '2px 3px 8px rgba(0,0,0,0.5)',
      flexShrink: 0,
      backgroundImage: `
        repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 8px)
      `,
    }} />
  )
}

function OpponentHand({ count, position }) {
  const isVertical = position === 'top' || position === 'bottom'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isVertical ? 'row' : 'column',
      gap: 3,
      alignItems: 'center',
    }}>
      {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
        <TileBack key={i} horizontal={!isVertical} small />
      ))}
    </div>
  )
}

function BoardTile({ tile, horizontal }) {
  return <DominoCard tile={tile} horizontal={horizontal} played small />
}

export default function GamePage() {
  const router = useRouter()
  const { roomId } = router.query

  const [user, setUser] = useState(null)
  const [room, setRoom] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [myPlayerIdx, setMyPlayerIdx] = useState(-1)
  const [selectedTile, setSelectedTile] = useState(null)
  const [showSideSelector, setShowSideSelector] = useState(false)
  const [pendingTile, setPendingTile] = useState(null)
  const [notification, setNotification] = useState(null)
  const [dragTile, setDragTile] = useState(null)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [prevPlayerCount, setPrevPlayerCount] = useState(0)
  const [prevTurn, setPrevTurn] = useState(-1)
  const boardRef = useRef(null)
  const notifTimeout = useRef(null)
  const soundEnabledRef = useRef(true)

  const playSound = useCallback((fn) => {
    if (soundEnabledRef.current) fn()
  }, [])

  const showNotif = useCallback((msg) => {
    setNotification(msg)
    clearTimeout(notifTimeout.current)
    notifTimeout.current = setTimeout(() => setNotification(null), 2500)
  }, [])

  useEffect(() => {
    if (!roomId) return
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setUser(session.user)
      fetchRoom(session.user)
    }
    init()
  }, [roomId])

  const fetchRoom = async (currentUser) => {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).single()
    if (!data) { router.push('/lobby'); return }
    setRoom(data)
    if (data.game_state) setGameState(data.game_state)
    findMyIdx(data, currentUser || user)
  }

  const findMyIdx = (roomData, currentUser) => {
    if (!roomData?.players || !currentUser) return
    const idx = roomData.players.findIndex(p => p.id === currentUser.id)
    setMyPlayerIdx(idx)
  }

  // Realtime subscription
  useEffect(() => {
    if (!roomId) return
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`
      }, (payload) => {
        const updated = payload.new
        const prevRoom = room

        setRoom(updated)
        if (updated.game_state) setGameState(updated.game_state)
        if (user) findMyIdx(updated, user)

        // Sound: pemain baru gabung
        const newCount = updated.players?.length || 0
        setPrevPlayerCount(prev => {
          if (newCount > prev) playSound(playPlayerJoin)
          return newCount
        })

        // Sound: giliran berganti
        if (updated.game_state && user) {
          const myIdx = updated.players?.findIndex(p => p.id === user.id)
          const newTurn = updated.game_state.currentPlayer
          setPrevTurn(prev => {
            if (newTurn !== prev && myIdx === newTurn) {
              setTimeout(() => playSound(playYourTurn), 200)
            }
            return newTurn
          })

          // Sound: kartu baru dimainkan (board bertambah)
          const prevBoard = prevRoom?.game_state?.board?.length || 0
          const newBoard = updated.game_state.board?.length || 0
          if (newBoard > prevBoard) playSound(playCardPlace)

          // Sound: game over
          if (updated.game_state.winner >= 0 && (!prevRoom?.game_state || prevRoom.game_state.winner < 0)) {
            const isWin = updated.game_state.winner === myIdx
            setTimeout(() => playSound(isWin ? playWin : playLose), 300)
          }
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, user, room])

  const startGame = async () => {
    if (!room || !user) return
    if (room.players.length < 2) {
      showNotif('Butuh minimal 2 pemain!')
      return
    }
    const playerIds = room.players.map(p => p.id)
    const state = createInitialState(playerIds)
    await supabase.from('rooms').update({
      status: 'playing',
      game_state: state
    }).eq('id', roomId)
  }

  const isMyTurn = gameState && myPlayerIdx === gameState.currentPlayer
  const myHand = gameState?.hands?.[myPlayerIdx] || []
  const boardLeft = gameState?.boardLeft
  const boardRight = gameState?.boardRight
  const isFirstMove = gameState?.firstMove

  const validMoves = isMyTurn
    ? getValidMoves(myHand, boardLeft, boardRight, isFirstMove)
    : []

  const doPlayTile = async (tile, side) => {
    if (!isMyTurn || !gameState) return
    resumeAudio()

    const canLeft = tile.left === boardLeft || tile.right === boardLeft
    const canRight = tile.left === boardRight || tile.right === boardRight

    // If only one side valid, auto-choose
    let chosenSide = side
    if (!isFirstMove && !chosenSide) {
      if (canLeft && !canRight) chosenSide = 'left'
      else if (!canLeft && canRight) chosenSide = 'right'
      else {
        // Show side selector
        setPendingTile(tile)
        setShowSideSelector(true)
        return
      }
    }

    const { newLeft, newRight } = placeTile(tile, chosenSide || 'right', boardLeft, boardRight, isFirstMove)

    const newHands = gameState.hands.map((h, i) =>
      i === myPlayerIdx ? h.filter(t => t.id !== tile.id) : h
    )
    const newBoard = [...(gameState.board || []), {
      ...tile,
      horizontal: Math.random() > 0.5,
      side: chosenSide
    }]

    const nextPlayer = (gameState.currentPlayer + 1) % room.players.length

    let winner = checkWinner(newHands)
    let blocked = false
    if (winner === -1) {
      blocked = isBlocked(newHands, newLeft, newRight)
      if (blocked) {
        // Find winner by lowest pip count
        const pipCounts = newHands.map(countPips)
        winner = pipCounts.indexOf(Math.min(...pipCounts))
      }
    }

    const newState = {
      ...gameState,
      hands: newHands,
      board: newBoard,
      boardLeft: newLeft,
      boardRight: newRight,
      currentPlayer: winner >= 0 ? gameState.currentPlayer : nextPlayer,
      firstMove: false,
      winner,
      blocked,
      lastAction: {
        player: myPlayerIdx,
        tile: tile.id,
        side: chosenSide,
      }
    }

    await supabase.from('rooms').update({
      game_state: newState,
      status: winner >= 0 ? 'finished' : 'playing'
    }).eq('id', roomId)

    setSelectedTile(null)
    setShowSideSelector(false)
    setPendingTile(null)
  }

  const handleTileSelect = (tile) => {
    resumeAudio()
    if (!isMyTurn) { showNotif('Bukan giliran kamu!'); playSound(playInvalid); return }
    const isValid = validMoves.find(t => t.id === tile.id)
    if (!isValid) { showNotif('Kartu tidak bisa dimainkan!'); playSound(playInvalid); return }

    if (selectedTile?.id === tile.id) {
      doPlayTile(tile, null)
    } else {
      setSelectedTile(tile)
    }
  }

  // Drag handlers
  const handleDragStart = (e, tile) => {
    if (!isMyTurn) { e.preventDefault(); return }
    const isValid = validMoves.find(t => t.id === tile.id)
    if (!isValid) { e.preventDefault(); showNotif('Kartu tidak bisa dimainkan!'); return }
    setDragTile(tile)
    setIsDragging(true)
    setSelectedTile(tile)
  }

  const handleDragEnd = (e) => {
    setIsDragging(false)
    if (!dragTile) return

    const boardEl = boardRef.current
    if (!boardEl) { setDragTile(null); return }

    const rect = boardEl.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width

    // Dropped on left third → left side, right third → right side
    if (x < w * 0.35) {
      doPlayTile(dragTile, 'left')
    } else if (x > w * 0.65) {
      doPlayTile(dragTile, 'right')
    } else {
      doPlayTile(dragTile, null)
    }
    setDragTile(null)
  }

  const handleBoardDragOver = (e) => { e.preventDefault() }

  const resetGame = async () => {
    if (!user || room?.players[0]?.id !== user.id) return
    const playerIds = room.players.map(p => p.id)
    const state = createInitialState(playerIds)
    await supabase.from('rooms').update({
      status: 'playing',
      game_state: state
    }).eq('id', roomId)
  }

  const backToLobby = async () => {
    if (!user || !room) return
    const newPlayers = room.players.filter(p => p.id !== user.id)
    if (newPlayers.length === 0) {
      await supabase.from('rooms').delete().eq('id', roomId)
    } else {
      await supabase.from('rooms').update({ players: newPlayers }).eq('id', roomId)
    }
    router.push('/lobby')
  }

  if (!room) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d1f13' }}>
        <div className="spinner" />
      </div>
    )
  }

  const players = room.players || []
  // Reorder so current user is always at bottom (seat 0 in display)
  const getDisplayPlayers = () => {
    const result = Array(4).fill(null)
    if (myPlayerIdx < 0) {
      players.forEach((p, i) => { result[i] = p })
      return result
    }
    players.forEach((p, i) => {
      const displaySeat = (i - myPlayerIdx + 4) % 4
      result[displaySeat] = p
    })
    return result
  }

  const displayPlayers = getDisplayPlayers()

  // Waiting room
  if (!gameState || room.status === 'waiting') {
    const isHost = players[0]?.id === user?.id
    return (
      <>
        <Head><title>Meja {roomId} – Gaple</title></Head>
        <div className="game-wrapper">
          <div className="game-table-outer">
            <div className="game-table-inner">
              <div className="waiting-room">
                <h2 className="waiting-title">🎴 Meja {roomId}</h2>
                <p style={{ color: 'rgba(245,240,232,0.5)', fontSize: '0.8rem', letterSpacing: 2 }}>
                  MENUNGGU PEMAIN ({players.length}/4)
                </p>
                <div className="waiting-seats">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const p = players[i]
                    return (
                      <div key={i} className={`waiting-seat ${p ? 'filled' : ''}`}>
                        <div className="seat-avatar">{p ? p.username[0].toUpperCase() : '?'}</div>
                        <span>{p ? p.username : 'Kosong'}</span>
                      </div>
                    )
                  })}
                </div>

                {isHost && players.length >= 2 ? (
                  <button className="btn-primary" style={{ width: 200 }} onClick={startGame}>
                    Mulai Permainan
                  </button>
                ) : isHost ? (
                  <p style={{ color: 'rgba(245,240,232,0.4)', fontSize: '0.8rem' }}>
                    Butuh minimal 2 pemain untuk mulai
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div className="spinner" />
                    <p style={{ color: 'rgba(245,240,232,0.4)', fontSize: '0.8rem' }}>
                      Menunggu host memulai...
                    </p>
                  </div>
                )}

                <button
                  className="btn-secondary"
                  style={{ width: 160, fontSize: '0.75rem' }}
                  onClick={backToLobby}
                >
                  Tinggalkan Meja
                </button>

                <div style={{
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: 8,
                  padding: '8px 16px',
                  color: 'rgba(245,240,232,0.4)',
                  fontSize: '0.7rem',
                  letterSpacing: 2,
                }}>
                  KODE MEJA: <strong style={{ color: 'var(--gold)' }}>{roomId}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Game over
  const isGameOver = gameState.winner >= 0
  const winnerPlayer = isGameOver ? players[gameState.winner] : null
  const isWinner = isGameOver && gameState.winner === myPlayerIdx

  const activePlayerUsername = gameState
    ? players[gameState.currentPlayer]?.username || `Pemain ${gameState.currentPlayer + 1}`
    : ''

  return (
    <>
      <Head><title>🎴 Gaple – {roomId}</title></Head>
      <div className="game-wrapper">
        <div className="game-table-outer">
          <div className="game-table-inner" ref={boardRef} onDragOver={handleBoardDragOver} onDrop={handleDragEnd}>

            {/* Center logo */}
            <div className="table-logo">GAPLE</div>

            {/* Turn indicator */}
            <div className="turn-indicator">
              {isMyTurn
                ? '⭐ GILIRAN KAMU'
                : `🎴 Giliran: ${activePlayerUsername}`}
            </div>

            {/* Player seats */}
            {SEAT_POSITIONS.map((pos, displayIdx) => {
              const playerData = displayPlayers[displayIdx]
              if (!playerData) return (
                <div key={pos} className={`player-seat ${pos}`}>
                  <div className="player-avatar" style={{ opacity: 0.3, fontSize: '0.7rem' }}>?</div>
                  <div className="player-info">
                    <div className="player-name" style={{ opacity: 0.4 }}>Kosong</div>
                  </div>
                </div>
              )

              const actualIdx = players.findIndex(p => p.id === playerData.id)
              const isActive = gameState.currentPlayer === actualIdx
              const handCount = gameState.hands?.[actualIdx]?.length || 0
              const isMe = playerData.id === user?.id

              return (
                <div key={pos} className={`player-seat ${pos}`}>
                  {pos !== 'bottom' && (
                    <OpponentHand count={handCount} position={pos} />
                  )}
                  <div className={`player-avatar ${isActive ? 'active' : ''}`}>
                    {playerData.username[0].toUpperCase()}
                  </div>
                  <div className="player-info">
                    <div className="player-name">{isMe ? `${playerData.username} (Aku)` : playerData.username}</div>
                    <div className="player-count">{handCount} kartu</div>
                  </div>
                </div>
              )
            })}

            {/* Board tiles */}
            <div style={{
              position: 'absolute',
              inset: '130px 170px 150px 170px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              overflow: 'hidden',
            }}>
              {gameState.board?.length === 0 && (
                <div style={{
                  color: 'rgba(212,160,23,0.25)',
                  fontSize: '0.8rem',
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  textAlign: 'center',
                }}>
                  {isMyTurn ? 'Pilih & geser kartu ke sini' : 'Menunggu kartu pertama...'}
                </div>
              )}
              {gameState.board?.map((tile, i) => (
                <DominoCard
                  key={`${tile.id}-${i}`}
                  tile={tile}
                  horizontal={!!(i % 3)}
                  played
                  small
                  style={{ flexShrink: 0 }}
                />
              ))}
            </div>

            {/* My hand (bottom) */}
            {myPlayerIdx >= 0 && (
              <div style={{
                position: 'absolute',
                bottom: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 6,
                zIndex: 20,
                alignItems: 'flex-end',
              }}>
                {myHand.map((tile) => {
                  const isValid = !!validMoves.find(t => t.id === tile.id)
                  const isSel = selectedTile?.id === tile.id
                  return (
                    <DominoCard
                      key={tile.id}
                      tile={tile}
                      selected={isSel}
                      validMove={isValid && isMyTurn}
                      onSelect={handleTileSelect}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      style={{
                        cursor: isMyTurn && isValid ? 'grab' : 'default',
                        opacity: isMyTurn && !isValid ? 0.5 : 1,
                      }}
                    />
                  )
                })}
              </div>
            )}

            {/* HUD */}
            <div className="game-hud">
              <div className="hud-chip">🎴 Meja: {roomId}</div>
              <div className="hud-chip">📋 Kartu di meja: {gameState.board?.length || 0}</div>
              <button
                onClick={() => {
                  const next = !soundEnabled
                  setSoundEnabled(next)
                  soundEnabledRef.current = next
                }}
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid rgba(212,160,23,0.2)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: soundEnabled ? 'var(--gold)' : 'rgba(245,240,232,0.3)',
                  fontSize: '0.7rem',
                  letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                {soundEnabled ? '🔊 Suara ON' : '🔇 Suara OFF'}
              </button>
              <button
                onClick={backToLobby}
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid rgba(212,160,23,0.2)',
                  borderRadius: 8,
                  padding: '6px 12px',
                  color: 'rgba(245,240,232,0.5)',
                  fontSize: '0.7rem',
                  letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                ← Lobby
              </button>
            </div>

          </div>
        </div>

        {/* Chat Panel */}
        <ChatPanel roomId={roomId} user={user} players={players} />

        {/* Voice Chat */}
        <VoiceChat roomId={roomId} user={user} players={players} />

        {/* Side selector */}
        {showSideSelector && pendingTile && (
          <div className="side-selector">
            <div style={{ color: 'var(--gold-light)', fontSize: '0.8rem', letterSpacing: 2, position: 'absolute', top: '38%', textAlign: 'center' }}>
              TARUH DI SISI MANA?
            </div>
            <button className="side-btn" onClick={() => doPlayTile(pendingTile, 'left')}>
              ← KIRI<br />
              <span style={{ fontSize: '1.2rem' }}>{boardLeft}</span>
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <DominoCard tile={pendingTile} />
              <button
                onClick={() => { setShowSideSelector(false); setPendingTile(null) }}
                style={{ background: 'none', border: 'none', color: 'rgba(245,240,232,0.4)', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                Batal
              </button>
            </div>
            <button className="side-btn" onClick={() => doPlayTile(pendingTile, 'right')}>
              KANAN →<br />
              <span style={{ fontSize: '1.2rem' }}>{boardRight}</span>
            </button>
          </div>
        )}

        {/* Game over */}
        {isGameOver && (
          <div className="modal-overlay">
            <div className="modal">
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>
                {isWinner ? '🏆' : '😔'}
              </div>
              <h2 className="modal-title">
                {isWinner ? 'MENANG!' : 'KALAH'}
              </h2>
              <p className="modal-subtitle">
                {gameState.blocked ? 'Permainan buntu! ' : ''}
                {winnerPlayer?.username} menang!
              </p>
              {players[0]?.id === user?.id && (
                <button className="btn-primary" onClick={resetGame} style={{ marginBottom: 12 }}>
                  Main Lagi
                </button>
              )}
              <button className="btn-secondary" onClick={backToLobby}>
                Kembali ke Lobby
              </button>
            </div>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div className="notification">{notification}</div>
        )}
      </div>
    </>
  )
}
