import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// =============================================
// VOICE CHAT — WebRTC peer-to-peer
// Supabase Realtime digunakan sebagai signaling server
// =============================================

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export default function VoiceChat({ roomId, user, players }) {
  const [isJoined, setIsJoined] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [speakingUsers, setSpeakingUsers] = useState(new Set())
  const [connectedPeers, setConnectedPeers] = useState(new Set())
  const [error, setError] = useState(null)
  const [volume, setVolume] = useState(80)

  const localStreamRef = useRef(null)
  const peersRef = useRef({}) // { userId: RTCPeerConnection }
  const channelRef = useRef(null)
  const audioElemsRef = useRef({}) // { userId: HTMLAudioElement }
  const analyserIntervalRef = useRef(null)

  const myId = user?.id
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player'

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leaveVoice(true)
    }
  }, [])

  const joinVoice = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream

      // Supabase Realtime channel untuk signaling
      const channel = supabase.channel(`voice:${roomId}`, {
        config: { presence: { key: myId } }
      })

      channel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (payload.to !== myId) return
          await handleOffer(payload.from, payload.offer, channel)
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (payload.to !== myId) return
          const pc = peersRef.current[payload.from]
          if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.answer))
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (payload.to !== myId) return
          const pc = peersRef.current[payload.from]
          if (pc && payload.candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
          }
        })
        .on('broadcast', { event: 'joined' }, async ({ payload }) => {
          if (payload.from === myId) return
          // New peer joined → initiate offer
          await createOffer(payload.from, channel)
        })
        .on('broadcast', { event: 'left' }, ({ payload }) => {
          removePeer(payload.from)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Announce joined
            await channel.send({
              type: 'broadcast',
              event: 'joined',
              payload: { from: myId, username },
            })
            channelRef.current = channel
            setIsJoined(true)
          }
        })

      // Volume analyser (detect who's speaking)
      startAnalyser(stream)

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Izin mikrofon ditolak. Aktifkan mikrofon di browser.')
      } else if (err.name === 'NotFoundError') {
        setError('Mikrofon tidak ditemukan.')
      } else {
        setError('Gagal mengakses mikrofon.')
      }
    }
  }

  const createOffer = async (targetId, channel) => {
    const pc = createPeerConnection(targetId, channel)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await channel.send({
      type: 'broadcast',
      event: 'offer',
      payload: { from: myId, to: targetId, offer: pc.localDescription },
    })
  }

  const handleOffer = async (fromId, offer, channel) => {
    const pc = createPeerConnection(fromId, channel)
    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await channel.send({
      type: 'broadcast',
      event: 'answer',
      payload: { from: myId, to: fromId, answer: pc.localDescription },
    })
  }

  const createPeerConnection = (peerId, channel) => {
    // Close existing if any
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close()
    }

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    // ICE candidates
    pc.onicecandidate = async (e) => {
      if (e.candidate && channelRef.current) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'ice',
          payload: { from: myId, to: peerId, candidate: e.candidate.toJSON() },
        })
      }
    }

    // Remote audio
    pc.ontrack = (e) => {
      const stream = e.streams[0]
      if (!audioElemsRef.current[peerId]) {
        const audio = document.createElement('audio')
        audio.autoplay = true
        audio.volume = volume / 100
        document.body.appendChild(audio)
        audioElemsRef.current[peerId] = audio
      }
      audioElemsRef.current[peerId].srcObject = stream
      setConnectedPeers(prev => new Set([...prev, peerId]))
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        removePeer(peerId)
      }
    }

    peersRef.current[peerId] = pc
    return pc
  }

  const removePeer = (peerId) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close()
      delete peersRef.current[peerId]
    }
    if (audioElemsRef.current[peerId]) {
      audioElemsRef.current[peerId].srcObject = null
      audioElemsRef.current[peerId].remove()
      delete audioElemsRef.current[peerId]
    }
    setConnectedPeers(prev => {
      const next = new Set(prev)
      next.delete(peerId)
      return next
    })
    setSpeakingUsers(prev => {
      const next = new Set(prev)
      next.delete(peerId)
      return next
    })
  }

  const startAnalyser = (stream) => {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)()
      const source = ac.createMediaStreamSource(stream)
      const analyser = ac.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      analyserIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setSpeakingUsers(prev => {
          const next = new Set(prev)
          if (avg > 15) {
            next.add(myId)
          } else {
            next.delete(myId)
          }
          return next
        })
      }, 150)
    } catch {}
  }

  const leaveVoice = async (silent = false) => {
    clearInterval(analyserIntervalRef.current)

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }

    Object.keys(peersRef.current).forEach(removePeer)

    if (channelRef.current) {
      if (!silent) {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'left',
          payload: { from: myId },
        })
      }
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    setSpeakingUsers(new Set())
    setConnectedPeers(new Set())
    setIsJoined(false)
  }

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0]
      if (track) track.enabled = isMuted
    }
    setIsMuted(m => !m)
  }

  const changeVolume = (val) => {
    setVolume(val)
    Object.values(audioElemsRef.current).forEach(audio => {
      audio.volume = val / 100
    })
  }

  const isSpeaking = speakingUsers.has(myId)

  return (
    <div style={{
      position: 'fixed',
      bottom: isJoined ? 80 : 'auto',
      top: isJoined ? 'auto' : undefined,
      right: 16,
      bottom: 80,
      zIndex: 45,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 6,
    }}>
      {/* Voice panel saat aktif */}
      {isJoined && (
        <div style={{
          background: 'rgba(8, 20, 12, 0.97)',
          border: `1px solid ${isSpeaking ? 'rgba(39,174,96,0.7)' : 'rgba(212,160,23,0.35)'}`,
          borderRadius: 12,
          padding: '10px 14px',
          width: 200,
          boxShadow: isSpeaking
            ? '0 0 16px rgba(39,174,96,0.3), 0 4px 20px rgba(0,0,0,0.6)'
            : '0 4px 20px rgba(0,0,0,0.6)',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{
              color: 'var(--gold-light)',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: 2,
            }}>
              🎙️ SUARA
            </span>
            <span style={{
              fontSize: '0.65rem',
              color: 'rgba(245,240,232,0.4)',
            }}>
              {connectedPeers.size + 1} orang
            </span>
          </div>

          {/* Players di voice */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {/* Self */}
            <VoiceUser
              name={`${username} (Kamu)`}
              speaking={isSpeaking && !isMuted}
              muted={isMuted}
            />
            {/* Others */}
            {players
              .filter(p => p.id !== myId && connectedPeers.has(p.id))
              .map(p => (
                <VoiceUser
                  key={p.id}
                  name={p.username}
                  speaking={speakingUsers.has(p.id)}
                  muted={false}
                />
              ))
            }
            {connectedPeers.size === 0 && (
              <div style={{
                fontSize: '0.65rem',
                color: 'rgba(245,240,232,0.3)',
                textAlign: 'center',
                padding: '4px 0',
                letterSpacing: 1,
              }}>
                Menunggu pemain lain<br />masuk voice...
              </div>
            )}
          </div>

          {/* Volume */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: '0.62rem',
              color: 'rgba(245,240,232,0.4)',
              letterSpacing: 1,
              marginBottom: 4,
            }}>
              🔊 Volume: {volume}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={e => changeVolume(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: '#d4a017',
                height: 4,
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={toggleMute}
              style={{
                flex: 1,
                background: isMuted
                  ? 'rgba(231,76,60,0.2)'
                  : 'rgba(39,174,96,0.15)',
                border: `1px solid ${isMuted ? 'rgba(231,76,60,0.5)' : 'rgba(39,174,96,0.3)'}`,
                borderRadius: 7,
                padding: '6px 0',
                color: isMuted ? '#e74c3c' : '#27ae60',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              {isMuted ? '🔇 BISU' : '🎙️ AKTIF'}
            </button>
            <button
              onClick={() => leaveVoice()}
              style={{
                background: 'rgba(231,76,60,0.15)',
                border: '1px solid rgba(231,76,60,0.4)',
                borderRadius: 7,
                padding: '6px 10px',
                color: '#e74c3c',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
              title="Keluar dari voice"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(231,76,60,0.15)',
          border: '1px solid rgba(231,76,60,0.4)',
          borderRadius: 8,
          padding: '6px 12px',
          color: '#e74c3c',
          fontSize: '0.7rem',
          maxWidth: 200,
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}

      {/* Join voice button */}
      {!isJoined && (
        <button
          onClick={joinVoice}
          title="Masuk obrolan suara"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a3a6e, #2563a0)',
            border: '2px solid rgba(212,160,23,0.4)',
            color: '#f5f0e8',
            fontSize: '1.2rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            transition: 'all 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          🎙️
        </button>
      )}
    </div>
  )
}

function VoiceUser({ name, speaking, muted }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      padding: '4px 6px',
      borderRadius: 7,
      background: speaking
        ? 'rgba(39,174,96,0.12)'
        : 'rgba(255,255,255,0.03)',
      border: `1px solid ${speaking ? 'rgba(39,174,96,0.35)' : 'transparent'}`,
      transition: 'all 0.15s',
    }}>
      {/* Speaking indicator */}
      <div style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: muted
          ? '#e74c3c'
          : speaking
          ? '#27ae60'
          : 'rgba(255,255,255,0.2)',
        boxShadow: speaking && !muted ? '0 0 6px rgba(39,174,96,0.8)' : 'none',
        flexShrink: 0,
        transition: 'all 0.15s',
      }} />
      <span style={{
        fontSize: '0.72rem',
        color: speaking ? '#f5f0e8' : 'rgba(245,240,232,0.55)',
        letterSpacing: 0.5,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 130,
        transition: 'color 0.15s',
      }}>
        {name}
      </span>
      {muted && (
        <span style={{ fontSize: '0.65rem', marginLeft: 'auto' }}>🔇</span>
      )}
    </div>
  )
}
