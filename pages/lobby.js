import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export default function LobbyPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }
      setUser(session.user)
      fetchRooms()
    }
    init()

    // Realtime rooms update
    const channel = supabase
      .channel('rooms-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchRooms = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setRooms(data || [])
    setLoading(false)
  }

  const createRoom = async () => {
    if (!user) return
    setCreating(true)
    const roomId = uuidv4().slice(0, 8).toUpperCase()
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Player'

    const { data, error } = await supabase.from('rooms').insert({
      id: roomId,
      name: `Meja ${roomId}`,
      host_id: user.id,
      players: [{ id: user.id, username, seat: 0 }],
      status: 'waiting',
      game_state: null,
    }).select().single()

    if (!error && data) {
      router.push(`/game/${data.id}`)
    }
    setCreating(false)
  }

  const joinRoom = async (room) => {
    if (!user) return
    if (room.status === 'playing') return
    if (room.players?.length >= 4) return

    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Player'
    const alreadyIn = room.players?.find(p => p.id === user.id)

    if (!alreadyIn) {
      const seat = room.players?.length || 0
      const newPlayers = [...(room.players || []), { id: user.id, username, seat }]
      await supabase.from('rooms').update({ players: newPlayers }).eq('id', room.id)
    }

    router.push(`/game/${room.id}`)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const username = user?.user_metadata?.username || user?.email?.split('@')[0]

  return (
    <>
      <Head><title>Lobby – Gaple Online</title></Head>
      <div className="lobby-page">
        <div className="lobby-header">
          <h1 className="lobby-title">🎴 GAPLE ONLINE</h1>
          <p className="lobby-user">Selamat datang, <strong style={{ color: 'var(--gold-light)' }}>{username}</strong></p>
          <button
            className="btn-secondary"
            onClick={logout}
            style={{ width: 'auto', marginTop: 12, padding: '8px 24px', fontSize: '0.75rem' }}
          >
            Keluar
          </button>
        </div>

        <button
          className="btn-primary"
          onClick={createRoom}
          disabled={creating}
          style={{ width: 240, marginBottom: 32 }}
        >
          {creating ? 'Membuat Meja...' : '+ Buat Meja Baru'}
        </button>

        {loading ? (
          <div className="spinner" />
        ) : (
          <>
            <p style={{ color: 'rgba(245,240,232,0.4)', fontSize: '0.75rem', letterSpacing: 2, marginBottom: 16 }}>
              MEJA TERSEDIA ({rooms.length})
            </p>
            <div className="rooms-grid">
              {rooms.map(room => {
                const playerCount = room.players?.length || 0
                const isFull = playerCount >= 4
                const isPlaying = room.status === 'playing'
                const canJoin = !isFull && !isPlaying

                return (
                  <div
                    key={room.id}
                    className="room-card"
                    onClick={() => canJoin && joinRoom(room)}
                    style={{ opacity: !canJoin ? 0.5 : 1, cursor: canJoin ? 'pointer' : 'not-allowed' }}
                  >
                    <div className="room-name">🎴 {room.name}</div>
                    <div className="room-players">
                      {room.players?.map(p => p.username).join(', ') || 'Kosong'}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(245,240,232,0.5)' }}>
                        👥 {playerCount}/4
                      </span>
                      <span className={`room-status ${isPlaying ? 'status-playing' : 'status-waiting'}`}>
                        {isPlaying ? 'Bermain' : isFull ? 'Penuh' : 'Menunggu'}
                      </span>
                    </div>
                  </div>
                )
              })}
              {rooms.length === 0 && (
                <div style={{ color: 'rgba(245,240,232,0.4)', fontSize: '0.85rem', gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
                  Belum ada meja. Buat meja baru untuk mulai bermain!
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
