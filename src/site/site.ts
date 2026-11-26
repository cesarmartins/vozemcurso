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
