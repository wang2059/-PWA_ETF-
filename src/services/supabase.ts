import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getBrowserSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export function useMockData(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === 'true' || !import.meta.env.VITE_SUPABASE_URL
}
