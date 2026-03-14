# 🎴 Gaple Online

Game Gaple multiplayer online berbasis web. Dimainkan 2-4 pemain di satu meja, dengan tampilan meja hijau seperti gaple sungguhan.

## Fitur
- 🔐 Login & Daftar akun (username + password)
- 🏠 Lobby dengan daftar meja
- 🎴 Gameplay gaple multiplayer realtime (Supabase Realtime)
- 📱 Desain landscape, cocok untuk tablet & desktop
- 🖱️ Drag kartu atau klik 2x untuk memainkan
- 🏆 Deteksi menang & permainan buntu otomatis

## Tech Stack
- **Frontend**: Next.js 14 (React)
- **Backend/Auth/Realtime**: Supabase
- **Deployment**: Vercel

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/username/gaple-game.git
cd gaple-game
npm install
```

### 2. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → New Project
2. Masuk ke **SQL Editor**
3. Copy-paste isi file `supabase-schema.sql` dan jalankan
4. Pastikan Realtime aktif untuk tabel `rooms`

### 3. Konfigurasi Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Nilai ini ada di: **Supabase Dashboard → Settings → API**

### 4. Jalankan Lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

### 5. Deploy ke Vercel

1. Push ke GitHub
2. Buka [vercel.com](https://vercel.com) → Import repository
3. Tambahkan Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

---

## Cara Bermain

1. **Daftar** akun baru atau **masuk** dengan akun yang ada
2. Di lobby, **Buat Meja** baru atau **gabung** meja yang tersedia
3. Tunggu hingga minimal 2 pemain bergabung
4. **Host** (pembuat meja) klik **Mulai Permainan**
5. Pemain dengan **6-6** (atau dobel tertinggi) mulai duluan
6. **Klik** kartu untuk memilih, **klik lagi** atau **drag** ke meja untuk memainkan
7. Kartu yang bisa dimainkan akan **berkedip hijau**
8. Menang jika kartu kamu habis duluan!

---

## Aturan Gaple

- 28 kartu domino (0-0 sampai 6-6)
- Setiap pemain mendapat 7 kartu
- Kartu harus cocok dengan ujung kiri atau kanan meja
- Jika tidak bisa main → giliran lewat
- **Gaple** = kartu dobel yang cocok dengan ujung meja (nilai bonus)
- Jika semua pemain tidak bisa main → **buntu**, menang yang pip-nya paling sedikit

---

## Struktur File

```
gaple-game/
├── pages/
│   ├── index.js          # Halaman login/daftar
│   ├── lobby.js          # Lobby - daftar meja
│   └── game/[roomId].js  # Halaman permainan
├── components/
│   └── DominoCard.js     # Komponen kartu domino
├── lib/
│   ├── supabase.js       # Supabase client
│   └── gaple.js          # Logic permainan gaple
├── styles/
│   └── globals.css       # Styling lengkap
├── supabase-schema.sql   # Schema database
└── .env.local.example    # Template environment
```

---

## Roadmap

- [ ] Fitur chat dalam game
- [ ] Sistem skor & leaderboard
- [ ] Animasi kartu lebih halus
- [ ] Suara efek kartu
- [ ] Mode turnamen
- [ ] Timer per giliran
