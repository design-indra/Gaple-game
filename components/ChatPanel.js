import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { playChatMessage, resumeAudio } from '../lib/sounds'

// Emoji reactions cepat
const QUICK_EMOJIS = ['👏', '😂', '🔥', '😤', '🎴', '👍', '💪', '🤣']

export default function ChatPanel({ roomId, user, players }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isOpen, setIsOpen] = useState(true)
  const [unread, setUnread] = useState(0)
  const [muted, setMuted] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player'

  useEffect(() => {
    if (!roomId) return

    // Load recent messages
    supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => { if (data) setMessages(data) })

    // Realtime subscription
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        const msg = payload.new
        setMessages(prev => [...prev.slice(-99), msg])

        if (!muted && msg.user_id !== user?.id) {
          playChatMessage()
        }
        if (!isOpen) {
          setUnread(prev => prev + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, muted])

  useEffect(() => {
    if (isOpen) {
      setUnread(0)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isOpen, messages])

  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || !user) return
    setInput('')
    resumeAudio()

    await supabase.from('chat_messages').insert({
      room_id: roomId,
      user_id: user.id,
      username,
      message: msg,
    })
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 8,
    }}>
      {/* Chat panel */}
      {isOpen && (
        <div style={{
          width: 280,
          height: 360,
          background: 'rgba(8, 20, 12, 0.97)',
          border: '1px solid rgba(212,160,23,0.35)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(10px)',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid rgba(212,160,23,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(212,160,23,0.07)',
          }}>
            <span style={{ color: 'var(--gold-light)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: 2 }}>
              💬 OBROLAN
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setMuted(m => !m)}
                title={muted ? 'Aktifkan suara' : 'Matikan suara'}
                style={{
                  background: 'none', border: 'none',
                  color: muted ? 'rgba(245,240,232,0.3)' : 'rgba(212,160,23,0.7)',
                  cursor: 'pointer', fontSize: '0.85rem', padding: 0,
                }}
              >
                {muted ? '🔇' : '🔔'}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            {messages.length === 0 && (
              <div style={{
                color: 'rgba(245,240,232,0.3)',
                fontSize: '0.72rem',
                textAlign: 'center',
                marginTop: 40,
                letterSpacing: 1,
              }}>
                Belum ada pesan.<br />Mulai obrolan!
              </div>
            )}
            {messages.map((msg, i) => {
              const isMe = msg.user_id === user?.id
              const isSystem = msg.user_id === 'system'
              return (
                <div key={msg.id || i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isSystem ? 'center' : isMe ? 'flex-end' : 'flex-start',
                }}>
                  {isSystem ? (
                    <div style={{
                      background: 'rgba(212,160,23,0.1)',
                      border: '1px solid rgba(212,160,23,0.2)',
                      borderRadius: 10,
                      padding: '3px 10px',
                      fontSize: '0.65rem',
                      color: 'rgba(212,160,23,0.7)',
                      letterSpacing: 1,
                    }}>
                      {msg.message}
                    </div>
                  ) : (
                    <>
                      {!isMe && (
                        <span style={{ fontSize: '0.62rem', color: 'rgba(212,160,23,0.6)', marginBottom: 2, letterSpacing: 1 }}>
                          {msg.username}
                        </span>
                      )}
                      <div style={{
                        background: isMe
                          ? 'linear-gradient(135deg, #1a5c2e, #217a3c)'
                          : 'rgba(255,255,255,0.07)',
                        border: isMe
                          ? '1px solid rgba(212,160,23,0.2)'
                          : '1px solid rgba(255,255,255,0.07)',
                        borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        padding: '6px 10px',
                        maxWidth: '85%',
                        wordBreak: 'break-word',
                      }}>
                        <span style={{ fontSize: '0.8rem', color: '#f5f0e8', lineHeight: 1.4 }}>
                          {msg.message}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.58rem', color: 'rgba(245,240,232,0.25)', marginTop: 2 }}>
                        {formatTime(msg.created_at)}
                      </span>
                    </>
                  )}
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Quick emoji */}
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '6px 10px',
            borderTop: '1px solid rgba(212,160,23,0.1)',
            flexWrap: 'wrap',
          }}>
            {QUICK_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => sendMessage(e)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '2px 5px',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  lineHeight: 1.4,
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(212,160,23,0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{
            padding: '8px 10px',
            borderTop: '1px solid rgba(212,160,23,0.1)',
            display: 'flex',
            gap: 6,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value.slice(0, 100))}
              onKeyDown={handleKey}
              onFocus={resumeAudio}
              placeholder="Tulis pesan..."
              maxLength={100}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(212,160,23,0.2)',
                borderRadius: 8,
                padding: '7px 10px',
                color: '#f5f0e8',
                fontSize: '0.8rem',
                outline: 'none',
                fontFamily: 'Josefin Sans, sans-serif',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              style={{
                background: input.trim() ? 'linear-gradient(135deg, #b8860b, #d4a017)' : 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: 8,
                padding: '7px 12px',
                color: input.trim() ? '#1a1a1a' : 'rgba(245,240,232,0.3)',
                cursor: input.trim() ? 'pointer' : 'default',
                fontWeight: 700,
                fontSize: '0.8rem',
                transition: 'all 0.15s',
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { setIsOpen(o => !o); setUnread(0); resumeAudio() }}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a5c2e, #217a3c)',
          border: '2px solid rgba(212,160,23,0.5)',
          color: '#f5f0e8',
          fontSize: '1.2rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          position: 'relative',
          transition: 'all 0.2s',
        }}
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#e74c3c',
            color: '#fff',
            borderRadius: '50%',
            width: 18,
            height: 18,
            fontSize: '0.65rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
