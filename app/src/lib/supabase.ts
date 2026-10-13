import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

// False until the URL is a real Supabase project address and the key looks like a publishable key.
export const configured = Boolean(
  url && key && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && /^(sb_publishable_|eyJ)\S+$/.test(key),
)

export const supabase = createClient(configured ? url! : 'http://localhost', configured ? key! : 'missing')
