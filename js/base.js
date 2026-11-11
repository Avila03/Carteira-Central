import { ilustracaoPara } from "./marca.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { icone } from "./icones.js";
import { hojeISO } from "./calculos.js";

export const sb = createClient("https://snqfytgrbszoaaqmotir.supabase.co", "sb_publishable_Q6H4Sp1JU0K4hultdr75Rw_0Su_eXgE");
export { icone };

// ---------- estado ----------
export const estado = {
  sessao: null,
  rota: { tela: "inicio", parametro: null, query: {} },
  ocultar: lerLocal("cc-ocultar") === "1",
  d: null, // dados carregados
};
function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* armazenamento indisponível */ } }

// ---------- formatação ----------
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const dinheiro = (c, { sinal = false } = {}) => {
  if (estado.ocultar) return "R$ ••••";
  const v = Number(c || 0);
  const t = brl.format(Math.abs(v) / 100);
  return v < 0 ? "−" + t : (sinal && v > 0 ? "+" + t : t);
};
export const pct = (x, casas = 0) => (x === null || x === undefined || !isFinite(x) ? "—" : (x * 100).toFixed(casas).replace(".", ",") + "%");
export const dataBR = (iso) => { if (!iso) return "—"; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
export const dataCurta = (iso) => { if (!iso) return "—"; const [, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}`; };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesCurto = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
export const mesLongo = (am) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+am.slice(0, 4), +am.slice(5, 7) - 1, 15)));
export const diaExtenso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, d))); };
export const dataHoraBR = (ts) => ts ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) : "—";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const hoje = () => hojeISO();

// "1.234,56" | "1234,5" | "300" -> centavos inteiros
export function paraCentavos(txt) {
  let s = String(txt ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  const neg = s.startsWith("-") || s.startsWith("−"); s = s.replace(/[-−]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const c = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  return neg ? -c : c;
}
export const centavosCampo = (c) => (c === null || c === undefined ? "" : (Math.abs(c) / 100).toFixed(2).replace(".", ","));

// ---------- bancos e logotipos ----------
export const BANCOS = {
  inter: { nome: "Inter", cor: "#E86A00", cor2: "#5A2A00", dominio: "bancointer.com.br" },
  itau: { nome: "Itaú", cor: "#EC7000", cor2: "#123A7A", dominio: "itau.com.br" },
  mercadopago: { nome: "Mercado Pago", cor: "#0A8FD8", cor2: "#04345A", dominio: "mercadopago.com.br" },
  neon: { nome: "Neon", cor: "#009FB3", cor2: "#063B49", dominio: "neon.com.br" },
  nubank: { nome: "Nubank", cor: "#820AD1", cor2: "#2E0450", dominio: "nubank.com.br" },
  bb: { nome: "Banco do Brasil", cor: "#2A4FA8", cor2: "#0B1E4A", dominio: "bb.com.br" },
  outro: { nome: "Outro", cor: "#214E34", cor2: "#0B1A12", dominio: "" },
};
// Domínios de serviços conhecidos, para carregar o logotipo oficial do site
const SERVICOS = [
  [/NETFLIX/, "netflix.com"], [/SPOTIFY/, "spotify.com"], [/\bHBO|\bMAX\b|HBOMAX/, "max.com"], [/DISNEY/, "disneyplus.com"],
  [/PRIME ?VIDEO|AMAZON ?PRIME|AMZN ?PRIME/, "primevideo.com"], [/AMAZON|AMZN/, "amazon.com.br"], [/YOUTUBE/, "youtube.com"], [/GOOGLE/, "google.com"],
  [/APPLE|ITUNES|ICLOUD/, "apple.com"], [/GLOBOPLAY/, "globoplay.globo.com"], [/DEEZER/, "deezer.com"], [/CRUNCHYROLL/, "crunchyroll.com"],
  [/PARAMOUNT/, "paramountplus.com"], [/ROBLOX|RBLX/, "roblox.com"], [/STEAM/, "steampowered.com"], [/PLAYSTATION|PSN|SONY/, "playstation.com"],
  [/XBOX|MICROSOFT/, "microsoft.com"], [/OPENAI|CHATGPT/, "openai.com"], [/ANTHROPIC|CLAUDE/, "anthropic.com"], [/IFOOD/, "ifood.com.br"],
  [/UBER/, "uber.com"], [/99 ?APP|99POP|\b99\b/, "99app.com"], [/MERCADO ?LIVRE|MERCADOLIVRE/, "mercadolivre.com.br"], [/SHOPEE/, "shopee.com.br"],
  [/ADOBE/, "adobe.com"], [/CANVA/, "canva.com"], [/DROPBOX/, "dropbox.com"], [/DUOLINGO/, "duolingo.com"], [/TINDER/, "tinder.com"],
  [/SMART ?FIT/, "smartfit.com.br"], [/WELLHUB|GYMPASS/, "wellhub.com"], [/VIVO/, "vivo.com.br"], [/CLARO/, "claro.com.br"], [/TIM\b/, "tim.com.br"],
];
export function dominioServico(nome) {
  const n = String(nome || "").toUpperCase();
  for (const [re, d] of SERVICOS) if (re.test(n)) return d;
  return null;
}
const iniciais = (t) => String(t || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
// Logotipo oficial via ícone do site; se não carregar, ficam as iniciais por baixo
export function logo(dominio, texto, { redondo = false, tam = 36 } = {}) {
  // Falha de carregamento é tratada por um ouvinte global (a política de segurança bloqueia onerror em linha)
  const img = dominio ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=128" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `<span class="cc-logo${redondo ? " redondo" : ""}" style="width:${tam}px;height:${tam}px" aria-hidden="true">${esc(iniciais(texto))}${img}</span>`;
}
export const logoBanco = (banco, opts) => logo(BANCOS[banco]?.dominio, BANCOS[banco]?.nome || "Banco", opts);
export function logoCompromisso(c) {
  const dom = c.dominio || dominioServico(c.nome);
  if (dom) return logo(dom, c.nome);
  const ic = { salario: "briefcase", receita: "sparkles", fixo: "receipt", assinatura: "repeat2", futura: "calendar-days" }[c.tipo] || "receipt";
  return `<span class="cc-ic">${icone(ic, 18)}</span>`;
}

document.addEventListener("error", (e) => { if (e.target?.tagName === "IMG" && e.target.closest(".cc-logo")) e.target.remove(); }, true);
// O serviço devolve um ícone genérico de 16 px quando o site não tem logotipo: nesse caso ficam as iniciais
document.addEventListener("load", (e) => { const i = e.target; if (i?.tagName === "IMG" && i.closest(".cc-logo") && i.naturalWidth && i.naturalWidth <= 16) i.remove(); }, true);

// ---------- folha inferior, aviso e confirmação ----------
let fundo, folha;
export function abrirFolha(titulo, corpo, aoAbrir) {
  fecharFolha();
  fundo = document.createElement("div"); fundo.className = "cc-fundo"; fundo.addEventListener("click", fecharFolha);
  folha = document.createElement("div"); folha.className = "cc-folha"; folha.setAttribute("role", "dialog"); folha.setAttribute("aria-modal", "true"); folha.setAttribute("aria-label", titulo);
  folha.innerHTML = `<div class="cc-folha-topo"><h2>${esc(titulo)}</h2><button type="button" class="cc-icon-button" data-acao="fechar-folha" aria-label="Fechar">${icone("x")}</button></div>${corpo}`;
  const raiz = document.getElementById("app");
  raiz.appendChild(fundo); raiz.appendChild(folha);
  document.body.style.overflow = "hidden";
  aoAbrir?.(folha);
  document.dispatchEvent(new CustomEvent("folha-aberta", { detail: folha }));
  folha.querySelector("input, select, textarea, button:not([data-acao=fechar-folha])")?.focus({ preventScroll: true });
  return folha;
}
export function fecharFolha() {
  fundo?.remove(); folha?.remove(); fundo = folha = null;
  document.body.style.overflow = "";
}
let toastTimer;
export function avisar(msg) {
  let t = document.querySelector(".cc-toast");
  if (!t) { t = document.createElement("div"); t.className = "cc-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
export function falhou(error, msg = "Não foi possível concluir. Tente de novo.") {
  if (!error) return false;
  console.error(error); avisar(msg); return true;
}
// Botão que pede um segundo toque para confirmar ações destrutivas
export function confirmarDuplo(botao, texto) {
  if (botao.dataset.confirmar === "1") return true;
  botao.dataset.confirmar = "1"; botao.dataset.textoOriginal = botao.textContent; botao.textContent = texto;
  setTimeout(() => { if (botao.isConnected) { botao.dataset.confirmar = ""; botao.textContent = botao.dataset.textoOriginal; } }, 4000);
  return false;
}

// ---------- ações por delegação ----------
export const acoes = {};
export const registrar = (mapa) => Object.assign(acoes, mapa);

// ---------- campos de formulário ----------
export const campo = (rotulo, html, ajuda = "") => `<label class="cc-campo"><span>${esc(rotulo)}</span>${html}${ajuda ? `<small class="cc-ajuda">${ajuda}</small>` : ""}</label>`;
export const entradaValor = (nome, valor, extra = "") => `<input name="${nome}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${valor === undefined || valor === null ? "" : centavosCampo(valor)}" ${extra}>`;
export const opcoes = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(sel ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("");
export function erroForm(form, msg) {
  let e = form.querySelector(".cc-erro[data-geral]");
  if (!e) { e = document.createElement("p"); e.className = "cc-erro"; e.dataset.geral = "1"; e.setAttribute("role", "alert"); form.querySelector(".cc-acoes")?.before(e) ?? form.appendChild(e); }
  e.textContent = msg;
  return false;
}

// ---------- pedaços de interface ----------
export const titulo = (eyebrow, h1, voltar) => `${voltar ? `<button type="button" class="cc-voltar" data-acao="ir" data-rota="${voltar}">${icone("chevron-left", 18)}Voltar</button>` : ""}<p class="cc-eyebrow">${esc(eyebrow)}</p><h1 class="cc-titulo">${esc(h1)}</h1>`;
export const secao = (h2, extra = "") => `<div class="cc-heading"><h2>${esc(h2)}</h2>${extra}</div>`;
export const vazio = (t) => `<div class="cc-vazio">${ilustracaoPara(t)}<p>${t}</p></div>`;
export const selo = (t, tipo = "") => `<span class="cc-selo ${tipo}">${esc(t)}</span>`;
export function linha({ esquerda = "", titulo: t, sub = "", valor = "", valorSub = "", acao = "", attrs = "", classeValor = "" }) {
  const tag = acao ? "button" : "div";
  return `<${tag} ${acao ? `type="button" data-acao="${acao}"` : ""} class="cc-row" ${attrs}>${esquerda}<div class="cc-row-main"><strong>${t}</strong>${sub ? `<span>${sub}</span>` : ""}</div>${valor !== "" ? `<div class="cc-row-fim"><strong class="cc-num ${classeValor}">${valor}</strong>${valorSub ? `<span>${valorSub}</span>` : ""}</div>` : ""}${acao ? icone("chevron-right", 16, 'style="color:var(--cc-muted)"') : ""}</${tag}>`;
}
export const lista = (itens, seVazio = "Nada por aqui ainda.") => `<div class="cc-list">${itens.length ? itens.join("") : vazio(seVazio)}</div>`;
export const segmento = (nome, itens, atual) => `<div class="cc-segmento" role="group">${itens.map(([v, t]) => `<button type="button" data-acao="segmento" data-nome="${nome}" data-valor="${v}" aria-pressed="${v === atual}">${esc(t)}</button>`).join("")}</div>`;

export const conta = (id) => estado.d?.contas.find((c) => c.id === id);
export const categoria = (id) => estado.d?.categorias.find((c) => c.id === id);
export const pessoa = (id) => estado.d?.pessoas.find((p) => p.id === id);
