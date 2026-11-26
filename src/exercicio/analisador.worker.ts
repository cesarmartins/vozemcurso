import { detectarQuadros, estimarAfinacao, segmentar, type NotaPiano } from './extrairNotas';

export interface Pedido {
  amostras: Float32Array;
  taxa: number;
  a4: number;
}

export type Resposta = { tipo: 'progresso'; fracao: number } | { tipo: 'pronto'; notas: NotaPiano[]; afinacaoCents: number };

const responder = (r: Resposta) => postMessage(r);

onmessage = (e: MessageEvent<Pedido>) => {
  const { amostras, taxa, a4 } = e.data;
  const quadros = detectarQuadros(amostras, taxa, a4, (fracao) => responder({ tipo: 'progresso', fracao }));
  responder({ tipo: 'pronto', notas: segmentar(quadros), afinacaoCents: estimarAfinacao(quadros) });
};
