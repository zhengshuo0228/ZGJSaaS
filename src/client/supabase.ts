import { createClient } from '@supabase/supabase-js'
import 'expo-sqlite/localStorage/install';

const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'sb-auth-token',
    // @ts-expect-error lockTimeout 在 @supabase/auth-js@2.103 中已支持，但类型声明尚未同步
    lockTimeout: 30000,
  },
})
