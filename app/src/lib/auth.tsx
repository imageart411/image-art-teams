import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Person } from './types'

interface AuthState {
  loading: boolean
  session: Session | null
  // The team record for the signed-in email. Null means the office has not added them.
  person: Person | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) {
        setPerson(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('people')
      .select('id,email,name,initials,role,active')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setPerson((data as Person | null) ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ loading, session, person, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
