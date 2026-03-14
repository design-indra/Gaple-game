import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('Username dan password wajib diisi.')
      return
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter.')
      return
    }

    setLoading(true)
    // Use email format: username@gaple.local for Supabase Auth
    const email = `${username.trim().toLowerCase()}@gaple.local`

    try {
      if (mode === 'register') {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        })
        if (err) throw err
        // Insert into profiles table
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username.trim(),
          })
        }
        router.push('/lobby')
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
        router.push('/lobby')
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Username atau password salah.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit() }

  return (
    <>
      <Head>
        <title>Gaple Online</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="login-page">
        <div className="login-card">
          {/* Decorative domino icons */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 20,
            opacity: 0.4
          }}>
            {[[6,6],[5,5],[4,4]].map(([a,b]) => (
              <div key={`${a}-${b}`} style={{
                width: 28, height: 48,
                background: '#fffdf5',
                borderRadius: 4,
                border: '1px solid #444',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: 3,
              }}>
                <span style={{ fontSize: 10, color: '#222', lineHeight: 1 }}>{a}</span>
                <div style={{ width: '70%', height: 1, background: '#444' }} />
                <span style={{ fontSize: 10, color: '#222', lineHeight: 1 }}>{b}</span>
              </div>
            ))}
          </div>

          <h1 className="login-title">GAPLE</h1>
          <p className="login-subtitle">Online Multiplayer</p>

          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="Masukkan username..."
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Masukkan password..."
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          {mode === 'login' ? (
            <>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Masuk...' : 'Masuk'}
              </button>
              <button className="btn-secondary" onClick={() => { setMode('register'); setError('') }}>
                Daftar Akun Baru
              </button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Mendaftar...' : 'Daftar'}
              </button>
              <button className="btn-secondary" onClick={() => { setMode('login'); setError('') }}>
                Sudah punya akun? Masuk
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
