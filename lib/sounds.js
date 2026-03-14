// =============================================
// SOUND MANAGER — Web Audio API (no external files needed)
// =============================================

let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

function playTone({ frequency = 440, type = 'sine', duration = 0.15, volume = 0.3, delay = 0, attack = 0.01, decay = 0.1 }) {
  try {
    const ac = getCtx()
    const osc = ac.createOscillator()
    const gain = ac.createGain()

    osc.connect(gain)
    gain.connect(ac.destination)

    osc.type = type
    osc.frequency.setValueAtTime(frequency, ac.currentTime + delay)

    gain.gain.setValueAtTime(0, ac.currentTime + delay)
    gain.gain.linearRampToValueAtTime(volume, ac.currentTime + delay + attack)
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration + decay)

    osc.start(ac.currentTime + delay)
    osc.stop(ac.currentTime + delay + duration + decay + 0.05)
  } catch (e) { /* silent fail */ }
}

// Kartu digeser ke meja (percikan kayu)
export function playCardPlace() {
  playTone({ frequency: 180, type: 'triangle', duration: 0.08, volume: 0.4, decay: 0.12 })
  playTone({ frequency: 120, type: 'sawtooth', duration: 0.06, volume: 0.2, delay: 0.03, decay: 0.1 })
}

// Giliran kamu — ping lembut
export function playYourTurn() {
  playTone({ frequency: 660, type: 'sine', duration: 0.1, volume: 0.25, decay: 0.2 })
  playTone({ frequency: 880, type: 'sine', duration: 0.1, volume: 0.2, delay: 0.12, decay: 0.25 })
}

// Kartu tidak valid — error buzz
export function playInvalid() {
  playTone({ frequency: 200, type: 'sawtooth', duration: 0.08, volume: 0.2, decay: 0.08 })
  playTone({ frequency: 180, type: 'sawtooth', duration: 0.08, volume: 0.15, delay: 0.1, decay: 0.08 })
}

// Menang — fanfare kecil
export function playWin() {
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    playTone({ frequency: freq, type: 'sine', duration: 0.15, volume: 0.3, delay: i * 0.12, decay: 0.2 })
  })
}

// Kalah — turun
export function playLose() {
  const notes = [400, 350, 280, 220]
  notes.forEach((freq, i) => {
    playTone({ frequency: freq, type: 'triangle', duration: 0.15, volume: 0.25, delay: i * 0.1, decay: 0.15 })
  })
}

// Pesan chat masuk — pop kecil
export function playChatMessage() {
  playTone({ frequency: 900, type: 'sine', duration: 0.05, volume: 0.15, decay: 0.1 })
}

// Pemain baru bergabung
export function playPlayerJoin() {
  playTone({ frequency: 440, type: 'sine', duration: 0.1, volume: 0.2, decay: 0.15 })
  playTone({ frequency: 550, type: 'sine', duration: 0.1, volume: 0.18, delay: 0.12, decay: 0.2 })
}

// Resume AudioContext setelah user interaction
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume()
}
