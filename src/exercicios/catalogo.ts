/** Categorias usadas tanto pelos arquivos do app quanto pelos áudios cadastrados. */
export const CATEGORIAS = [
  { id: 'aquecimento', nome: 'Aquecimento vocal', descricao: 'Preparação suave da voz.' },
  { id: 'vibracao', nome: 'Exercícios de vibração', descricao: 'Lábios, língua e trato vocal semiocluído.' },
  { id: 'respiracao', nome: 'Controle respiratório', descricao: 'Fluxo de ar, apoio e coordenação.' },
  { id: 'aparelhos', nome: 'Exercícios com aparelhos', descricao: 'Práticas com Respirom, Lax Vox e outros.' },
  { id: 'pre-show', nome: 'Pré-show', descricao: 'Rotinas para antes de cantar no palco.' },
  { id: 'pos-show', nome: 'Pós-show', descricao: 'Desaquecimento e recuperação vocal.' },
  { id: 'outros', nome: 'Outros exercícios', descricao: 'Exercícios ainda sem uma categoria específica.' },
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];

/**
 * Cadastre aqui os áudios que serão distribuídos junto com o app. Coloque os
 * arquivos em public/audios e use um caminho iniciado por /audios/.
 */
export interface ExercicioIncluido {
  id: string;
  nome: string;
  categoria: CategoriaId;
  audioUrl: string;
  equipamento?: string;
}

export const EXERCICIOS_INCLUIDOS: ExercicioIncluido[] = [];
