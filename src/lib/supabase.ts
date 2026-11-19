import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Only the public (publishable/anon) key ever ships to the browser.
// All writes are enforced server-side by row-level security + RPC functions.
export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured')

export function errMsg(e: unknown): string {
  if (!e) return 'Something went wrong'
  if (typeof e === 'string') return e
  if (typeof e === 'object' && 'message' in (e as object)) return String((e as { message: unknown }).message)
  return 'Something went wrong'
}

/** Call a SECURITY DEFINER function. Throws an Error with the server's message. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

/** Unwrap a Supabase query result or throw. */
export async function q<T>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (c) => '\\' + c)
}
