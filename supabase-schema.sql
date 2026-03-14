-- =============================================
-- GAPLE ONLINE - Supabase Schema
-- Jalankan di Supabase SQL Editor
-- =============================================

-- Profiles table (username publik)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles visible to all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id UUID REFERENCES auth.users(id),
  players JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  game_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rooms visible to all" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert rooms" ON public.rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update rooms" ON public.rooms FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Host can delete room" ON public.rooms FOR DELETE USING (auth.uid() = host_id);

-- Chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL CHECK (char_length(message) <= 200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chat visible to all" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated can chat" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable Realtime for rooms AND chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Auto-delete chat messages older than 24 jam (optional)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('clean-chat', '0 * * * *', $$DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '24 hours'$$);

