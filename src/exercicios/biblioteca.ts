import { EXERCICIOS_INCLUIDOS, type CategoriaId } from './catalogo';

const DB_NOME = 'afinador-vocal-biblioteca';
const DB_VERSAO = 1;
const STORE = 'exercicios';

export interface ExercicioPessoal {
  id: string;
  /** Conta que cadastrou: o professor (para a turma) ou o aluno independente. */
  donoId: string;
  nome: string;
  categoria: CategoriaId;
  equipamento: string;
  arquivoNome: string;
  audio: Blob;
  criadoEm: number;
}

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador não oferece armazenamento local para a biblioteca.'));
      return;
    }
    const pedido = indexedDB.open(DB_NOME, DB_VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível abrir a biblioteca.'));
  });
}

async function transacao<T>(modo: IDBTransactionMode, operacao: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirBanco();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const pedido = operacao(tx.objectStore(STORE));
    let resultado!: T;
    pedido.onsuccess = () => { resultado = pedido.result; };
    pedido.onerror = () => reject(pedido.error ?? new Error('Não foi possível acessar a biblioteca.'));
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Não foi possível salvar a alteração.'));
    };
    tx.onabort = () => db.close();
  });
}

/** Exercícios cadastrados por uma conta. */
export async function listarExercicios(donoId: string): Promise<ExercicioPessoal[]> {
  const todos = await transacao<ExercicioPessoal[]>('readonly', (store) => store.getAll());
  return todos.filter((e) => e.donoId === donoId);
}
export const salvarExercicio = (exercicio: ExercicioPessoal) => transacao<IDBValidKey>('readwrite', (store) => store.put(exercicio));
export const excluirExercicio = (id: string) => transacao<undefined>('readwrite', (store) => store.delete(id));

/** Total de exercícios: os pessoais deste navegador mais os distribuídos com o app. */
export async function contarExercicios(donoId: string): Promise<number> {
  return (await listarExercicios(donoId)).length + EXERCICIOS_INCLUIDOS.length;
}
