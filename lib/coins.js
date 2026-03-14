import { supabase } from './supabase'

export const STARTING_COINS   = 1_000_000   // koin awal daftar
export const BET_PER_PLAYER   = 100_000     // taruhan per pemain per game
export const DAILY_BONUS      = 200_000     // bonus harian
export const MIN_COINS_TO_PLAY = 50_000     // minimum untuk masuk meja

// Format angka koin: 1500000 → "1.500.000"
export function formatCoins(n) {
  if (n == null) return '0'
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace('.0','') + 'M'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace('.0','') + 'jt'
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'rb'
  return n.toLocaleString('id-ID')
}

// Ambil profil + koin user
export async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

// Ambil banyak profil sekaligus
export async function getProfiles(userIds) {
  if (!userIds?.length) return []
  const { data } = await supabase
    .from('profiles')
    .select('id, username, coins, total_wins, total_games')
    .in('id', userIds)
  return data || []
}

// Berikan koin awal saat daftar (dipanggil dari register)
export async function giveStartingCoins(userId, username) {
  await supabase.from('profiles').upsert({
    id: userId,
    username,
    coins: STARTING_COINS,
    total_wins: 0,
    total_games: 0,
  })
  await logTransaction(userId, STARTING_COINS, 'bonus', null, 'Koin awal pendaftaran')
}

// Proses koin setelah game selesai
// winner = index pemenang dalam array players
// players = [{ id, username }, ...]
export async function processGameCoins(players, winnerIdx, roomId) {
  if (!players?.length || winnerIdx < 0) return

  const winnerId = players[winnerIdx]?.id
  const loserIds = players.filter((_, i) => i !== winnerIdx).map(p => p.id)

  const totalPrize = BET_PER_PLAYER * players.length  // total pot
  const winnerGain  = totalPrize - BET_PER_PLAYER      // net gain (sudah bayar bet sendiri)
  const loserDeduct = BET_PER_PLAYER                   // yang kalah kehilangan bet

  const updates = []

  // Winner: tambah koin + update stats
  updates.push(
    supabase.rpc('add_coins', { p_user_id: winnerId, p_amount: winnerGain })
      .then(() => supabase.from('profiles').select('coins').eq('id', winnerId).single()
        .then(({ data }) => supabase.from('profiles').update({
          total_wins: supabase.rpc ? undefined : undefined, // handled in SQL
        }).eq('id', winnerId))
      )
  )

  // Simpler approach: direct update
  // Get all current coins first
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, coins, total_wins, total_games')
    .in('id', players.map(p => p.id))

  if (!profilesData) return

  const updatePromises = profilesData.map(async (profile) => {
    const isWinner = profile.id === winnerId
    const newCoins = isWinner
      ? Math.max(0, profile.coins + winnerGain)
      : Math.max(0, profile.coins - loserDeduct)

    await supabase.from('profiles').update({
      coins: newCoins,
      total_wins: isWinner ? profile.total_wins + 1 : profile.total_wins,
      total_games: profile.total_games + 1,
    }).eq('id', profile.id)

    // Log transaction
    await logTransaction(
      profile.id,
      isWinner ? winnerGain : -loserDeduct,
      isWinner ? 'win' : 'lose',
      roomId,
      isWinner
        ? `Menang! +${formatCoins(winnerGain)} koin`
        : `Kalah. -${formatCoins(loserDeduct)} koin`
    )
  })

  await Promise.all(updatePromises)
}

// Log transaksi koin
async function logTransaction(userId, amount, type, roomId, description) {
  await supabase.from('coin_transactions').insert({
    user_id: userId,
    amount,
    type,
    room_id: roomId,
    description,
  })
}

// Cek & berikan bonus harian
export async function claimDailyBonus(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('coins, last_daily_bonus')
    .eq('id', userId)
    .single()

  if (!profile) return { success: false, message: 'Profil tidak ditemukan' }

  const lastBonus = profile.last_daily_bonus ? new Date(profile.last_daily_bonus) : null
  const now = new Date()

  if (lastBonus) {
    const hoursSince = (now - lastBonus) / 1000 / 3600
    if (hoursSince < 24) {
      const hoursLeft = Math.ceil(24 - hoursSince)
      return { success: false, message: `Bonus tersedia dalam ${hoursLeft} jam lagi` }
    }
  }

  const newCoins = profile.coins + DAILY_BONUS
  await supabase.from('profiles').update({
    coins: newCoins,
    last_daily_bonus: now.toISOString(),
  }).eq('id', userId)

  await logTransaction(userId, DAILY_BONUS, 'daily', null, 'Bonus harian')

  return { success: true, amount: DAILY_BONUS, newCoins }
}
