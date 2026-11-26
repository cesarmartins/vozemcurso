import '../style.css';
import './site.css';

// Menu do celular.
const botao = document.querySelector<HTMLButtonElement>('.menu-btn');
const menu = document.getElementById('siteNav');
if (botao && menu) {
  const fechar = () => {
    menu.classList.remove('open');
    botao.setAttribute('aria-expanded', 'false');
  };
  botao.addEventListener('click', () => {
    const abrir = !menu.classList.contains('open');
    menu.classList.toggle('open', abrir);
    botao.setAttribute('aria-expanded', String(abrir));
  });
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) fechar();
  });
}

const ano = document.getElementById('ano');
if (ano) ano.textContent = String(new Date().getFullYear());

// Calculadora do plano do professor: R$ 9,90 por aluno ativo.
const PRECO_POR_ALUNO = 9.9;
const faixa = document.getElementById('calcAlunos') as HTMLInputElement | null;
const qtd = document.getElementById('calcQtd');
const total = document.getElementById('calcTotal');
if (faixa && qtd && total) {
  const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const atualizar = () => {
    const n = Number(faixa.value);
    qtd.textContent = String(n);
    total.innerHTML = `<b>${reais(n * PRECO_POR_ALUNO)}</b> por mês · ${n === 1 ? '1 aluno' : `${n} alunos`}`;
  };
  faixa.addEventListener('input', atualizar);
  atualizar();
}
