import { armazenamentoNavegador, criarServidorLocal } from './local';

export * from './tipos';
export { SENHA_MIN } from './local';

/** O servidor usado pelo app. Para produção, troque esta linha pela versão com banco. */
export const servidor = criarServidorLocal(armazenamentoNavegador);
