import { createClient } from '@supabase/supabase-js';

// Projeto Supabase do Voz em Curso. A chave abaixo é a pública (publishable): pode ficar
// no site. Quem protege os dados são as regras de acesso do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave secreta (service_role / secret).
export const SUPABASE_URL = 'https://saywzauwvkfgeggbhhqf.supabase.co';
export const SUPABASE_CHAVE_PUBLICA = 'sb_publishable_k7Joj35rmrwggYrsucdDaA_cTjp7esX';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Pasta (bucket) dos áudios dos exercícios. */
export const BUCKET_AUDIOS = 'exercicios';
