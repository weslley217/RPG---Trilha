import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://hmqznjjfzllkxeqqjrzm.supabase.co';
const fallbackAnonKey = 'sb_publishable_iqgn7xc6giRLAFEKiDfnHA_rzkErpeH';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Configuração do Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});

