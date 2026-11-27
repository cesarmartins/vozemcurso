import { criarServidorSupabase } from './supabase';

export * from './tipos';
export { SENHA_MIN } from './local';
export { ConfirmeEmail } from './supabase';

/** O servidor usado pelo app: Supabase. (A versão local, em local.ts, fica para os testes.) */
export const servidor = criarServidorSupabase();
