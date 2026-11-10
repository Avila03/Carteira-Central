// Elementos de identidade da Carteira Central: ícones gravados, ilustrações, carimbos e a moeda CC.
import { estado, esc } from "./base.js";

// Nome do dono, para a saudação, a cédula, os cartões e o extrato
export const nomeDono = () => (estado.d?.prefs?.nome || estado.sessao?.user?.user_metadata?.nome || "").trim();
export const nomeNoCartao = () => (estado.d?.prefs?.nome_cartao || nomeDono()).toUpperCase().trim();

// Saudação pelo horário de São Paulo
export function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
export const dataPorExtenso = () => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());

// ---------- ícones da barra, no traço da gravura (linha dupla) ----------
const svg = (corpo, tam = 24) => `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const fino = (d) => `<path d="${d}" stroke-width=".7" opacity=".7"/>`;
export const ICONES_NAV = {
  // casa com uma segunda linha interna, como um selo gravado
  inicio: svg(`<path d="M3.5 10.2 12 3.5l8.5 6.7V20a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8z"/>${fino("M6 11.4 12 6.7l6 4.7v7.4H6z")}<path d="M10 20.8v-5.3h4v5.3"/>`),
  // cartão com chip e linhas de gravura
  cartoes: svg(`<rect x="2.5" y="5.5" width="19" height="13" rx="2.2"/><rect x="5.2" y="9" width="4" height="3.2" rx=".7"/>${fino("M2.5 15.5c3-1.6 6-1.6 9.5 0s6.5 1.6 9.5 0")}${fino("M12 9.6h6.5M12 11.6h4.5")}`),
  // livro-razão: folha com linhas e margem dupla
  lancamentos: svg(`<path d="M6 3.5h10.5L19.5 6.5V20.5H6z"/>${fino("M8.2 3.5v17")}<path d="M10.5 9h6M10.5 12.5h6M10.5 16h4"/>${fino("M16.5 3.5v3h3")}`),
  // três moedas empilhadas em perspectiva
  mais: svg(`<ellipse cx="12" cy="7" rx="6.5" ry="2.6"/><path d="M5.5 7v4c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6V7"/><path d="M5.5 11v4c0 1.4 2.9 2.6 6.5 2.6s6.5-1.2 6.5-2.6v-4"/>${fino("M8.5 7.6c2.2.7 4.8.7 7 0")}`),
};

// ---------- ilustrações das telas vazias (gravura em linha) ----------
const ilus = (corpo) => `<svg class="cc-ilustra" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 84" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
const hachura = (x1, y1, x2, y2, n, dx, dy) => Array.from({ length: n }, (_, i) => `<path d="M${x1 + i * dx} ${y1 + i * dy}L${x2 + i * dx} ${y2 + i * dy}" stroke-width=".5" opacity=".55"/>`).join("");
export const ILUSTRACOES = {
  cofre: ilus(`<rect x="30" y="14" width="60" height="54" rx="5" stroke-width="1.4"/><rect x="35" y="19" width="50" height="44" rx="3" stroke-width=".7" opacity=".7"/><circle cx="60" cy="41" r="11" stroke-width="1.3"/><circle cx="60" cy="41" r="6.5" stroke-width=".7"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const r = (a * Math.PI) / 180; return `<path d="M${(60 + 6.5 * Math.cos(r)).toFixed(1)} ${(41 + 6.5 * Math.sin(r)).toFixed(1)}L${(60 + 11 * Math.cos(r)).toFixed(1)} ${(41 + 11 * Math.sin(r)).toFixed(1)}" stroke-width=".6"/>`; }).join("")}<path d="M80 34v14" stroke-width="2"/><path d="M36 68v5M84 68v5" stroke-width="1.4"/>${hachura(38, 22, 44, 22, 6, 0, 3)}`),
  moeda: ilus(`<ellipse cx="60" cy="58" rx="26" ry="8" stroke-width="1.2"/><path d="M34 58v-6c0 4.4 11.6 8 26 8s26-3.6 26-8v6" stroke-width="1.2"/><circle cx="60" cy="32" r="20" stroke-width="1.4"/><circle cx="60" cy="32" r="16" stroke-width=".6" opacity=".7"/><path d="M60 22v20M65 26.5c-1-1.6-3-2.5-5-2.5-3 0-5 1.6-5 3.8 0 5.4 10.5 2.6 10.5 8.4 0 2.3-2.3 3.8-5.5 3.8-2.4 0-4.4-1-5.5-2.7" stroke-width="1.3"/>${hachura(30, 12, 38, 4, 6, 4, 0)}`),
  envelope: ilus(`<rect x="24" y="22" width="72" height="46" rx="3" stroke-width="1.4"/><path d="M24 25l36 26 36-26" stroke-width="1.3"/><path d="M24 66l27-20M96 66L69 46" stroke-width=".8" opacity=".75"/><circle cx="60" cy="52" r="6" stroke-width="1"/><path d="M57.5 52l2 2 3.5-4" stroke-width="1"/>${hachura(30, 62, 40, 54, 5, 3, 0)}`),
};
export function ilustracaoPara(texto) {
  const t = String(texto).toLowerCase();
  if (/assinatura|aviso|lançamento|lancamento|pagamento|fatura|conectad|conex/.test(t)) return ILUSTRACOES.envelope;
  if (/meta|reserva|objetivo|guard|pessoa|acerto|racha|dívida|divida/.test(t)) return ILUSTRACOES.cofre;
  return ILUSTRACOES.moeda;
}

// ---------- carimbos ----------
export const carimbo = (texto, tipo = "") => `<span class="cc-carimbo ${tipo}" role="img" aria-label="${esc(texto)}">${esc(texto)}</span>`;
// Carimbo grande que "bate" na tela ao quitar ou pagar algo
export function carimbar(texto) {
  const el = document.createElement("div");
  el.className = "cc-carimbada";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<span>${esc(texto)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("sai"), 1100);
  setTimeout(() => el.remove(), 1600);
}

// ---------- a moeda CC (atualizar puxando, carregando) ----------
export const moedaCC = (tam = 44) => `<span class="cc-moeda" style="width:${tam}px;height:${tam}px" aria-hidden="true"><img src="/assets/monograma.svg" alt="" width="${Math.round(tam * 0.62)}" height="${Math.round(tam * 0.62)}"></span>`;

// Faixa de microtexto da cédula
export const microtexto = (nome) => {
  const un = `CARTEIRA CENTRAL · ${nome ? nome.toUpperCase() + " · " : ""}`;
  return un.repeat(8);
};
