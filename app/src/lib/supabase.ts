import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim()

// False until both values are set and the URL is a real Supabase project address.
export const configured = Boolean(key && url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))

export const supabase = createClient(configured ? url! : 'http://localhost', configured ? key! : 'missing')
