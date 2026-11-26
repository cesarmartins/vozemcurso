# Biblioteca de exercícios

Há dois caminhos para incluir áudio:

1. **Áudios cadastrados no app:** coloque o arquivo em `public/audios/` e adicione um item a `EXERCICIOS_INCLUIDOS` em `src/exercicios/catalogo.ts`. Use uma das categorias definidas em `CATEGORIAS` e um caminho como `/audios/aquecimento-01.mp3`. Esses arquivos acompanham a versão distribuída do app.
2. **Áudios pessoais:** use o formulário “Minha biblioteca”. O arquivo e seus dados ficam no IndexedDB do navegador e são listados no card da categoria escolhida. Eles permanecem neste navegador e dispositivo; não são enviados a um servidor nem sincronizados.

Para exercícios com aparelhos, selecione “Exercícios com aparelhos” e informe o nome do aparelho, como Respirom ou Lax Vox. Pré-show e Pós-show têm categorias próprias.
