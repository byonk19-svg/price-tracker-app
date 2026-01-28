import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://dsjduvpnwldmfddoqsru.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzamR1dnBud2xkbWZkZG9xc3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTI2NDcsImV4cCI6MjA4NDY2ODY0N30.O-UmV5jR_-wrAluRMebxjaMtZpRM3MaEY7EvFnYEe0U'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

