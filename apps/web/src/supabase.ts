import { createClient } from '@supabase/supabase-js';

// Accept the project URL with or without a trailing /rest/v1/.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing');
