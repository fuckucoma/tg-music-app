import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && key ? createClient(url, key) : null;
let sequence = 0;

export function subscribeToCatalog(onChange: () => void) {
  if (!supabase) return;
  const channel = supabase
    .channel(`tracks-realtime-${++sequence}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'Track' }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
