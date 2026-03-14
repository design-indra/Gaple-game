import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../lib/supabase'
import ChatPanel from '../../components/ChatPanel'
import {
  createInitialState, getValidMoves, placeTile,
  checkWinner, isBlocked, countPips,
} from '../../lib/gaple.js'
import {
  playCardPlace, playYourTurn, playInvalid,
  playWin, playLose, resumeAudio,
} from '../../lib/sounds.js'

const TURN_SECONDS = 15  // detik per giliran

// ─── Pip SVG ─────────────────────────────────────────────────────
const PIP_POS = {
  0: [],
  1: [[50,50]],
  2: [[28,28],[72,72]],
  3: [[28,28],[50,50],[72,72]],
  4: [[28,28],[72,28],[28,72],[72,72]],
  5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
  6: [[28,20],[72,20],[28,50],[72,50],[28,80],[72,80]],
}

function PipFace({ val }) {
  const pips = PIP_POS[val] || []
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display:'block' }}>
      {pips.map(([cx,cy],i) => <circle key={i} cx={cx} cy={cy} r={12} fill="#c0392b" />)}
    </svg>
  )
}

// ─── Hand tile ────────────────────────────────────────────────────
function HandTile({ tile, selected, validMove, isMyTurn, onClick, onDragStart, onDragEnd }) {
  return (
    <div
      draggable={isMyTurn && validMove}
      onDragStart={e => onDragStart?.(e, tile)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(tile)}
      style={{
        width:40, height:74,
        background:'#fffef8', borderRadius:6,
        border: selected ? '2.5px solid #f0c040'
               : validMove && isMyTurn ? '2px solid #27ae60'
               : '1.5px solid #555',
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'space-between',
        padding:'3px 2px',
        cursor: isMyTurn && validMove ? 'pointer' : 'default',
        opacity: isMyTurn && !validMove ? 0.4 : 1,
        transform: selected ? 'translateY(-14px)' : validMove && isMyTurn ? 'translateY(-5px)' : 'none',
        transition:'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
        boxShadow: selected
          ? '0 0 0 3px rgba(240,192,64,0.5), 0 10px 20px rgba(0,0,0,0.6)'
          : validMove && isMyTurn
            ? '0 0 0 2px rgba(39,174,96,0.4), 0 4px 10px rgba(0,0,0,0.4)'
            : '2px 3px 8px rgba(0,0,0,0.5)',
        flexShrink:0, userSelect:'none',
        animation: validMove && isMyTurn && !selected ? 'valid-glow 0.9s ease infinite alternate' : 'none',
      }}
    >
      <div style={{ width:'100%', flex:1 }}><PipFace val={tile.left} /></div>
      <div style={{ width:'75%', height:1.5, background:'#444', margin:'1px 0' }} />
      <div style={{ width:'100%', flex:1 }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Board tile ───────────────────────────────────────────────────
function BoardTile({ tile, horizontal }) {
  const w = horizontal ? 50 : 27
  const h = horizontal ? 27 : 50
  return (
    <div style={{
      width:w, height:h, background:'#fffef8', borderRadius:4,
      border:'1.5px solid #444',
      display:'flex', flexDirection: horizontal ? 'row' : 'column',
      alignItems:'center', justifyContent:'space-between',
      padding:2, boxShadow:'1px 2px 5px rgba(0,0,0,0.45)', flexShrink:0,
    }}>
      <div style={{ flex:1, width:'100%', height:'100%' }}><PipFace val={tile.left} /></div>
      <div style={{
        [horizontal?'width':'height']:1.5,
        [horizontal?'height':'width']:'85%',
        background:'#444', flexShrink:0,
      }} />
      <div style={{ flex:1, width:'100%', height:'100%' }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Tile back ────────────────────────────────────────────────────
function TileBack({ count, horizontal }) {
  return (
    <div style={{ display:'flex', flexDirection: horizontal ? 'row' : 'column', gap:3, flexWrap:'wrap', maxWidth: horizontal ? 160 : 34 }}>
      {Array.from({ length: Math.min(count,7) }).map((_,i) => (
        <div key={i} style={{
          width: horizontal ? 22 : 34, height: horizontal ? 34 : 22,
          borderRadius:3,
          background:'linear-gradient(135deg,#1e3a7e,#2563a0,#1e3a7e)',
          border:'1px solid rgba(255,255,255,0.2)',
          boxShadow:'1px 2px 4px rgba(0,0,0,0.5)', flexShrink:0,
        }} />
      ))}
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────
function Avatar({ player, isActive, handCount, isMe }) {
  if (!player) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <div style={{
        width:48, height:48, borderRadius:'50%',
        border:'2px dashed rgba(212,160,23,0.25)',
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'rgba(212,160,23,0.25)', fontSize:'1.1rem',
      }}>?</div>
      <div style={{ fontSize:'0.58rem', color:'rgba(245,240,232,0.25)', background:'rgba(0,0,0,0.4)', borderRadius:4, padding:'1px 6px' }}>Kosong</div>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
      <div style={{
        width:48, height:48, borderRadius:'50%',
        background:'linear-gradient(135deg,#255c35,#1a4528)',
        border: isActive ? '3px solid #f0c040' : '2px solid rgba(212,160,23,0.35)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'1.2rem', fontWeight:700,
        color: isActive ? '#f0c040' : '#f0ede5',
        fontFamily:'Playfair Display, serif',
        boxShadow: isActive
          ? '0 0 0 4px rgba(240,192,64,0.25), 0 4px 14px rgba(0,0,0,0.5)'
          : '0 3px 10px rgba(0,0,0,0.45)',
        animation: isActive ? 'pulse-ring 1.5s ease infinite' : 'none',
        position:'relative', flexShrink:0,
      }}>
        {player.username[0].toUpperCase()}
        {isActive && <div style={{
          position:'absolute', top:-1, right:-1,
          width:11, height:11, borderRadius:'50%',
          background:'#f0c040', border:'2px solid #1a4528',
        }} />}
      </div>
      <div style={{
        background:'rgba(0,0,0,0.6)', border:'1px solid rgba(212,160,23,0.18)',
        borderRadius:5, padding:'2px 7px', textAlign:'center', maxWidth:85,
      }}>
        <div style={{ fontSize:'0.62rem', color:'#f5f0e8', fontWeight:600, letterSpacing:0.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {isMe ? `${player.username} ★` : player.username}
        </div>
        <div style={{ fontSize:'0.52rem', color:'rgba(212,160,23,0.65)' }}>🎴 {handCount}</div>
      </div>
    </div>
  )
}

// ─── Timer ring ───────────────────────────────────────────────────
function TimerRing({ seconds, total }) {
  const r = 18, stroke = 3
  const circ = 2 * Math.PI * r
  const pct  = seconds / total
  const dash  = circ * pct
  const color = seconds <= 5 ? '#e74c3c' : seconds <= 10 ? '#f39c12' : '#27ae60'

  return (
    <div style={{ position:'relative', width:42, height:42 }}>
      <svg width={42} height={42} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={21} cy={21} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle cx={21} cy={21} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition:'stroke-dasharray 0.5s linear, stroke 0.3s' }} />
      </svg>
      <div style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'0.75rem', fontWeight:700,
        color: seconds <= 5 ? '#e74c3c' : '#f5f0e8',
        fontFamily:'Josefin Sans, sans-serif',
      }}>
        {seconds}
      </div>
    </div>
  )
}

// ─── Dropdown menu ────────────────────────────────────────────────
function Menu({ roomId, soundEnabled, onToggleSound, onLeave }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'absolute', top:10, left:10, zIndex:60 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:40, height:40, borderRadius:9,
        background:'rgba(0,0,0,0.72)', border:'1.5px solid rgba(212,160,23,0.4)',
        color:'#f0c040', fontSize:'1rem', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        boxShadow:'0 3px 10px rgba(0,0,0,0.5)',
      }}>
        {open ? '✕' : '☰'}
      </button>
      {open && (
        <div style={{
          position:'absolute', top:48, left:0,
          background:'rgba(6,16,10,0.97)', border:'1.5px solid rgba(212,160,23,0.3)',
          borderRadius:11, padding:6, minWidth:165,
          boxShadow:'0 10px 36px rgba(0,0,0,0.7)',
          animation:'slideDown 0.15s ease',
        }}>
          <div style={{ padding:'6px 10px 8px', borderBottom:'1px solid rgba(212,160,23,0.12)', marginBottom:4 }}>
            <div style={{ fontSize:'0.56rem', color:'rgba(212,160,23,0.55)', letterSpacing:2, marginBottom:2 }}>KODE MEJA</div>
            <div style={{ fontSize:'0.82rem', color:'#f0c040', fontWeight:700, letterSpacing:2 }}>{roomId}</div>
          </div>
          {[
            { icon: soundEnabled ? '🔊' : '🔇', label: soundEnabled ? 'Suara: ON' : 'Suara: OFF', action: onToggleSound },
            { icon: '←', label: 'Kembali ke Lobby', action: () => { setOpen(false); onLeave() }, danger: true },
          ].map((item,i) => <MItem key={i} {...item} />)}
        </div>
      )}
    </div>
  )
}

function MItem({ icon, label, action, danger }) {
  const [h, setH] = useState(false)
  return (
    <button onClick={action}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display:'flex', alignItems:'center', gap:8, width:'100%',
        background: h ? (danger ? 'rgba(192,57,43,0.18)' : 'rgba(212,160,23,0.08)') : 'transparent',
        border:'none', borderRadius:7, padding:'7px 10px',
        color: danger ? '#e74c3c' : '#f5f0e8',
        cursor:'pointer', fontSize:'0.78rem', letterSpacing:0.5, textAlign:'left',
        transition:'background 0.12s',
      }}>
      <span>{icon}</span><span>{label}</span>
    </button>
  )
}

// ─── Main ────────────────────────────────────────────────────────
export default function GamePage() {
  const router = useRouter()
  const { roomId } = router.query

  const [user, setUser]               = useState(null)
  const [room, setRoom]               = useState(null)
  const [gameState, setGameState]     = useState(null)
  const [myPlayerIdx, setMyPlayerIdx] = useState(-1)
  const [selectedTile, setSelectedTile] = useState(null)
  const [showSide, setShowSide]       = useState(false)
  const [pendingTile, setPendingTile] = useState(null)
  const [notif, setNotif]             = useState(null)
  const [soundOn, setSoundOn]         = useState(true)
  const [timeLeft, setTimeLeft]       = useState(TURN_SECONDS)

  const soundRef   = useRef(true)
  const dragRef    = useRef(null)
  const notifTm    = useRef(null)
  const timerRef   = useRef(null)
  const autoPlayed = useRef(false)   // prevent double auto-play
  const gameRef    = useRef(null)    // always current gameState
  const myIdxRef   = useRef(-1)
  const roomRef    = useRef(null)

  // Keep refs in sync
  useEffect(() => { gameRef.current = gameState }, [gameState])
  useEffect(() => { myIdxRef.current = myPlayerIdx }, [myPlayerIdx])
  useEffect(() => { roomRef.current = room }, [room])

  const snd = useCallback((fn) => { if (soundRef.current) fn() }, [])
  const showNotif = useCallback((msg) => {
    setNotif(msg)
    clearTimeout(notifTm.current)
    notifTm.current = setTimeout(() => setNotif(null), 2800)
  }, [])

  // ── Init ──
  useEffect(() => {
    if (!roomId) return
    supabase.auth.getSession().then(({ data:{ session } }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)
      supabase.from('rooms').select('*').eq('id', roomId).single().then(({ data }) => {
        if (!data) { router.push('/lobby'); return }
        setRoom(data)
        if (data.game_state) setGameState(data.game_state)
        setMyPlayerIdx(data.players?.findIndex(p => p.id === session.user.id) ?? -1)
      })
    })
  }, [roomId])

  // ── Realtime subscription ──
  useEffect(() => {
    if (!roomId || !user) return
    const ch = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`
      }, ({ new: upd }) => {
        setRoom(upd)
        setMyPlayerIdx(upd.players?.findIndex(p => p.id === user.id) ?? -1)

        if (upd.game_state) {
          const prev = gameRef.current
          const myIdx = upd.players?.findIndex(p => p.id === user.id) ?? -1

          // Sounds
          if ((upd.game_state.board?.length||0) > (prev?.board?.length||0)) snd(playCardPlace)
          if (upd.game_state.currentPlayer !== prev?.currentPlayer && upd.game_state.currentPlayer === myIdx) {
            setTimeout(() => snd(playYourTurn), 200)
          }
          if (upd.game_state.winner >= 0 && (prev?.winner ?? -1) < 0) {
            setTimeout(() => snd(upd.game_state.winner === myIdx ? playWin : playLose), 300)
          }

          setGameState(upd.game_state)
          setSelectedTile(null)
          autoPlayed.current = false  // reset auto-play flag on new state
        }
      })
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [roomId, user])

  // ── Turn timer countdown ──
  useEffect(() => {
    if (!gameState || gameState.winner >= 0) {
      clearInterval(timerRef.current)
      return
    }

    // Reset timer when turn changes
    const deadline = gameState.turn_deadline
    if (!deadline) { setTimeLeft(TURN_SECONDS); return }

    clearInterval(timerRef.current)
    autoPlayed.current = false

    timerRef.current = setInterval(() => {
      const now    = Date.now()
      const end    = new Date(deadline).getTime()
      const left   = Math.max(0, Math.ceil((end - now) / 1000))
      setTimeLeft(left)

      // Auto-play when timer hits 0 and it's my turn
      if (left <= 0) {
        clearInterval(timerRef.current)
        const gs     = gameRef.current
        const myIdx  = myIdxRef.current
        const rm     = roomRef.current

        if (gs && myIdx === gs.currentPlayer && !autoPlayed.current) {
          autoPlayed.current = true
          const hand   = gs.hands?.[myIdx] || []
          const valid  = getValidMoves(hand, gs.boardLeft, gs.boardRight, gs.firstMove)

          if (valid.length > 0) {
            // Auto-play first valid card
            executePlay(valid[0], null, gs, myIdx, rm)
          } else {
            // Pass turn (no valid moves)
            passTurn(gs, myIdx, rm)
          }
        }
      }
    }, 500)

    return () => clearInterval(timerRef.current)
  }, [gameState?.turn_deadline, gameState?.currentPlayer])

  // ── Execute play (shared between manual + auto) ──
  const executePlay = useCallback(async (tile, side, gs, myIdx, rm) => {
    if (!gs || myIdx !== gs.currentPlayer) return

    const canL = tile.left === gs.boardLeft || tile.right === gs.boardLeft
    const canR = tile.left === gs.boardRight || tile.right === gs.boardRight

    let s = side
    if (!gs.firstMove && s === null) {
      if (canL && !canR) s = 'left'
      else if (!canL && canR) s = 'right'
      else if (canL && canR) s = 'left'  // auto-play: pick left
    }

    const { newLeft, newRight } = placeTile(tile, s || 'right', gs.boardLeft, gs.boardRight, gs.firstMove)
    const newHands = gs.hands.map((h, i) => i === myIdx ? h.filter(t => t.id !== tile.id) : h)
    const newBoard = [...(gs.board || []), { ...tile, side: s }]
    const players  = rm?.players || []
    const next     = (gs.currentPlayer + 1) % Math.max(players.length, 1)

    let winner = checkWinner(newHands)
    let blocked = false
    if (winner === -1) {
      blocked = isBlocked(newHands, newLeft, newRight)
      if (blocked) winner = newHands.map(countPips).indexOf(Math.min(...newHands.map(countPips)))
    }

    const newDeadline = new Date(Date.now() + TURN_SECONDS * 1000).toISOString()

    await supabase.from('rooms').update({
      game_state: {
        ...gs,
        hands: newHands, board: newBoard,
        boardLeft: newLeft, boardRight: newRight,
        currentPlayer: winner >= 0 ? gs.currentPlayer : next,
        firstMove: false, winner, blocked,
        turn_deadline: winner >= 0 ? null : newDeadline,
        lastAction: { player: myIdx, tile: tile.id, side: s }
      },
      status: winner >= 0 ? 'finished' : 'playing'
    }).eq('id', rm?.id || '')

    setSelectedTile(null)
    setShowSide(false)
    setPendingTile(null)
  }, [])

  // ── Pass turn (no valid moves) ──
  const passTurn = useCallback(async (gs, myIdx, rm) => {
    const players  = rm?.players || []
    const next     = (gs.currentPlayer + 1) % Math.max(players.length, 1)
    const newDeadline = new Date(Date.now() + TURN_SECONDS * 1000).toISOString()

    await supabase.from('rooms').update({
      game_state: {
        ...gs,
        currentPlayer: next,
        turn_deadline: newDeadline,
        lastAction: { player: myIdx, tile: null, side: null, passed: true }
      }
    }).eq('id', rm?.id || '')

    showNotif('Tidak ada kartu yang bisa dimainkan. Giliran dilewati!')
  }, [showNotif])

  const isMyTurn   = gameState && myPlayerIdx === gameState.currentPlayer
  const myHand     = gameState?.hands?.[myPlayerIdx] || []
  const players    = room?.players || []
  const validMoves = isMyTurn
    ? getValidMoves(myHand, gameState.boardLeft, gameState.boardRight, gameState.firstMove)
    : []

  // ── Manual tile select ──
  const handleSelect = (tile) => {
    resumeAudio()
    if (!isMyTurn) { showNotif('Bukan giliran kamu!'); snd(playInvalid); return }
    if (!validMoves.find(t => t.id === tile.id)) { showNotif('Kartu tidak bisa dimainkan!'); snd(playInvalid); return }

    if (selectedTile?.id === tile.id) {
      // Double click = play
      doPlay(tile, null)
    } else {
      setSelectedTile(tile)
    }
  }

  const doPlay = (tile, side) => {
    const gs = gameRef.current
    const myIdx = myIdxRef.current
    const rm = roomRef.current

    // Check side needed
    const canL = tile.left === gs.boardLeft || tile.right === gs.boardLeft
    const canR = tile.left === gs.boardRight || tile.right === gs.boardRight

    if (!gs.firstMove && side === null && canL && canR) {
      setPendingTile(tile)
      setShowSide(true)
      return
    }
    executePlay(tile, side, gs, myIdx, rm)
  }

  const backToLobby = async () => {
    clearInterval(timerRef.current)
    if (!user || !room) return
    const np = room.players.filter(p => p.id !== user.id)
    if (np.length === 0) await supabase.from('rooms').delete().eq('id', roomId)
    else await supabase.from('rooms').update({ players: np }).eq('id', roomId)
    router.push('/lobby')
  }

  const startGame = async () => {
    if (!room || room.players.length < 2) { showNotif('Butuh minimal 2 pemain!'); return }
    const state = createInitialState(room.players.map(p => p.id))
    const deadline = new Date(Date.now() + TURN_SECONDS * 1000).toISOString()
    await supabase.from('rooms').update({
      status: 'playing',
      game_state: { ...state, turn_deadline: deadline }
    }).eq('id', roomId)
  }

  const resetGame = async () => {
    const state = createInitialState(players.map(p => p.id))
    const deadline = new Date(Date.now() + TURN_SECONDS * 1000).toISOString()
    await supabase.from('rooms').update({
      status: 'playing',
      game_state: { ...state, turn_deadline: deadline }
    }).eq('id', roomId)
  }

  // Display order: 0=me(bottom), 1=left, 2=top, 3=right
  const dp      = (slot) => myPlayerIdx < 0 ? players[slot]||null : players[(myPlayerIdx+slot) % Math.max(players.length,1)] || null
  const dpIdx   = (slot) => (myPlayerIdx+slot) % Math.max(players.length, 1)
  const hCount  = (slot) => gameState?.hands?.[dpIdx(slot)]?.length || 0
  const isAct   = (slot) => gameState?.currentPlayer === dpIdx(slot)

  if (!room) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0d1f13' }}>
      <div className="spinner" />
    </div>
  )

  // ── WAITING ROOM ──
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
                <p style={{ color:'rgba(245,240,232,0.5)', fontSize:'0.8rem', letterSpacing:2 }}>
                  MENUNGGU PEMAIN ({players.length}/4)
                </p>
                <div className="waiting-seats">
                  {Array.from({ length:4 }).map((_,i) => {
                    const p = players[i]
                    return (
                      <div key={i} className={`waiting-seat ${p ? 'filled' : ''}`}>
                        <div className="seat-avatar">{p ? p.username[0].toUpperCase() : '?'}</div>
                        <span>{p ? p.username : 'Kosong'}</span>
                      </div>
                    )
                  })}
                </div>
                {isHost && players.length >= 2
                  ? <button className="btn-primary" style={{ width:200 }} onClick={startGame}>Mulai Permainan</button>
                  : isHost
                    ? <p style={{ color:'rgba(245,240,232,0.4)', fontSize:'0.8rem' }}>Butuh minimal 2 pemain</p>
                    : <><div className="spinner" /><p style={{ color:'rgba(245,240,232,0.4)', fontSize:'0.8rem', marginTop:8 }}>Menunggu host memulai...</p></>
                }
                <button className="btn-secondary" style={{ width:160, fontSize:'0.75rem' }} onClick={backToLobby}>
                  Tinggalkan Meja
                </button>
                <div style={{ background:'rgba(0,0,0,0.4)', borderRadius:8, padding:'8px 16px', color:'rgba(245,240,232,0.4)', fontSize:'0.7rem', letterSpacing:2 }}>
                  KODE: <strong style={{ color:'var(--gold)' }}>{roomId}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  const board      = gameState.board || []
  const isGameOver = gameState.winner >= 0
  const winnerP    = isGameOver ? players[gameState.winner] : null
  const iWin       = isGameOver && gameState.winner === myPlayerIdx
  const activeUser = players[gameState.currentPlayer]?.username || ''

  return (
    <>
      <Head><title>🎴 Gaple – {roomId}</title></Head>
      <div className="game-wrapper">
        <div className="game-table-outer">
          <div className="game-table-inner">

            {/* ── Menu dropdown ── */}
            <Menu
              roomId={roomId}
              soundEnabled={soundOn}
              onToggleSound={() => { const n=!soundOn; setSoundOn(n); soundRef.current=n }}
              onLeave={backToLobby}
            />

            {/* ── Turn info + timer top center ── */}
            <div style={{
              position:'absolute', top:10, left:'50%', transform:'translateX(-50%)',
              display:'flex', alignItems:'center', gap:10, zIndex:20,
            }}>
              <div style={{
                background:'rgba(0,0,0,0.7)', border:'1px solid rgba(212,160,23,0.3)',
                borderRadius:20, padding:'5px 16px',
                fontSize:'0.7rem', letterSpacing:2, whiteSpace:'nowrap',
                color: isMyTurn ? '#f0c040' : 'rgba(245,240,232,0.65)',
                fontWeight: isMyTurn ? 700 : 400,
              }}>
                {isMyTurn ? '⭐ GILIRAN KAMU' : `🎴 Giliran: ${activeUser}`}
              </div>
              {!isGameOver && (
                <TimerRing seconds={timeLeft} total={TURN_SECONDS} />
              )}
            </div>

            {/* ── TOP player ── */}
            <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:10,
              display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <Avatar player={dp(2)} isActive={isAct(2)} handCount={hCount(2)} isMe={false} />
              {dp(2) && <TileBack count={hCount(2)} horizontal={true} />}
            </div>

            {/* ── LEFT player ── */}
            <div style={{ position:'absolute', left:6, top:'50%', transform:'translateY(-50%)', zIndex:10,
              display:'flex', flexDirection:'row', alignItems:'center', gap:5 }}>
              <Avatar player={dp(1)} isActive={isAct(1)} handCount={hCount(1)} isMe={false} />
              {dp(1) && <TileBack count={hCount(1)} horizontal={false} />}
            </div>

            {/* ── RIGHT player ── */}
            <div style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', zIndex:10,
              display:'flex', flexDirection:'row-reverse', alignItems:'center', gap:5 }}>
              <Avatar player={dp(3)} isActive={isAct(3)} handCount={hCount(3)} isMe={false} />
              {dp(3) && <TileBack count={hCount(3)} horizontal={false} />}
            </div>

            {/* ── Board chain ── */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (dragRef.current) { doPlay(dragRef.current, null); dragRef.current=null } }}
              style={{
                position:'absolute',
                top:'22%', bottom:'24%',
                left:'14%', right:'14%',
                display:'flex',
                flexWrap:'wrap',
                alignItems:'center',
                justifyContent:'center',
                alignContent:'center',
                gap:3, overflow:'hidden',
              }}
            >
              {board.length === 0 ? (
                <div style={{
                  color:'rgba(212,160,23,0.18)', fontSize:'0.72rem',
                  letterSpacing:3, textTransform:'uppercase',
                  textAlign:'center', lineHeight:2.5,
                }}>
                  {isMyTurn ? 'Pilih kartu → klik 2x atau drag ke sini' : 'Menunggu kartu pertama...'}
                </div>
              ) : (
                board.map((tile, i) => (
                  <BoardTile key={`${tile.id}-${i}`} tile={tile} horizontal={i % 4 !== 0} />
                ))
              )}
            </div>

            {/* Drop zones */}
            <div onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,'left');dragRef.current=null}}}
              style={{position:'absolute',left:0,top:'22%',bottom:'24%',width:'14%',zIndex:5}}/>
            <div onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,'right');dragRef.current=null}}}
              style={{position:'absolute',right:0,top:'22%',bottom:'24%',width:'14%',zIndex:5}}/>

            {/* Board end values */}
            {board.length > 0 && (
              <>
                <div style={{ position:'absolute', left:'15%', top:'50%', transform:'translateY(-50%)',
                  background:'rgba(0,0,0,0.65)', border:'1px solid rgba(212,160,23,0.25)',
                  borderRadius:7, padding:'3px 8px', fontSize:'0.68rem', color:'#f0c040', letterSpacing:1, zIndex:6 }}>
                  ←  {gameState.boardLeft}
                </div>
                <div style={{ position:'absolute', right:'15%', top:'50%', transform:'translateY(-50%)',
                  background:'rgba(0,0,0,0.65)', border:'1px solid rgba(212,160,23,0.25)',
                  borderRadius:7, padding:'3px 8px', fontSize:'0.68rem', color:'#f0c040', letterSpacing:1, zIndex:6 }}>
                  {gameState.boardRight}  →
                </div>
              </>
            )}

            {/* ── MY hand ── */}
            <div style={{
              position:'absolute', bottom:0, left:0, right:0,
              display:'flex', flexDirection:'column', alignItems:'center',
              gap:3, padding:'0 6px 5px', zIndex:20,
            }}>
              <Avatar player={dp(0)} isActive={isMyTurn} handCount={myHand.length} isMe={true} />
              <div style={{
                display:'flex', gap:5, alignItems:'flex-end',
                overflowX:'auto', padding:'2px 8px 0',
                maxWidth:'100%', flexWrap:'nowrap',
              }}>
                {myHand.map(tile => (
                  <HandTile
                    key={tile.id}
                    tile={tile}
                    selected={selectedTile?.id === tile.id}
                    validMove={!!validMoves.find(t => t.id === tile.id)}
                    isMyTurn={isMyTurn}
                    onClick={handleSelect}
                    onDragStart={(e, t) => { dragRef.current=t; setSelectedTile(t) }}
                    onDragEnd={() => { dragRef.current=null }}
                  />
                ))}
              </div>
            </div>

            {/* Watermark */}
            <div style={{
              position:'absolute', top:'50%', left:'50%',
              transform:'translate(-50%,-50%)',
              color:'rgba(212,160,23,0.06)', fontSize:'1.8rem',
              fontFamily:'Playfair Display,serif', fontWeight:900, letterSpacing:8,
              pointerEvents:'none', userSelect:'none', zIndex:1,
            }}>GAPLE</div>

          </div>
        </div>

        {/* ── Side selector ── */}
        {showSide && pendingTile && (
          <div style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.78)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:100, flexDirection:'column', gap:20,
          }}>
            <div style={{ color:'#f0c040', fontSize:'0.75rem', letterSpacing:3 }}>TARUH DI SISI MANA?</div>
            <div style={{ display:'flex', gap:24, alignItems:'center' }}>
              <button onClick={() => executePlay(pendingTile,'left',gameRef.current,myIdxRef.current,roomRef.current)} style={sideBtn}>
                ← KIRI<br/><span style={{ fontSize:'1.4rem', color:'#f0c040' }}>{gameState.boardLeft}</span>
              </button>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <div style={{
                  width:44, height:80, background:'#fffef8', borderRadius:7,
                  border:'2px solid #f0c040',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between',
                  padding:'3px 2px',
                  boxShadow:'0 0 0 4px rgba(240,192,64,0.2)',
                }}>
                  <div style={{ width:'100%', flex:1 }}><PipFace val={pendingTile.left} /></div>
                  <div style={{ width:'75%', height:1.5, background:'#444' }} />
                  <div style={{ width:'100%', flex:1 }}><PipFace val={pendingTile.right} /></div>
                </div>
                <button onClick={() => { setShowSide(false); setPendingTile(null) }}
                  style={{ background:'none', border:'none', color:'rgba(245,240,232,0.4)', cursor:'pointer', fontSize:'0.72rem' }}>
                  Batal
                </button>
              </div>
              <button onClick={() => executePlay(pendingTile,'right',gameRef.current,myIdxRef.current,roomRef.current)} style={sideBtn}>
                KANAN →<br/><span style={{ fontSize:'1.4rem', color:'#f0c040' }}>{gameState.boardRight}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Game over ── */}
        {isGameOver && (
          <div className="modal-overlay">
            <div className="modal">
              <div style={{ fontSize:'3rem', marginBottom:12 }}>{iWin ? '🏆' : '😔'}</div>
              <h2 className="modal-title">{iWin ? 'MENANG!' : 'KALAH'}</h2>
              <p className="modal-subtitle">
                {gameState.blocked ? 'Permainan buntu! ' : ''}{winnerP?.username} menang!
              </p>
              {players[0]?.id === user?.id && (
                <button className="btn-primary" onClick={resetGame} style={{ marginBottom:12 }}>Main Lagi</button>
              )}
              <button className="btn-secondary" onClick={backToLobby}>Kembali ke Lobby</button>
            </div>
          </div>
        )}

        {/* ── Chat ── */}
        <ChatPanel roomId={roomId} user={user} players={players} />

        {/* ── Notification ── */}
        {notif && <div className="notification">{notif}</div>}
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity:0; transform:translateY(-10px) }
          to   { opacity:1; transform:translateY(0) }
        }
        @keyframes pulse-ring {
          0%,100% { box-shadow: 0 0 0 4px rgba(240,192,64,0.25), 0 4px 14px rgba(0,0,0,0.5); }
          50%      { box-shadow: 0 0 0 8px rgba(240,192,64,0.1),  0 4px 14px rgba(0,0,0,0.5); }
        }
        @keyframes valid-glow {
          from { box-shadow: 0 0 0 2px rgba(39,174,96,0.4), 0 4px 10px rgba(0,0,0,0.4); }
          to   { box-shadow: 0 0 0 4px rgba(39,174,96,0.65),0 4px 10px rgba(0,0,0,0.4); }
        }
      `}</style>
    </>
  )
}

const sideBtn = {
  background:'rgba(6,16,10,0.96)',
  border:'2px solid rgba(212,160,23,0.5)',
  borderRadius:12, padding:'18px 26px',
  color:'rgba(245,240,232,0.8)',
  fontFamily:'Josefin Sans,sans-serif',
  fontSize:'0.85rem', letterSpacing:2,
  cursor:'pointer', textAlign:'center', lineHeight:1.9,
}
