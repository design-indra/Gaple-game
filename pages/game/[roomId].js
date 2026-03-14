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
function PipFace({ val, color='#c0392b' }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" style={{ display:'block' }}>
      {(PIP_POS[val]||[]).map(([cx,cy],i) =>
        <circle key={i} cx={cx} cy={cy} r={11} fill={color} />
      )}
    </svg>
  )
}

// ─── Hand card ────────────────────────────────────────────────────
function HandCard({ tile, selected, valid, myTurn, onClick, onDragStart, onDragEnd }) {
  const canPlay = myTurn && valid
  return (
    <div
      draggable={canPlay}
      onDragStart={e => onDragStart?.(e, tile)}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(tile)}
      style={{
        width:38, height:70,
        background: 'linear-gradient(160deg, #fff 60%, #f5f0e0)',
        borderRadius:6,
        border: selected ? '2.5px solid #f0c040'
               : canPlay  ? '2px solid #27ae60'
               : '1.5px solid #bbb',
        display:'flex', flexDirection:'column',
        padding:'2px 1px',
        cursor: canPlay ? 'pointer' : 'default',
        opacity: myTurn && !valid ? 0.4 : 1,
        transform: selected ? 'translateY(-16px) scale(1.05)'
                 : canPlay  ? 'translateY(-6px)' : 'none',
        transition:'all 0.15s',
        boxShadow: selected ? '0 0 0 3px rgba(240,192,64,0.5), 0 12px 24px rgba(0,0,0,0.5)'
                 : canPlay  ? '0 0 0 2px rgba(39,174,96,0.4), 0 4px 12px rgba(0,0,0,0.3)'
                 : '2px 3px 8px rgba(0,0,0,0.35)',
        flexShrink:0, userSelect:'none',
        animation: canPlay && !selected ? 'valid-glow 0.9s ease infinite alternate' : 'none',
      }}
    >
      <div style={{ flex:1 }}><PipFace val={tile.left} /></div>
      <div style={{ height:1.5, background:'#999', margin:'0 4px' }} />
      <div style={{ flex:1 }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Board tile (small, in chain) ────────────────────────────────
function ChainTile({ tile, horiz }) {
  const w = horiz ? 46 : 25, h = horiz ? 25 : 46
  return (
    <div style={{
      width:w, height:h,
      background:'linear-gradient(160deg,#fff 60%,#f5f0e0)',
      borderRadius:3, border:'1px solid #aaa',
      display:'flex', flexDirection: horiz ? 'row' : 'column',
      padding:'1px', boxShadow:'1px 2px 4px rgba(0,0,0,0.3)',
      flexShrink:0,
    }}>
      <div style={{ flex:1 }}><PipFace val={tile.left} /></div>
      <div style={{ [horiz?'width':'height']:1.5, [horiz?'height':'width']:'80%', background:'#999', flexShrink:0, alignSelf:'center' }} />
      <div style={{ flex:1 }}><PipFace val={tile.right} /></div>
    </div>
  )
}

// ─── Face-down tile ───────────────────────────────────────────────
function FaceDown({ horiz }) {
  return (
    <div style={{
      width: horiz ? 46 : 25, height: horiz ? 25 : 46,
      borderRadius:3,
      background:'linear-gradient(135deg,#1e3a8a,#2563eb,#1e3a8a)',
      border:'1px solid rgba(255,255,255,0.25)',
      boxShadow:'1px 2px 4px rgba(0,0,0,0.4)',
      flexShrink:0,
      backgroundImage:'repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0,rgba(255,255,255,0.04) 2px,transparent 2px,transparent 8px)',
    }} />
  )
}

// ─── Player seat ──────────────────────────────────────────────────
function Seat({ player, isActive, handCount, coins=0, isMe, position }) {
  const empty = !player
  const initial = player ? player.username[0].toUpperCase() : '?'

  // Fake "photo" avatar using initials + gradient (no real photo upload yet)
  const avatarGradients = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
  ]
  const gi = player ? player.username.charCodeAt(0) % 4 : 0

  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:3,
      opacity: empty ? 0.3 : 1,
    }}>
      {/* Coin display (above for top player) */}
      {(position==='top') && player && (
        <div style={{ fontSize:'0.6rem', color:'#f0c040', background:'rgba(0,0,0,0.5)', borderRadius:10, padding:'1px 7px' }}>
          🪙 {coins.toLocaleString()}
        </div>
      )}

      {/* Avatar circle */}
      <div style={{ position:'relative' }}>
        <div style={{
          width:56, height:56, borderRadius:'50%',
          background: empty ? 'rgba(255,255,255,0.1)' : avatarGradients[gi],
          border: isActive ? '3px solid #f0c040' : '2.5px solid rgba(255,255,255,0.3)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'1.4rem', fontWeight:800, color:'#fff',
          fontFamily:'Playfair Display,serif',
          boxShadow: isActive
            ? '0 0 0 5px rgba(240,192,64,0.3), 0 4px 16px rgba(0,0,0,0.5)'
            : '0 4px 14px rgba(0,0,0,0.4)',
          animation: isActive ? 'pulse-ring 1.5s ease infinite' : 'none',
        }}>
          {initial}
        </div>
        {/* Active dot */}
        {isActive && (
          <div style={{
            position:'absolute', top:1, right:1,
            width:13, height:13, borderRadius:'50%',
            background:'#f0c040', border:'2px solid #2d5a1b',
          }} />
        )}
        {/* Hand count badge */}
        {!empty && (
          <div style={{
            position:'absolute', bottom:-2, right:-4,
            background:'#c0392b', color:'#fff',
            borderRadius:8, padding:'0 4px', fontSize:'0.55rem',
            fontWeight:700, border:'1.5px solid #fff',
            minWidth:16, textAlign:'center',
          }}>
            {handCount}
          </div>
        )}
      </div>

      {/* Name */}
      <div style={{
        fontSize:'0.62rem', color: isActive ? '#f0c040' : '#fff',
        fontWeight: isActive ? 700 : 400,
        textShadow:'0 1px 3px rgba(0,0,0,0.8)',
        maxWidth:70, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        textAlign:'center',
      }}>
        {empty ? 'Kosong' : (isMe ? `${player.username} ★` : player.username)}
      </div>

      {/* Coin display (below for others) */}
      {position !== 'top' && player && (
        <div style={{ fontSize:'0.6rem', color:'#f0c040', background:'rgba(0,0,0,0.5)', borderRadius:10, padding:'1px 7px' }}>
          🪙 {coins.toLocaleString()}
        </div>
      )}
    </div>
  )
}

// ─── Timer ring ───────────────────────────────────────────────────
function TimerRing({ secs, total }) {
  const r=18, c=2*Math.PI*r
  const col = secs<=5?'#e74c3c':secs<=10?'#f39c12':'#27ae60'
  return (
    <div style={{ position:'relative', width:44, height:44 }}>
      <svg width={44} height={44} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={22} cy={22} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={3}/>
        <circle cx={22} cy={22} r={r} fill="none" stroke={col} strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${c*(secs/total)} ${c}`}
          style={{ transition:'stroke-dasharray 0.5s linear, stroke 0.3s' }}/>
      </svg>
      <div style={{
        position:'absolute', inset:0, display:'flex',
        alignItems:'center', justifyContent:'center',
        fontSize:'0.72rem', fontWeight:700,
        color: secs<=5 ? '#e74c3c' : '#fff',
      }}>{secs}</div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────
function Sidebar({ onLeave, soundOn, onToggleSound, onChat }) {
  const btns = [
    { icon:'⬅', label:'Keluar', action: onLeave, danger:true },
    { icon: soundOn ? '🔊' : '🔇', label:'Suara', action: onToggleSound },
    { icon:'💬', label:'Chat', action: onChat },
  ]
  return (
    <div style={{
      position:'absolute', left:0, top:0, bottom:0,
      width:52, zIndex:40,
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap:8,
      padding:'8px 0',
    }}>
      {btns.map((b,i) => (
        <button key={i} onClick={b.action} title={b.label} style={{
          width:42, height:42, borderRadius:10,
          background:'rgba(0,0,0,0.55)',
          border:`1.5px solid ${b.danger?'rgba(192,57,43,0.5)':'rgba(255,255,255,0.15)'}`,
          color: b.danger ? '#e74c3c' : '#fff',
          fontSize:'1.1rem', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 2px 8px rgba(0,0,0,0.4)',
          transition:'all 0.15s',
        }}>
          {b.icon}
        </button>
      ))}
    </div>
  )
}

// ─── Snake board layout ───────────────────────────────────────────
// Lays tiles in a snake: left-to-right, then turn down, then right-to-left
function SnakeBoard({ board, onDragOver, onDrop }) {
  // Max tiles per row before wrapping
  const ROW = 9

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display:'flex', flexDirection:'column',
        alignItems:'flex-start', gap:2,
      }}
    >
      {board.length === 0 ? (
        <div style={{
          color:'rgba(255,255,255,0.2)', fontSize:'0.7rem',
          letterSpacing:3, textTransform:'uppercase', textAlign:'center',
          width:300, lineHeight:3,
        }}>
          Menunggu kartu pertama...
        </div>
      ) : (
        Array.from({ length: Math.ceil(board.length / ROW) }).map((_, rowIdx) => {
          const rowTiles = board.slice(rowIdx * ROW, (rowIdx + 1) * ROW)
          const reversed = rowIdx % 2 === 1  // snake: alternate direction
          const tiles = reversed ? [...rowTiles].reverse() : rowTiles
          return (
            <div key={rowIdx} style={{ display:'flex', flexDirection:'row', gap:2, alignSelf: reversed ? 'flex-end' : 'flex-start' }}>
              {tiles.map((tile, i) => (
                <ChainTile key={`${tile.id}-${rowIdx}-${i}`} tile={tile} horiz={true} />
              ))}
            </div>
          )
        })
      )}
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
      supabase.from('rooms').select('*').eq('id',roomId).single().then(({data}) => {
        if (!data) { router.push('/lobby'); return }
        setRoom(data); if (data.game_state) setGameState(data.game_state)
        setMyPlayerIdx(data.players?.findIndex(p=>p.id===session.user.id)??-1)
      })
    })
  }, [roomId])

  // ── Realtime ──
  useEffect(() => {
    if (!roomId||!user) return
    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},
        ({new:upd}) => {
          setRoom(upd)
          const myIdx = upd.players?.findIndex(p=>p.id===user.id)??-1
          setMyPlayerIdx(myIdx)
          if (upd.game_state) {
            const prev = gsRef.current
            if ((upd.game_state.board?.length||0)>(prev?.board?.length||0)) snd(playCardPlace)
            if (upd.game_state.currentPlayer!==prev?.currentPlayer && upd.game_state.currentPlayer===myIdx)
              setTimeout(()=>snd(playYourTurn),200)
            if (upd.game_state.winner>=0&&(prev?.winner??-1)<0)
              setTimeout(()=>snd(upd.game_state.winner===myIdx?playWin:playLose),300)
            setGameState(upd.game_state)
            setSelected(null)
            autoPlayed.current=false
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
      const left = Math.max(0, Math.ceil((new Date(deadline)-Date.now())/1000))
      setTimeLeft(left)
      if (left<=0) {
        clearInterval(timerRef.current)
        const gs=gsRef.current, mi=myIdxRef.current, rm=roomRef.current
        if (gs&&mi===gs.currentPlayer&&!autoPlayed.current) {
          autoPlayed.current=true
          const valid=getValidMoves(gs.hands?.[mi]||[],gs.boardLeft,gs.boardRight,gs.firstMove)
          if (valid.length>0) execPlay(valid[0],null,gs,mi,rm)
          else passTurn(gs,mi,rm)
        }
      }
    },500)
    return ()=>clearInterval(timerRef.current)
  }, [gameState?.turn_deadline,gameState?.currentPlayer])

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

  const doPlay = (tile,side) => {
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
    const state=createInitialState(players.map(p=>p.id))
    const deadline=new Date(Date.now()+TURN_SECONDS*1000).toISOString()
    await supabase.from('rooms').update({status:'playing',game_state:{...state,turn_deadline:deadline}}).eq('id',roomId)
  }

  // Display slots: 0=me(bottom), 1=left, 2=top, 3=right
  const dp=(slot)=>myPlayerIdx<0?players[slot]||null:players[(myPlayerIdx+slot)%Math.max(players.length,1)]||null
  const dpIdx=(slot)=>(myPlayerIdx+slot)%Math.max(players.length,1)
  const hc=(slot)=>gameState?.hands?.[dpIdx(slot)]?.length||0
  const ia=(slot)=>gameState?.currentPlayer===dpIdx(slot)

  // Coins (placeholder, later can be real)
  const coins=(slot)=>({ 0:29250000,1:53550000,2:43800000,3:3000000 }[slot]||0)

  if (!room) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#1a3d0a'}}>
      <div className="spinner"/>
    </div>
  )

  // ── WAITING ──
  if (!gameState||room.status==='waiting') {
    const isHost=players[0]?.id===user?.id
    return (
      <>
        <Head><title>Meja {roomId} – Gaple</title></Head>
        <div style={{ width:'100vw',height:'100vh',background:'radial-gradient(ellipse at center,#2d5a1b 0%,#1a3d0a 70%)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:'rgba(0,0,0,0.7)',border:'1.5px solid rgba(212,160,23,0.4)',borderRadius:20,padding:'40px 48px',textAlign:'center',maxWidth:440,width:'90%' }}>
            <div style={{ fontSize:'2rem',fontFamily:'Playfair Display,serif',color:'#f0c040',marginBottom:8 }}>🎴 Meja {roomId}</div>
            <div style={{ color:'rgba(245,240,232,0.5)',fontSize:'0.78rem',letterSpacing:2,marginBottom:24 }}>MENUNGGU PEMAIN ({players.length}/4)</div>
            <div style={{ display:'flex',gap:12,justifyContent:'center',marginBottom:24 }}>
              {Array.from({length:4}).map((_,i)=>{
                const p=players[i]
                return (
                  <div key={i} style={{ width:72,height:72,borderRadius:12,border:p?'2px solid #f0c040':'2px dashed rgba(212,160,23,0.3)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,background:p?'rgba(212,160,23,0.08)':'transparent' }}>
                    <div style={{ fontSize:'1.4rem',fontFamily:'Playfair Display,serif',fontWeight:700,color:p?'#f0c040':'rgba(212,160,23,0.3)' }}>{p?p.username[0].toUpperCase():'?'}</div>
                    <div style={{ fontSize:'0.55rem',color:p?'#f0c040':'rgba(245,240,232,0.3)',letterSpacing:1 }}>{p?p.username:'Kosong'}</div>
                  </div>
                )
              })}
            </div>
            {isHost&&players.length>=2
              ?<button className="btn-primary" style={{width:180,marginBottom:12}} onClick={startGame}>▶ Mulai</button>
              :isHost?<p style={{color:'rgba(245,240,232,0.4)',fontSize:'0.8rem',marginBottom:12}}>Butuh minimal 2 pemain</p>
              :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,marginBottom:12}}><div className="spinner"/><p style={{color:'rgba(245,240,232,0.4)',fontSize:'0.8rem'}}>Menunggu host memulai...</p></div>
            }
            <div style={{ fontSize:'0.7rem',color:'rgba(245,240,232,0.35)',letterSpacing:2,marginTop:4 }}>
              KODE: <strong style={{color:'#f0c040'}}>{roomId}</strong>
            </div>
            <button className="btn-secondary" style={{width:140,marginTop:16,fontSize:'0.72rem'}} onClick={backToLobby}>← Keluar</button>
          </div>
        </div>
      </>
    )
  }

  const board=gameState.board||[]
  const isOver=gameState.winner>=0
  const winnerP=isOver?players[gameState.winner]:null
  const iWin=isOver&&gameState.winner===myPlayerIdx
  const activeUser=players[gameState.currentPlayer]?.username||''

  return (
    <>
      <Head><title>🎴 Gaple – {roomId}</title></Head>

      {/* ── Outer wrapper: green grass bg ── */}
      <div style={{
        width:'100vw', height:'100vh',
        background:'radial-gradient(ellipse at center, #3a7d1e 0%, #2d5a1b 40%, #1a3d0a 100%)',
        position:'relative', overflow:'hidden',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {/* Grass texture dots */}
        <div style={{ position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px,transparent 1px)',backgroundSize:'18px 18px',pointerEvents:'none' }} />

        {/* ── Diamond brown table ── */}
        <div style={{
          width:'78vw', height:'76vh',
          background:'linear-gradient(145deg,#c4956a,#b07d50,#c4956a,#a06840)',
          transform:'perspective(600px) rotateX(6deg)',
          borderRadius:40,
          boxShadow:'0 0 0 6px #8b5e34, 0 0 0 10px rgba(0,0,0,0.3), 0 20px 80px rgba(0,0,0,0.7)',
          position:'relative',
          display:'flex', alignItems:'center', justifyContent:'center',
          overflow:'hidden',
        }}>
          {/* Table felt texture */}
          <div style={{ position:'absolute',inset:0,backgroundImage:'repeating-linear-gradient(45deg,rgba(0,0,0,0.03) 0,rgba(0,0,0,0.03) 1px,transparent 1px,transparent 8px)',borderRadius:40,pointerEvents:'none' }} />

          {/* Dashed border area */}
          <div style={{
            position:'absolute', inset:30,
            border:'1.5px dashed rgba(255,255,255,0.12)',
            borderRadius:20, pointerEvents:'none',
          }} />

          {/* Watermark */}
          <div style={{
            position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
            fontSize:'1.8rem', fontFamily:'Playfair Display,serif', fontWeight:900,
            color:'rgba(255,255,255,0.06)', letterSpacing:6,
            pointerEvents:'none', userSelect:'none', whiteSpace:'nowrap',
          }}>GAPLE</div>

          {/* ── TOP player ── */}
          <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', zIndex:10, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <Seat player={dp(2)} isActive={ia(2)} handCount={hc(2)} coins={coins(2)} isMe={false} position="top" />
            {dp(2) && (
              <div style={{ display:'flex', gap:2, marginTop:2 }}>
                {Array.from({length:Math.min(hc(2),7)}).map((_,i)=><FaceDown key={i} horiz={true}/>)}
              </div>
            )}
          </div>

          {/* ── LEFT player ── */}
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', zIndex:10, display:'flex', flexDirection:'row', alignItems:'center', gap:5 }}>
            <Seat player={dp(1)} isActive={ia(1)} handCount={hc(1)} coins={coins(1)} isMe={false} position="left" />
            {dp(1) && (
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {Array.from({length:Math.min(hc(1),7)}).map((_,i)=><FaceDown key={i} horiz={false}/>)}
              </div>
            )}
          </div>

          {/* ── RIGHT player ── */}
          <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', zIndex:10, display:'flex', flexDirection:'row-reverse', alignItems:'center', gap:5 }}>
            <Seat player={dp(3)} isActive={ia(3)} handCount={hc(3)} coins={coins(3)} isMe={false} position="right" />
            {dp(3) && (
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                {Array.from({length:Math.min(hc(3),7)}).map((_,i)=><FaceDown key={i} horiz={false}/>)}
              </div>
            )}
          </div>

          {/* ── Board snake chain ── */}
          <div style={{
            position:'absolute',
            top:'20%', bottom:'24%',
            left:'12%', right:'12%',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <SnakeBoard
              board={board}
              onDragOver={e=>e.preventDefault()}
              onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,null);dragRef.current=null}}}
            />
          </div>

          {/* Drop zones */}
          <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,'left');dragRef.current=null}}} style={{position:'absolute',left:0,top:'20%',bottom:'24%',width:'12%',zIndex:5}}/>
          <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragRef.current){doPlay(dragRef.current,'right');dragRef.current=null}}} style={{position:'absolute',right:0,top:'20%',bottom:'24%',width:'12%',zIndex:5}}/>

          {/* Board ends */}
          {board.length>0 && (
            <>
              <div style={{position:'absolute',left:'13%',top:'46%',background:'rgba(0,0,0,0.55)',borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',color:'#f0c040',zIndex:6}}>← {gameState.boardLeft}</div>
              <div style={{position:'absolute',right:'13%',top:'46%',background:'rgba(0,0,0,0.55)',borderRadius:6,padding:'2px 8px',fontSize:'0.65rem',color:'#f0c040',zIndex:6}}>{gameState.boardRight} →</div>
            </>
          )}

          {/* ── MY hand at bottom ── */}
          <div style={{
            position:'absolute', bottom:0, left:0, right:0,
            display:'flex', flexDirection:'column', alignItems:'center', gap:4,
            padding:'0 8px 10px', zIndex:20,
          }}>
            <Seat player={dp(0)} isActive={isMyTurn} handCount={myHand.length} coins={coins(0)} isMe={true} position="bottom" />
            <div style={{ display:'flex', gap:5, alignItems:'flex-end', overflowX:'auto', padding:'2px 8px', maxWidth:'100%', flexWrap:'nowrap' }}>
              {myHand.map(tile => (
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

        </div>{/* end table */}

        {/* ── Left sidebar ── */}
        <Sidebar
          onLeave={backToLobby}
          soundOn={soundOn}
          onToggleSound={()=>{const n=!soundOn;setSoundOn(n);soundRef.current=n}}
          onChat={()=>setChatOpen(o=>!o)}
        />

        {/* ── Top center: turn + timer ── */}
        <div style={{
          position:'absolute', top:14, left:'50%', transform:'translateX(-50%)',
          display:'flex', alignItems:'center', gap:10, zIndex:50,
        }}>
          <div style={{
            background:'rgba(0,0,0,0.65)', border:'1px solid rgba(240,192,64,0.35)',
            borderRadius:20, padding:'5px 16px',
            fontSize:'0.68rem', letterSpacing:2, whiteSpace:'nowrap',
            color: isMyTurn ? '#f0c040' : 'rgba(255,255,255,0.7)',
            fontWeight: isMyTurn ? 700 : 400,
          }}>
            {isMyTurn ? '⭐ GILIRAN KAMU' : `🎴 Giliran: ${activeUser}`}
          </div>
          {!isOver && <TimerRing secs={timeLeft} total={TURN_SECONDS} />}
        </div>

        {/* ── Room info top right ── */}
        <div style={{
          position:'absolute', top:14, right:14, zIndex:50,
          background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,255,255,0.12)',
          borderRadius:10, padding:'5px 12px',
          fontSize:'0.62rem', color:'rgba(255,255,255,0.6)', letterSpacing:1,
        }}>
          🎴 {roomId}
        </div>

      </div>{/* end outer wrapper */}

      {/* ── Side selector ── */}
      {showSide && pendingTile && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,flexDirection:'column',gap:20 }}>
          <div style={{ color:'#f0c040',fontSize:'0.75rem',letterSpacing:3 }}>TARUH DI SISI MANA?</div>
          <div style={{ display:'flex',gap:24,alignItems:'center' }}>
            <button onClick={()=>execPlay(pendingTile,'left',gsRef.current,myIdxRef.current,roomRef.current)} style={sideBtnSty}>
              ← KIRI<br/><span style={{fontSize:'1.4rem',color:'#f0c040'}}>{gameState.boardLeft}</span>
            </button>
            <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:10 }}>
              <div style={{ width:44,height:80,background:'linear-gradient(160deg,#fff 60%,#f5f0e0)',borderRadius:7,border:'2px solid #f0c040',display:'flex',flexDirection:'column',padding:'3px 2px',boxShadow:'0 0 0 4px rgba(240,192,64,0.2)' }}>
                <div style={{flex:1}}><PipFace val={pendingTile.left}/></div>
                <div style={{height:1.5,background:'#999',margin:'0 4px'}}/>
                <div style={{flex:1}}><PipFace val={pendingTile.right}/></div>
              </div>
              <button onClick={()=>{setShowSide(false);setPendingTile(null)}} style={{ background:'none',border:'none',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:'0.72rem' }}>Batal</button>
            </div>
            <button onClick={()=>execPlay(pendingTile,'right',gsRef.current,myIdxRef.current,roomRef.current)} style={sideBtnSty}>
              KANAN →<br/><span style={{fontSize:'1.4rem',color:'#f0c040'}}>{gameState.boardRight}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Game over ── */}
      {isOver && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{fontSize:'3rem',marginBottom:12}}>{iWin?'🏆':'😔'}</div>
            <h2 className="modal-title">{iWin?'MENANG!':'KALAH'}</h2>
            <p className="modal-subtitle">{gameState.blocked?'Permainan buntu! ':''}{winnerP?.username} menang!</p>
            {players[0]?.id===user?.id&&<button className="btn-primary" onClick={resetGame} style={{marginBottom:12}}>Main Lagi</button>}
            <button className="btn-secondary" onClick={backToLobby}>Kembali ke Lobby</button>
          </div>
        </div>
      )}

      {/* ── Chat (controlled by sidebar) ── */}
      <ChatPanel roomId={roomId} user={user} players={players} forceOpen={chatOpen} onClose={()=>setChatOpen(false)} />

      {/* ── Notification ── */}
      {notif && <div className="notification">{notif}</div>}

      <style>{`
        @keyframes pulse-ring {
          0%,100%{box-shadow:0 0 0 4px rgba(240,192,64,0.25),0 4px 16px rgba(0,0,0,0.5)}
          50%{box-shadow:0 0 0 8px rgba(240,192,64,0.1),0 4px 16px rgba(0,0,0,0.5)}
        }
        @keyframes valid-glow {
          from{box-shadow:0 0 0 2px rgba(39,174,96,0.4),0 4px 10px rgba(0,0,0,0.3)}
          to{box-shadow:0 0 0 4px rgba(39,174,96,0.65),0 4px 10px rgba(0,0,0,0.3)}
        }
      `}</style>
    </>
  )
}

const sideBtnSty = {
  background:'rgba(6,16,10,0.96)', border:'2px solid rgba(212,160,23,0.5)',
  borderRadius:12, padding:'18px 26px', color:'rgba(245,240,232,0.8)',
  fontFamily:'Josefin Sans,sans-serif', fontSize:'0.85rem', letterSpacing:2,
  cursor:'pointer', textAlign:'center', lineHeight:1.9,
}
