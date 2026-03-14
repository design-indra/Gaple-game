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
import { getProfiles, processGameCoins, formatCoins } from '../../lib/coins'

const TURN_SECONDS = 15

// ─── Pip SVG ──────────────────────────────────────────────────────
const PIP_POS = {
  0: [],
  1: [[50,50]],
  2: [[30,30],[70,70]],
  3: [[30,30],[50,50],[70,70]],
  4: [[30,30],[70,30],[30,70],[70,70]],
  5: [[30,30],[70,30],[50,50],[30,70],[70,70]],
  6: [[30,22],[70,22],[30,50],[70,50],[30,78],[70,78]],
}

function PipFace({ val }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display:'block' }}>
      {(PIP_POS[val]||[]).map(([cx,cy],i) =>
        <circle key={i} cx={cx} cy={cy} r={11} fill="#c0392b" />
      )}
    </svg>
  )
}

// ─── Kartu di tangan (besar, bisa diklik) ────────────────────────
function HandCard({ tile, selected, valid, myTurn, onClick, onDragStart, onDragEnd }) {
  const canPlay = myTurn && valid
  return (
    <div
      draggable={canPlay}
      onDragStart={e => onDragStart?.(e, tile)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(tile)}
      style={{
        width: 42, height: 76,
        background: 'linear-gradient(160deg,#fff 60%,#f5f0e0)',
        borderRadius: 7,
        border: selected ? '2.5px solid #f0c040'
               : canPlay  ? '2px solid #27ae60'
               : '1.5px solid #ccc',
        display: 'flex', flexDirection: 'column',
        padding: '3px 2px',
        cursor: canPlay ? 'pointer' : 'default',
        opacity: myTurn && !valid ? 0.4 : 1,
        transform: selected ? 'translateY(-18px) scale(1.06)'
                 : canPlay  ? 'translateY(-7px)' : 'none',
        transition: 'all 0.15s',
        boxShadow: selected
          ? '0 0 0 3px rgba(240,192,64,0.5), 0 12px 24px rgba(0,0,0,0.4)'
          : canPlay
            ? '0 0 0 2px rgba(39,174,96,0.4), 0 4px 12px rgba(0,0,0,0.25)'
            : '2px 3px 8px rgba(0,0,0,0.25)',
        flexShrink: 0, userSelect: 'none',
        animation: canPlay && !selected ? 'valid-glow 0.9s ease infinite alternate' : 'none',
      }}
    >
      <div style={{ flex:1 }}><PipFace val={tile.left} /></div>
      <div style={{ height:1.5, background:'#aaa', margin:'0 4px' }} />
      <div style={{ flex:1 }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Kartu di meja (kecil) ────────────────────────────────────────
function BoardCard({ tile, horiz }) {
  const w = horiz ? 44 : 24, h = horiz ? 24 : 44
  return (
    <div style={{
      width:w, height:h,
      background: 'linear-gradient(160deg,#fff 60%,#f5f0e0)',
      borderRadius: 3,
      border: '1px solid #bbb',
      display: 'flex',
      flexDirection: horiz ? 'row' : 'column',
      padding: '1px',
      boxShadow: '1px 2px 4px rgba(0,0,0,0.2)',
      flexShrink: 0,
    }}>
      <div style={{ flex:1 }}><PipFace val={tile.left} /></div>
      <div style={{
        [horiz?'width':'height']: 1.5,
        [horiz?'height':'width']: '80%',
        background: '#aaa', flexShrink:0, alignSelf:'center',
      }} />
      <div style={{ flex:1 }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Kartu tertutup (lawan) ───────────────────────────────────────
function CardBack({ horiz, small }) {
  const w = small ? (horiz?36:20) : (horiz?44:24)
  const h = small ? (horiz?20:36) : (horiz?24:44)
  return (
    <div style={{
      width:w, height:h,
      borderRadius: 3,
      background: 'linear-gradient(135deg,#1e3a8a,#3b6fd4)',
      border: '1px solid rgba(255,255,255,0.3)',
      boxShadow: '1px 2px 4px rgba(0,0,0,0.3)',
      flexShrink: 0,
      backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.05) 0,rgba(255,255,255,0.05) 2px,transparent 2px,transparent 8px)',
    }} />
  )
}

// ─── Avatar bulat pemain ──────────────────────────────────────────
const GRAD = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#11998e,#38ef7d)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
]

function Avatar({ player, isActive, handCount, coins, isMe, size=52 }) {
  if (!player) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <div style={{
        width:size, height:size, borderRadius:'50%',
        border:'2px dashed rgba(255,255,255,0.2)',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:'1.2rem', color:'rgba(255,255,255,0.2)',
      }}>?</div>
    </div>
  )

  const gi = player.username.charCodeAt(0) % 4

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <div style={{ position:'relative' }}>
        <div style={{
          width:size, height:size, borderRadius:'50%',
          background: GRAD[gi],
          border: isActive ? '3px solid #f0c040' : '2.5px solid rgba(255,255,255,0.4)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize: size > 44 ? '1.4rem' : '1rem',
          fontWeight: 800, color:'#fff',
          fontFamily:'Playfair Display, serif',
          boxShadow: isActive
            ? '0 0 0 4px rgba(240,192,64,0.3), 0 4px 14px rgba(0,0,0,0.4)'
            : '0 3px 10px rgba(0,0,0,0.3)',
          animation: isActive ? 'pulse-ring 1.5s ease infinite' : 'none',
          transition: 'border 0.2s',
        }}>
          {player.username[0].toUpperCase()}
        </div>
        {/* Active dot */}
        {isActive && (
          <div style={{
            position:'absolute', top:0, right:0,
            width:12, height:12, borderRadius:'50%',
            background:'#f0c040', border:'2px solid #2d5a1b',
          }} />
        )}
        {/* Hand count badge */}
        <div style={{
          position:'absolute', bottom:-2, right:-4,
          background:'#c0392b', color:'#fff',
          borderRadius:8, padding:'0 4px',
          fontSize:'0.55rem', fontWeight:700,
          border:'1.5px solid #fff', minWidth:16, textAlign:'center',
        }}>
          {handCount}
        </div>
      </div>

      {/* Name */}
      <div style={{
        fontSize:'0.6rem',
        color: isActive ? '#f0c040' : 'rgba(255,255,255,0.85)',
        fontWeight: isActive ? 700 : 400,
        textShadow:'0 1px 3px rgba(0,0,0,0.8)',
        maxWidth: 72, textAlign:'center',
        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
      }}>
        {isMe ? `${player.username} ★` : player.username}
      </div>

      {/* Coins */}
      {coins > 0 && (
        <div style={{
          fontSize:'0.55rem', color:'#f0c040',
          background:'rgba(0,0,0,0.5)',
          borderRadius:8, padding:'1px 6px',
          letterSpacing:0.5,
        }}>
          🪙 {formatCoins(coins)}
        </div>
      )}
    </div>
  )
}

// ─── Timer bar ────────────────────────────────────────────────────
function TimerBar({ secs, total }) {
  const pct = (secs / total) * 100
  const color = secs <= 5 ? '#e74c3c' : secs <= 10 ? '#f39c12' : '#27ae60'
  return (
    <div style={{ width:'100%', height:4, background:'rgba(255,255,255,0.1)', borderRadius:2 }}>
      <div style={{
        width:`${pct}%`, height:'100%',
        background: color, borderRadius:2,
        transition:'width 0.5s linear, background 0.3s',
      }} />
    </div>
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
  const [selected, setSelected]       = useState(null)
  const [showSide, setShowSide]       = useState(false)
  const [pendingTile, setPendingTile] = useState(null)
  const [notif, setNotif]             = useState(null)
  const [soundOn, setSoundOn]         = useState(true)
  const [timeLeft, setTimeLeft]       = useState(TURN_SECONDS)
  const [chatOpen, setChatOpen]       = useState(false)
  const [profiles, setProfiles]       = useState({})
  const [coinsAwarded, setCoinsAwarded] = useState(false)
  const [menuOpen, setMenuOpen]       = useState(false)

  const soundRef   = useRef(true)
  const dragRef    = useRef(null)
  const notifTm    = useRef(null)
  const timerRef   = useRef(null)
  const autoPlayed = useRef(false)
  const gsRef      = useRef(null)
  const myIdxRef   = useRef(-1)
  const roomRef    = useRef(null)

  useEffect(() => { gsRef.current = gameState }, [gameState])
  useEffect(() => { myIdxRef.current = myPlayerIdx }, [myPlayerIdx])
  useEffect(() => { roomRef.current = room }, [room])

  const snd = useCallback((fn) => { if (soundRef.current) fn() }, [])
  const showNotif = useCallback((msg) => {
    setNotif(msg); clearTimeout(notifTm.current)
    notifTm.current = setTimeout(() => setNotif(null), 2800)
  }, [])

  // ── Init ──
  useEffect(() => {
    if (!roomId) return
    supabase.auth.getSession().then(({ data:{session} }) => {
      if (!session) { router.push('/'); return }
      setUser(session.user)
      supabase.from('rooms').select('*').eq('id',roomId).single().then(async ({data}) => {
        if (!data) { router.push('/lobby'); return }
        setRoom(data)
        if (data.game_state) setGameState(data.game_state)
        setMyPlayerIdx(data.players?.findIndex(p=>p.id===session.user.id)??-1)
        if (data.players?.length) {
          const profs = await getProfiles(data.players.map(p=>p.id))
          const map = {}; profs.forEach(p => { map[p.id] = p }); setProfiles(map)
        }
      })
    })
  }, [roomId])

  // ── Realtime ──
  useEffect(() => {
    if (!roomId||!user) return
    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},
        async ({new:upd}) => {
          setRoom(upd)
          const myIdx = upd.players?.findIndex(p=>p.id===user.id)??-1
          setMyPlayerIdx(myIdx)
          if (upd.players?.length) {
            const profs = await getProfiles(upd.players.map(p=>p.id))
            const map = {}; profs.forEach(p => { map[p.id] = p }); setProfiles(map)
          }
          if (upd.game_state) {
            const prev = gsRef.current
            if ((upd.game_state.board?.length||0)>(prev?.board?.length||0)) snd(playCardPlace)
            if (upd.game_state.currentPlayer!==prev?.currentPlayer && upd.game_state.currentPlayer===myIdx)
              setTimeout(()=>snd(playYourTurn),200)
            if (upd.game_state.winner>=0&&(prev?.winner??-1)<0) {
              setTimeout(()=>snd(upd.game_state.winner===myIdx?playWin:playLose),300)
              if (upd.game_state.winner===myIdx && !coinsAwarded) {
                setCoinsAwarded(true)
                await processGameCoins(upd.players, upd.game_state.winner, roomId)
                const profs = await getProfiles([user.id])
                if (profs[0]) setProfiles(p => ({...p,[user.id]:profs[0]}))
              }
            }
            setGameState(upd.game_state)
            setSelected(null)
            autoPlayed.current = false
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [roomId, user])

  // ── Timer ──
  useEffect(() => {
    if (!gameState||gameState.winner>=0) { clearInterval(timerRef.current); return }
    const deadline = gameState.turn_deadline
    if (!deadline) { setTimeLeft(TURN_SECONDS); return }
    clearInterval(timerRef.current); autoPlayed.current=false
    timerRef.current = setInterval(() => {
      const left = Math.max(0,Math.ceil((new Date(deadline)-Date.now())/1000))
      setTimeLeft(left)
      if (left<=0) {
        clearInterval(timerRef.current)
        const gs=gsRef.current,mi=myIdxRef.current,rm=roomRef.current
        if (gs&&mi===gs.currentPlayer&&!autoPlayed.current) {
          autoPlayed.current=true
          const valid=getValidMoves(gs.hands?.[mi]||[],gs.boardLeft,gs.boardRight,gs.firstMove)
          if (valid.length>0) execPlay(valid[0],null,gs,mi,rm)
          else passTurn(gs,mi,rm)
        }
      }
    },500)
    return ()=>clearInterval(timerRef.current)
  },[gameState?.turn_deadline,gameState?.currentPlayer])

  const execPlay = useCallback(async (tile,side,gs,mi,rm) => {
    if (!gs||mi!==gs.currentPlayer) return
    const canL=tile.left===gs.boardLeft||tile.right===gs.boardLeft
    const canR=tile.left===gs.boardRight||tile.right===gs.boardRight
    let s=side
    if (!gs.firstMove&&s===null) {
      if (canL&&!canR) s='left'
      else if (!canL&&canR) s='right'
      else s='left'
    }
    const {newLeft,newRight}=placeTile(tile,s||'right',gs.boardLeft,gs.boardRight,gs.firstMove)
    const newHands=gs.hands.map((h,i)=>i===mi?h.filter(t=>t.id!==tile.id):h)
    const newBoard=[...(gs.board||[]),{...tile,side:s}]
    const plen=rm?.players?.length||1
    const next=(gs.currentPlayer+1)%plen
    let winner=checkWinner(newHands),blocked=false
    if (winner===-1){blocked=isBlocked(newHands,newLeft,newRight);if(blocked)winner=newHands.map(countPips).indexOf(Math.min(...newHands.map(countPips)))}
    const deadline=new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    snd(playCardPlace)
    await supabase.from('rooms').update({
      game_state:{...gs,hands:newHands,board:newBoard,boardLeft:newLeft,boardRight:newRight,
        currentPlayer:winner>=0?gs.currentPlayer:next,firstMove:false,winner,blocked,
        turn_deadline:winner>=0?null:deadline,lastAction:{player:mi,tile:tile.id,side:s}},
      status:winner>=0?'finished':'playing'
    }).eq('id',rm?.id||'')
    setSelected(null);setShowSide(false);setPendingTile(null)
  },[snd])

  const passTurn = useCallback(async (gs,mi,rm) => {
    const next=(gs.currentPlayer+1)%Math.max(rm?.players?.length||1,1)
    const deadline=new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    await supabase.from('rooms').update({
      game_state:{...gs,currentPlayer:next,turn_deadline:deadline,lastAction:{player:mi,passed:true}}
    }).eq('id',rm?.id||'')
    showNotif('Tidak ada kartu valid. Giliran dilewati!')
  },[showNotif])

  const players   = room?.players||[]
  const isMyTurn  = gameState&&myPlayerIdx===gameState.currentPlayer
  const myHand    = gameState?.hands?.[myPlayerIdx]||[]
  const validMoves= isMyTurn?getValidMoves(myHand,gameState.boardLeft,gameState.boardRight,gameState.firstMove):[]

  const handleSelect = (tile) => {
    resumeAudio()
    if (!isMyTurn){showNotif('Bukan giliran kamu!');snd(playInvalid);return}
    if (!validMoves.find(t=>t.id===tile.id)){showNotif('Kartu tidak bisa dimainkan!');snd(playInvalid);return}
    if (selected?.id===tile.id) doPlay(tile,null)
    else setSelected(tile)
  }

  const doPlay=(tile,side)=>{
    const gs=gsRef.current,mi=myIdxRef.current,rm=roomRef.current
    const canL=tile.left===gs.boardLeft||tile.right===gs.boardLeft
    const canR=tile.left===gs.boardRight||tile.right===gs.boardRight
    if (!gs.firstMove&&side===null&&canL&&canR){setPendingTile(tile);setShowSide(true);return}
    execPlay(tile,side,gs,mi,rm)
  }

  const backToLobby=async()=>{
    clearInterval(timerRef.current)
    if (!user||!room)return
    const np=room.players.filter(p=>p.id!==user.id)
    if (np.length===0) await supabase.from('rooms').delete().eq('id',roomId)
    else await supabase.from('rooms').update({players:np}).eq('id',roomId)
    router.push('/lobby')
  }

  const startGame=async()=>{
    if (!room||room.players.length<2){showNotif('Butuh minimal 2 pemain!');return}
    const state=createInitialState(room.players.map(p=>p.id))
    const deadline=new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    await supabase.from('rooms').update({status:'playing',game_state:{...state,turn_deadline:deadline}}).eq('id',roomId)
  }

  const resetGame=async()=>{
    setCoinsAwarded(false)
    const state=createInitialState(players.map(p=>p.id))
    const deadline=new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    await supabase.from('rooms').update({status:'playing',game_state:{...state,turn_deadline:deadline}}).eq('id',roomId)
  }

  // Slot display: 0=me(bawah), 1=kiri, 2=atas, 3=kanan
  const dp    = s => myPlayerIdx<0?players[s]||null:players[(myPlayerIdx+s)%Math.max(players.length,1)]||null
  const dpIdx = s => (myPlayerIdx+s)%Math.max(players.length,1)
  const hc    = s => gameState?.hands?.[dpIdx(s)]?.length||0
  const ia    = s => gameState?.currentPlayer===dpIdx(s)
  const pc    = s => { const p=dp(s); return p?profiles[p.id]?.coins??0:0 }

  if (!room) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#1a3d0a'}}>
      <div className="spinner"/>
    </div>
  )

  // ── WAITING ROOM ──
  if (!gameState||room.status==='waiting') {
    const isHost=players[0]?.id===user?.id
    return (
      <>
        <Head><title>Meja {roomId} – Gaple</title></Head>
        <div style={{
          width:'100vw', height:'100vh',
          background:'radial-gradient(ellipse at center,#2d5a1b 0%,#1a3d0a 100%)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:16,
        }}>
          <div style={{
            background:'rgba(0,0,0,0.75)', border:'1.5px solid rgba(212,160,23,0.4)',
            borderRadius:20, padding:'32px 24px', textAlign:'center',
            width:'100%', maxWidth:380,
          }}>
            <div style={{fontSize:'1.8rem',fontFamily:'Playfair Display,serif',color:'#f0c040',marginBottom:6}}>🎴 Gaple Online</div>
            <div style={{fontSize:'0.7rem',color:'rgba(245,240,232,0.4)',letterSpacing:2,marginBottom:4}}>KODE MEJA</div>
            <div style={{fontSize:'1.2rem',color:'#f0c040',fontWeight:700,letterSpacing:4,marginBottom:20}}>{roomId}</div>
            <div style={{color:'rgba(245,240,232,0.5)',fontSize:'0.75rem',letterSpacing:2,marginBottom:16}}>PEMAIN ({players.length}/4)</div>
            <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:24,flexWrap:'wrap'}}>
              {Array.from({length:4}).map((_,i)=>{
                const p=players[i]
                return (
                  <div key={i} style={{
                    width:64,height:64,borderRadius:12,
                    border:p?'2px solid #f0c040':'2px dashed rgba(212,160,23,0.3)',
                    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,
                    background:p?'rgba(212,160,23,0.1)':'transparent',
                  }}>
                    <div style={{fontSize:'1.2rem',fontWeight:700,color:p?'#f0c040':'rgba(212,160,23,0.3)',fontFamily:'Playfair Display,serif'}}>{p?p.username[0].toUpperCase():'?'}</div>
                    <div style={{fontSize:'0.5rem',color:p?'rgba(245,240,232,0.7)':'rgba(245,240,232,0.25)',letterSpacing:0.5,maxWidth:58,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p?p.username:'Kosong'}</div>
                  </div>
                )
              })}
            </div>
            {isHost&&players.length>=2
              ?<button className="btn-primary" style={{width:'100%',marginBottom:10}} onClick={startGame}>▶ Mulai Permainan</button>
              :isHost
                ?<p style={{color:'rgba(245,240,232,0.4)',fontSize:'0.8rem',marginBottom:10}}>Butuh minimal 2 pemain</p>
                :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,marginBottom:10}}><div className="spinner"/><p style={{color:'rgba(245,240,232,0.4)',fontSize:'0.8rem'}}>Menunggu host memulai...</p></div>
            }
            <button className="btn-secondary" style={{width:'100%',fontSize:'0.75rem'}} onClick={backToLobby}>← Tinggalkan Meja</button>
          </div>
        </div>
      </>
    )
  }

  const board  = gameState.board||[]
  const isOver = gameState.winner>=0
  const winnerP= isOver?players[gameState.winner]:null
  const iWin   = isOver&&gameState.winner===myPlayerIdx
  const actUser= players[gameState.currentPlayer]?.username||''

  return (
    <>
      <Head><title>🎴 Gaple – {roomId}</title></Head>

      {/* ═══ FULL SCREEN MOBILE LAYOUT ═══ */}
      <div style={{
        width:'100vw', height:'100vh',
        background:'radial-gradient(ellipse at center,#3a7d1e 0%,#2d5a1b 40%,#1a3d0a 100%)',
        display:'flex', flexDirection:'column',
        overflow:'hidden', position:'fixed',
        top:0, left:0, right:0, bottom:0,
        fontFamily:'Josefin Sans, sans-serif',
      }}>

        {/* ── TOP BAR ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 12px 4px',
          background:'rgba(0,0,0,0.3)',
          borderBottom:'1px solid rgba(255,255,255,0.06)',
          flexShrink:0, zIndex:30,
        }}>
          {/* Menu button */}
          <button onClick={()=>setMenuOpen(o=>!o)} style={{
            width:36,height:36,borderRadius:9,
            background:'rgba(0,0,0,0.5)',border:'1px solid rgba(255,255,255,0.15)',
            color:'#fff',fontSize:'1rem',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>{menuOpen?'✕':'☰'}</button>

          {/* Turn indicator */}
          <div style={{
            background:'rgba(0,0,0,0.6)',border:'1px solid rgba(240,192,64,0.35)',
            borderRadius:16,padding:'4px 14px',
            fontSize:'0.68rem',letterSpacing:1.5,
            color:isMyTurn?'#f0c040':'rgba(255,255,255,0.7)',
            fontWeight:isMyTurn?700:400,
          }}>
            {isMyTurn?'⭐ GILIRAN KAMU':`🎴 ${actUser}`}
          </div>

          {/* Timer */}
          <div style={{
            width:36,height:36,borderRadius:'50%',
            background:'rgba(0,0,0,0.5)',border:`2px solid ${timeLeft<=5?'#e74c3c':timeLeft<=10?'#f39c12':'rgba(255,255,255,0.2)'}`,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:'0.75rem',fontWeight:700,
            color:timeLeft<=5?'#e74c3c':timeLeft<=10?'#f39c12':'#fff',
            transition:'color 0.3s,border-color 0.3s',
          }}>
            {isOver?'🏁':timeLeft}
          </div>
        </div>

        {/* Timer bar */}
        {!isOver && (
          <div style={{ flexShrink:0, padding:'0 0 2px' }}>
            <TimerBar secs={timeLeft} total={TURN_SECONDS} />
          </div>
        )}

        {/* ── MEJA (area tengah) ── */}
        <div style={{
          flex:1, display:'flex', flexDirection:'column',
          minHeight:0, position:'relative',
        }}>

          {/* BROWN TABLE */}
          <div style={{
            flex:1,
            margin:'8px 10px',
            background:'linear-gradient(160deg,#c9996b,#b07d50,#c9996b)',
            borderRadius:24,
            boxShadow:'0 0 0 4px #8b5e34,0 8px 32px rgba(0,0,0,0.5)',
            display:'flex', flexDirection:'column',
            overflow:'hidden', position:'relative',
          }}>

            {/* Felt texture */}
            <div style={{position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(45deg,rgba(0,0,0,0.025) 0,rgba(0,0,0,0.025) 1px,transparent 1px,transparent 8px)',borderRadius:24,pointerEvents:'none'}}/>

            {/* Dashed border */}
            <div style={{position:'absolute',inset:12,border:'1.5px dashed rgba(255,255,255,0.1)',borderRadius:16,pointerEvents:'none'}}/>

            {/* ── PEMAIN ATAS ── */}
            <div style={{
              display:'flex',flexDirection:'column',alignItems:'center',
              padding:'10px 8px 6px', flexShrink:0,
            }}>
              <Avatar player={dp(2)} isActive={ia(2)} handCount={hc(2)} coins={pc(2)} isMe={false} size={46} />
              {dp(2) && (
                <div style={{display:'flex',gap:2,marginTop:4}}>
                  {Array.from({length:Math.min(hc(2),7)}).map((_,i)=><CardBack key={i} horiz={true} small/>)}
                </div>
              )}
            </div>

            {/* ── TENGAH: kiri | board | kanan ── */}
            <div style={{
              flex:1, display:'flex', flexDirection:'row',
              minHeight:0, overflow:'hidden',
            }}>

              {/* PEMAIN KIRI */}
              <div style={{
                width:70, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', gap:4,
                flexShrink:0, padding:'0 4px',
              }}>
                <Avatar player={dp(1)} isActive={ia(1)} handCount={hc(1)} coins={pc(1)} isMe={false} size={44} />
                {dp(1) && (
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    {Array.from({length:Math.min(hc(1),5)}).map((_,i)=><CardBack key={i} horiz={false} small/>)}
                  </div>
                )}
              </div>

              {/* BOARD */}
              <div
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,null);dragRef.current=null}}}
                style={{
                  flex:1,
                  display:'flex', flexWrap:'wrap',
                  alignContent:'center', alignItems:'center',
                  justifyContent:'center', gap:2,
                  padding:'4px',
                  overflow:'hidden',
                  position:'relative',
                }}
              >
                {board.length===0?(
                  <div style={{
                    color:'rgba(0,0,0,0.2)',fontSize:'0.65rem',
                    letterSpacing:2,textTransform:'uppercase',
                    textAlign:'center',lineHeight:2.5,
                    fontWeight:600,
                  }}>
                    {isMyTurn?'Ketuk 2x kartu\nuntuk main':'Menunggu...'}
                  </div>
                ):(
                  board.map((tile,i)=>(
                    <BoardCard key={`${tile.id}-${i}`} tile={tile} horiz={i%4!==0} />
                  ))
                )}
                {/* Board ends */}
                {board.length>0&&(
                  <>
                    <div style={{position:'absolute',left:2,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.55)',borderRadius:5,padding:'2px 5px',fontSize:'0.58rem',color:'#f0c040'}}>←{gameState.boardLeft}</div>
                    <div style={{position:'absolute',right:2,top:'50%',transform:'translateY(-50%)',background:'rgba(0,0,0,0.55)',borderRadius:5,padding:'2px 5px',fontSize:'0.58rem',color:'#f0c040'}}>{gameState.boardRight}→</div>
                  </>
                )}
              </div>

              {/* PEMAIN KANAN */}
              <div style={{
                width:70, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', gap:4,
                flexShrink:0, padding:'0 4px',
              }}>
                <Avatar player={dp(3)} isActive={ia(3)} handCount={hc(3)} coins={pc(3)} isMe={false} size={44} />
                {dp(3) && (
                  <div style={{display:'flex',flexDirection:'column',gap:2}}>
                    {Array.from({length:Math.min(hc(3),5)}).map((_,i)=><CardBack key={i} horiz={false} small/>)}
                  </div>
                )}
              </div>
            </div>

            {/* ── PEMAIN SAYA (bawah) ── */}
            <div style={{
              display:'flex',flexDirection:'column',alignItems:'center',
              padding:'4px 8px 10px', flexShrink:0,
            }}>
              <Avatar player={dp(0)} isActive={isMyTurn} handCount={myHand.length} coins={pc(0)} isMe={true} size={48} />
              <div style={{
                display:'flex', gap:4, alignItems:'flex-end',
                overflowX:'auto', padding:'6px 4px 0',
                maxWidth:'100%', flexWrap:'nowrap',
              }}>
                {myHand.map(tile=>(
                  <HandCard
                    key={tile.id}
                    tile={tile}
                    selected={selected?.id===tile.id}
                    valid={!!validMoves.find(t=>t.id===tile.id)}
                    myTurn={isMyTurn}
                    onClick={handleSelect}
                    onDragStart={(e,t)=>{dragRef.current=t;setSelected(t)}}
                    onDragEnd={()=>{dragRef.current=null}}
                  />
                ))}
              </div>
            </div>

          </div>{/* end brown table */}
        </div>{/* end meja area */}

        {/* ── MENU DROPDOWN ── */}
        {menuOpen && (
          <div style={{
            position:'fixed',top:56,left:0,
            background:'rgba(6,16,10,0.97)',
            border:'1px solid rgba(212,160,23,0.3)',
            borderRadius:'0 12px 12px 0',
            padding:8, zIndex:60, minWidth:170,
            boxShadow:'4px 4px 20px rgba(0,0,0,0.6)',
            animation:'slideDown 0.15s ease',
          }}>
            {[
              {icon:soundOn?'🔊':'🔇', label:soundOn?'Suara: ON':'Suara: OFF', action:()=>{const n=!soundOn;setSoundOn(n);soundRef.current=n}},
              {icon:'💬', label:'Chat', action:()=>{setChatOpen(o=>!o);setMenuOpen(false)}},
              {icon:'←', label:'Kembali ke Lobby', action:backToLobby, danger:true},
            ].map((item,i)=>(
              <button key={i} onClick={()=>{item.action();if(!item.label.includes('Chat'))setMenuOpen(false)}} style={{
                display:'flex',alignItems:'center',gap:10,
                width:'100%',background:'transparent',border:'none',
                borderRadius:8,padding:'9px 12px',
                color:item.danger?'#e74c3c':'#f5f0e8',
                cursor:'pointer',fontSize:'0.82rem',letterSpacing:0.5,
              }}>
                <span>{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── SIDE SELECTOR ── */}
        {showSide&&pendingTile&&(
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,flexDirection:'column',gap:16}}>
            <div style={{color:'#f0c040',fontSize:'0.75rem',letterSpacing:3}}>TARUH DI SISI MANA?</div>
            <div style={{display:'flex',gap:20,alignItems:'center'}}>
              <button onClick={()=>execPlay(pendingTile,'left',gsRef.current,myIdxRef.current,roomRef.current)} style={sideStyle}>
                ← KIRI<br/><span style={{fontSize:'1.4rem',color:'#f0c040'}}>{gameState.boardLeft}</span>
              </button>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <div style={{width:44,height:80,background:'linear-gradient(160deg,#fff,#f5f0e0)',borderRadius:7,border:'2px solid #f0c040',display:'flex',flexDirection:'column',padding:'3px 2px',boxShadow:'0 0 0 4px rgba(240,192,64,0.2)'}}>
                  <div style={{flex:1}}><PipFace val={pendingTile.left}/></div>
                  <div style={{height:1.5,background:'#aaa',margin:'0 4px'}}/>
                  <div style={{flex:1}}><PipFace val={pendingTile.right}/></div>
                </div>
                <button onClick={()=>{setShowSide(false);setPendingTile(null)}} style={{background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:'0.72rem'}}>Batal</button>
              </div>
              <button onClick={()=>execPlay(pendingTile,'right',gsRef.current,myIdxRef.current,roomRef.current)} style={sideStyle}>
                KANAN →<br/><span style={{fontSize:'1.4rem',color:'#f0c040'}}>{gameState.boardRight}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {isOver&&(
          <div className="modal-overlay">
            <div className="modal">
              <div style={{fontSize:'3rem',marginBottom:10}}>{iWin?'🏆':'😔'}</div>
              <h2 className="modal-title">{iWin?'MENANG!':'KALAH'}</h2>
              <p className="modal-subtitle">{gameState.blocked?'Permainan buntu! ':''}{winnerP?.username} menang!</p>
              <div style={{
                background:iWin?'rgba(39,174,96,0.15)':'rgba(192,57,43,0.15)',
                border:`1px solid ${iWin?'rgba(39,174,96,0.4)':'rgba(192,57,43,0.4)'}`,
                borderRadius:10,padding:'10px 20px',marginBottom:12,
                fontSize:'0.9rem',fontWeight:700,
                color:iWin?'#27ae60':'#e74c3c',
              }}>
                {iWin?`+${formatCoins(100000*(players.length-1))} 🪙`:`-${formatCoins(100000)} 🪙`}
              </div>
              <div style={{fontSize:'0.72rem',color:'rgba(245,240,232,0.5)',marginBottom:18}}>
                Koin kamu: 🪙 {formatCoins(profiles[user?.id]?.coins??0)}
              </div>
              {players[0]?.id===user?.id&&(
                <button className="btn-primary" onClick={resetGame} style={{marginBottom:10}}>Main Lagi</button>
              )}
              <button className="btn-secondary" onClick={backToLobby}>Kembali ke Lobby</button>
            </div>
          </div>
        )}

        {/* ── CHAT ── */}
        <ChatPanel roomId={roomId} user={user} players={players} forceOpen={chatOpen} onClose={()=>setChatOpen(false)} />

        {/* ── NOTIF ── */}
        {notif&&<div className="notification">{notif}</div>}
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%,100%{box-shadow:0 0 0 4px rgba(240,192,64,0.25),0 4px 14px rgba(0,0,0,0.4)}
          50%{box-shadow:0 0 0 8px rgba(240,192,64,0.1),0 4px 14px rgba(0,0,0,0.4)}
        }
        @keyframes valid-glow {
          from{box-shadow:0 0 0 2px rgba(39,174,96,0.4),0 4px 10px rgba(0,0,0,0.25)}
          to{box-shadow:0 0 0 4px rgba(39,174,96,0.65),0 4px 10px rgba(0,0,0,0.25)}
        }
        @keyframes slideDown {
          from{opacity:0;transform:translateY(-8px)}
          to{opacity:1;transform:translateY(0)}
        }
      `}</style>
    </>
  )
}

const sideStyle = {
  background:'rgba(6,16,10,0.96)',border:'2px solid rgba(212,160,23,0.5)',
  borderRadius:12,padding:'16px 22px',color:'rgba(245,240,232,0.8)',
  fontFamily:'Josefin Sans,sans-serif',fontSize:'0.82rem',letterSpacing:2,
  cursor:'pointer',textAlign:'center',lineHeight:1.9,
}
