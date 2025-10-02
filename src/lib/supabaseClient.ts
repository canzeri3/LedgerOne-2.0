'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const missingMessage = 'Supabase environment variables are not configured.'

export const supabaseBrowser: SupabaseClient =
  url && anonKey
    ? createBrowserClient(url, anonKey)
    : (({
        auth: {
          async getUser() {
            return { data: { user: null }, error: new Error(missingMessage) }
          },
          async signInWithOtp() {
            return { error: new Error(missingMessage) }
          },
          async signOut() {
            return { error: new Error(missingMessage) }
          },
          onAuthStateChange() {
            return {
              data: {
                subscription: { unsubscribe() {} },
              },
            }
          },
          async setSession() {
            return { data: null, error: new Error(missingMessage) }
          },
          async signInWithPassword() {
            return { data: null, error: new Error(missingMessage) }
          },
        },
        from() {
          return {
            select: () => Promise.reject(new Error(missingMessage)),
            insert: () => Promise.reject(new Error(missingMessage)),
            update: () => Promise.reject(new Error(missingMessage)),
            delete: () => Promise.reject(new Error(missingMessage)),
            upsert: () => Promise.reject(new Error(missingMessage)),
            eq: () => Promise.reject(new Error(missingMessage)),
            not: () => Promise.reject(new Error(missingMessage)),
            order: () => Promise.reject(new Error(missingMessage)),
            limit: () => Promise.reject(new Error(missingMessage)),
            maybeSingle: () => Promise.reject(new Error(missingMessage)),
          }
        },
      } as unknown as SupabaseClient))

