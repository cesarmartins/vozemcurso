// Exercícios padrão Voz em Curso: vêm com o app, para todo professor e aluno.
// Dois tipos:
// - "tempo": passo a passo com cronômetro (aparelhos, respiração, dicção…);
// - "vocalise": o app gera o piano sozinho e o aluno canta com o gráfico de afinação.

import type { CategoriaId } from '../exercicios/catalogo';

interface Base {
  id: string;
  nome: string;
  categoria: CategoriaId;
  /** Aparelho necessário (Canudo, Lax Vox, Respirom…), ou vazio. */
  aparelho: string;
  /** Uma frase sobre para que serve. */
  objetivo: string;
  instrucoes: string[];
  /** Cuidado ou dica final, mostrado em destaque. */
  dica?: string;
}

export interface ExercicioTempo extends Base {
  tipo: 'tempo';
  /** Tempo sugerido, em segundos. */
  duracao: number;
  /** "3 × 10" — séries e repetições, quando fizer sentido. */
  series?: string;
  /** Textos para ler em voz alta (dicção). */
  textos?: string[];
}

/** Padrão de notas em semitons a partir da tônica (ex.: escala 1-2-3-4-5-4-3-2-1). */
export interface ExercicioVocalise extends Base {
  tipo: 'vocalise';
  padrao: number[];
  /** Duração de cada nota, em segundos. */
  nota: number;
  /** Quantas vezes sobe meio tom (e depois desce de volta). */
  subidas: number;
}

export type ExercicioPadrao = ExercicioTempo | ExercicioVocalise;

/** Identificador usado no histórico de práticas, para não misturar com os áudios da biblioteca. */
export const idPratica = (e: ExercicioPadrao) => `padrao:${e.id}`;

export const EXERCICIOS_PADRAO: ExercicioPadrao[] = [
  // ---------- Respiração ----------
  {
    id: 'respiracao-sss',
    tipo: 'tempo',
    nome: 'Sopro contínuo em "sss"',
    categoria: 'respiracao',
    aparelho: '',
    duracao: 120,
    series: '5 sopros',
    objetivo: 'Controlar a saída do ar, base para sustentar as notas.',
    instrucoes: [
      'Em pé ou sentado com a coluna alongada e os ombros soltos.',
      'Inspire pelo nariz em 4 tempos, sentindo a barriga e as costelas abrirem.',
      'Solte o ar num "sss" contínuo e uniforme, sem apertar a garganta.',
      'Vá até onde for confortável, descanse e repita. Tente manter o som sempre igual do começo ao fim.',
    ],
    dica: 'Não force até o fim do ar. Se sentir tontura, pare e respire normalmente.',
  },
  {
    id: 'respirom',
    tipo: 'tempo',
    nome: 'Respirom: força para inspirar',
    categoria: 'aparelhos',
    aparelho: 'Respirom',
    duracao: 150,
    series: '3 × 10',
    objetivo: 'Fortalecer a musculatura da respiração com resistência.',
    instrucoes: [
      'Ajuste o Respirom na carga combinada com seu professor ou fonoaudiólogo.',
      'Sentado, com a coluna reta, solte todo o ar fora do aparelho.',
      'Coloque o bocal e inspire com firmeza pelo Respirom.',
      'Tire o bocal e solte o ar devagar. Faça 10 respirações, descanse 30 segundos e repita as séries.',
    ],
    dica: 'Comece com carga leve. Se sentir tontura, descanse antes da próxima série.',
  },

  // ---------- Aparelhos (exercícios de trato vocal semiocluído) ----------
  {
    id: 'canudo-continuo',
    tipo: 'tempo',
    nome: 'Canudo: som contínuo',
    categoria: 'aparelhos',
    aparelho: 'Canudo',
    duracao: 120,
    objetivo: 'Aquecer a voz com pouco esforço e equilibrar o ar com a vibração.',
    instrucoes: [
      'Coloque um canudo entre os lábios, fechando bem ao redor dele.',
      'Faça um "uuu" numa nota confortável, sem inflar as bochechas.',
      'Sinta a vibração nos lábios e no rosto. Mantenha de 5 a 8 segundos e respire.',
      'Repita mudando a nota aos poucos, sempre na região confortável.',
    ],
    dica: 'O som sai baixinho mesmo: o trabalho está acontecendo por dentro.',
  },
  {
    id: 'canudo-sirene',
    tipo: 'tempo',
    nome: 'Canudo: sirene',
    categoria: 'aparelhos',
    aparelho: 'Canudo',
    duracao: 120,
    objetivo: 'Ligar o grave ao agudo sem quebras.',
    instrucoes: [
      'Com o canudo nos lábios, comece numa nota grave confortável.',
      'Deslize para o agudo e volte, como uma sirene, sem parar o som.',
      'Aumente a extensão aos poucos a cada repetição.',
      'Se a voz "quebrar", diminua a extensão e passe devagar por esse ponto.',
    ],
  },
  {
    id: 'laxvox',
    tipo: 'tempo',
    nome: 'Lax Vox: bolhas na água',
    categoria: 'aparelhos',
    aparelho: 'Lax Vox',
    duracao: 180,
    objetivo: 'Relaxar e aquecer a voz com a resistência da água.',
    instrucoes: [
      'Encha uma garrafa com água e coloque a ponta do tubo de 2 a 5 cm abaixo da superfície.',
      'Faça um "uuu" contínuo pelo tubo, formando bolhas constantes.',
      'Depois faça sirenes do grave ao agudo, mantendo as bolhas regulares.',
      'Termine cantando uma melodia simples pelo tubo.',
    ],
    dica: 'Quanto mais fundo o tubo, mais resistência. Comece raso.',
  },

  // ---------- Vibração (sem aparelho) ----------
  {
    id: 'vibracao-labios',
    tipo: 'tempo',
    nome: 'Vibração de lábios (brrr)',
    categoria: 'vibracao',
    aparelho: '',
    duracao: 120,
    objetivo: 'Soltar a musculatura e aquecer com leveza.',
    instrucoes: [
      'Solte os lábios e sopre fazendo "brrr", como um motorzinho.',
      'Se os lábios travarem, apoie as pontas dos dedos nas bochechas.',
      'Mantenha numa nota confortável e depois faça escalas e sirenes.',
    ],
  },
  {
    id: 'vibracao-lingua',
    tipo: 'tempo',
    nome: 'Vibração de língua (trrr)',
    categoria: 'vibracao',
    aparelho: '',
    duracao: 90,
    objetivo: 'Soltar a língua e a articulação.',
    instrucoes: [
      'Encoste a ponta da língua atrás dos dentes de cima e sopre fazendo "trrr".',
      'Mantenha numa nota confortável, depois deslize do grave ao agudo.',
      'Se não sair, faça só com o sopro, sem som, até a língua vibrar.',
    ],
  },

  // ---------- Aquecimento com piano ----------
  {
    id: 'escala-5-notas',
    tipo: 'vocalise',
    nome: 'Escala de 5 notas',
    categoria: 'aquecimento',
    aparelho: '',
    padrao: [0, 2, 4, 5, 7, 5, 4, 2, 0],
    nota: 0.45,
    subidas: 5,
    objetivo: 'Afinar subindo e descendo a escala, meio tom de cada vez.',
    instrucoes: [
      'Use fones de ouvido.',
      'Cante junto com o piano em "u" ou "a": 1-2-3-4-5-4-3-2-1.',
      'A cada repetição o piano sobe meio tom; no fim, desce de volta.',
      'Olhe o gráfico: a linha verde em cima das barras é a nota certa.',
    ],
  },
  {
    id: 'arpejo',
    tipo: 'vocalise',
    nome: 'Arpejo 1-3-5-8',
    categoria: 'aquecimento',
    aparelho: '',
    padrao: [0, 4, 7, 12, 7, 4, 0],
    nota: 0.5,
    subidas: 4,
    objetivo: 'Treinar saltos afinados entre as notas do acorde.',
    instrucoes: [
      'Use fones de ouvido.',
      'Cante em "a" ou "ô" acompanhando o piano: 1-3-5-8-5-3-1.',
      'Mire a nota antes de cantar, sem escorregar entre elas.',
    ],
  },
  {
    id: 'nota-longa',
    tipo: 'vocalise',
    nome: 'Notas longas',
    categoria: 'aquecimento',
    aparelho: '',
    padrao: [0, 2, 4],
    nota: 1.6,
    subidas: 3,
    objetivo: 'Sustentar a nota afinada e estável, sem oscilar.',
    instrucoes: [
      'Use fones de ouvido.',
      'Cante cada nota do piano em "a", segurando até a próxima.',
      'Tente deixar a linha da voz reta e verde no gráfico.',
    ],
  },

  // ---------- Dicção ----------
  {
    id: 'trava-linguas',
    tipo: 'tempo',
    nome: 'Trava-línguas',
    categoria: 'diccao',
    aparelho: '',
    duracao: 120,
    objetivo: 'Deixar a articulação clara e ágil.',
    instrucoes: [
      'Leia cada frase devagar, exagerando os movimentos da boca.',
      'Repita três vezes, acelerando aos poucos sem perder a clareza.',
    ],
    textos: [
      'O rato roeu a roupa do rei de Roma.',
      'Três pratos de trigo para três tigres tristes.',
      'O peito do pé de Pedro é preto.',
      'A aranha arranha a rã. A rã arranha a aranha.',
      'Num ninho de mafagafos há sete mafagafinhos.',
    ],
  },
  {
    id: 'leitura-rolha',
    tipo: 'tempo',
    nome: 'Leitura com rolha',
    categoria: 'diccao',
    aparelho: 'Rolha',
    duracao: 120,
    objetivo: 'Fortalecer a articulação para a letra ficar clara ao cantar.',
    instrucoes: [
      'Segure uma rolha (ou uma caneta) entre os dentes da frente, sem morder forte.',
      'Leia um trecho de uma música em voz alta, tentando ser entendido.',
      'Tire a rolha e leia de novo: perceba como as palavras ficam mais claras.',
    ],
    dica: 'Pare se sentir dor na mandíbula.',
  },
  {
    id: 'vogais',
    tipo: 'tempo',
    nome: 'Vogais bem abertas',
    categoria: 'diccao',
    aparelho: '',
    duracao: 60,
    objetivo: 'Abrir espaço na boca e definir cada vogal.',
    instrucoes: [
      'Fale A, É, Ê, I, Ó, Ô, U devagar, exagerando o formato da boca.',
      'Depois cante as mesmas vogais numa nota confortável, mantendo o formato.',
    ],
  },

  // ---------- Desaquecimento ----------
  {
    id: 'bocejo-suspiro',
    tipo: 'tempo',
    nome: 'Bocejo-suspiro',
    categoria: 'pos-show',
    aparelho: '',
    duracao: 60,
    objetivo: 'Relaxar a garganta depois do treino.',
    instrucoes: [
      'Boceje de verdade, sentindo a garganta abrir.',
      'Solte o ar num suspiro com som, do médio para o grave.',
      'Repita devagar algumas vezes.',
    ],
  },
  {
    id: 'canudo-grave',
    tipo: 'tempo',
    nome: 'Canudo descendo para o grave',
    categoria: 'pos-show',
    aparelho: 'Canudo',
    duracao: 90,
    objetivo: 'Desaquecer e devolver a voz à fala.',
    instrucoes: [
      'Com o canudo, faça sirenes curtas sempre descendo, do médio para o grave.',
      'Termine numa nota da sua voz de fala, bem leve.',
    ],
  },
];

export const padraoPorId = new Map(EXERCICIOS_PADRAO.map((e) => [e.id, e] as const));

/** Duração estimada de um vocalise: subir e descer, com respiro entre as repetições. */
export function duracaoVocalise(e: ExercicioVocalise): number {
  const repeticoes = e.subidas * 2 + 1;
  return Math.round(repeticoes * (e.padrao.length * e.nota + 1.2));
}

export const duracaoDe = (e: ExercicioPadrao) => (e.tipo === 'tempo' ? e.duracao : duracaoVocalise(e));
