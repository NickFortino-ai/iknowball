import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// NEITHER AUTH OPTION IS REDUNDANT. Both are load-bearing for the password
// reset flow, and both will look removable to a future reader.
//
// flowType: 'implicit' — ResetPasswordPage parses `access_token` out of the
// URL fragment by hand. Tokens only arrive there under the implicit flow.
// Under PKCE the reset link carries `?code=` in the QUERY STRING instead and
// needs supabase.auth.exchangeCodeForSession — a different exchange, not a
// different place to look. Flip this to 'pkce' without rewriting that page
// and every valid reset link reports "Invalid or Expired Link", for every
// user, with nothing in the logs to explain it.
//
// It currently matches the auth-js 2.95.3 default, which is what makes it
// look safe to delete. Later versions default to PKCE, so on a dependency
// bump this line is the only thing holding the flow in place.
//
// detectSessionInUrl: false — the counterpart. With it ON, the library
// consumes and STRIPS the fragment during initialization, so a synchronous
// hash read on mount can find an empty hash on a perfectly valid link and
// call it invalid. Leaving detection on is viable, but only if every
// fragment read is gated behind an await that blocks on initialization
// (getSession awaits initializePromise). We took the structural option
// instead: nothing races because nothing else is reading.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
})
