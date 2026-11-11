import { sb, estado, icone, esc, acoes, gravarLocal, fecharFolha, avisar, erroForm, campo } from "./base.js";
import { carregarTudo, salvarPrefs } from "./dados.js";
import { ICONES_NAV, moedaCC } from "./marca.js";
import { telaInicio, telaComposicao } from "./tela-inicio.js";
import { telaCartoes } from "./tela-cartoes.js";
import { telaPlanejar, telaCompromisso, simularEnvio, gerarCobrancasRateio } from "./tela-planejar.js";
import { atualizarBlocoPush, buscarDados, telaMais, telaContas, telaConta, telaAcertos, telaPessoa, telaAssinaturas, telaLancamentos, telaRevisao, telaRelatorios, telaConexoes, telaConfiguracoes, abrirBusca, ITENS_MAIS } from "./tela-mais.js";

const app = document.getElementById("app");

// ---------- rotas (#/tela/parametro?chave=valor) ----------
const TELAS = {
  inicio: () => telaInicio(), composicao: (p) => telaComposicao(p), cartoes: (p) => telaCartoes(p),
  planejar: (p, q) => telaPlanejar(q), compromisso: (p) => telaCompromisso(p),
  mais: () => telaMais(), contas: () => telaContas(), conta: (p) => telaConta(p), acertos: (p, q) => telaAcertos(q), pessoa: (p, q) => telaPessoa(p, q),
  assinaturas: () => telaAssinaturas(), lancamentos: (p, q) => telaLancamentos(q), revisao: () => telaRevisao(), relatorios: (p, q) => telaRelatorios(q),
  conexoes: () => telaConexoes(), configuracoes: () => telaConfiguracoes(),
};
// A qual destino principal cada tela pertence (para marcar a navegação)
const GRUPO = { inicio: "inicio", composicao: "inicio", cartoes: "cartoes", lancamentos: "lancamentos", planejar: "mais", compromisso: "mais" };
function lerRota() {
  const h = location.hash.replace(/^#\/?/, "");
  const [caminho, qs] = h.split("?");
  const [tela, parametro] = (caminho || "inicio").split("/");
  return { tela: TELAS[tela] ? tela : "inicio", parametro: parametro || null, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export function ir(rota) {
  const alvo = "#/" + rota.replace(/^#?\/?/, "");
  if (location.hash === alvo) desenhar(); else location.hash = alvo;
}

// ---------- tema ----------
export function aplicarTema(tema) {
  const t = tema === "sistema" ? (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro") : tema;
  if (t === "claro") app.dataset.tema = "claro"; else delete app.dataset.tema;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t === "claro" ? "#F3EFE3" : "#080D0B");
  gravarLocal("cc-tema", tema);
}
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if ((estado.d?.prefs?.tema) === "sistema") aplicarTema("sistema"); });

// ---------- casca ----------
const NAV = [["inicio", "Início", "house"], ["cartoes", "Cartões", "credit-card"], ["lancamentos", "Lançamentos", "list"], ["mais", "Mais", "ellipsis"]];
function cabecalho() {
  return `<header class="cc-header">
    <a class="cc-brand" href="#/inicio" style="text-decoration:none;color:inherit" aria-label="Carteira Central, início"><img src="/assets/monograma.svg" alt="" width="43" height="43"><div class="cc-wordmark" aria-hidden="true"><span>CARTEIRA</span><span>CENTRAL</span></div></a>
    <div class="cc-header-acoes">
      <button type="button" class="cc-icon-button" data-acao="buscar" aria-label="Buscar">${icone("search")}</button>
      <button type="button" class="cc-icon-button" data-acao="privacidade" aria-pressed="${estado.ocultar}" aria-label="${estado.ocultar ? "Mostrar valores" : "Ocultar valores"}">${icone(estado.ocultar ? "eye-off" : "eye")}</button>
    </div></header>`;
}
function navegacao(grupo) {
  return `<nav class="cc-nav" aria-label="Navegação principal">${NAV.map(([r, t, ic]) => `<button type="button" data-acao="ir" data-rota="${r}" ${grupo === r ? 'aria-current="page"' : ""}>${ICONES_NAV[r] || icone(ic, 22)}<span>${t}</span></button>`).join("")}</nav>`;
}
function lateral(tela) {
  const link = (r, t, ic) => `<a href="#/${r}" ${tela === r || (GRUPO[tela] === r && r !== "mais") ? 'aria-current="page"' : ""}>${icone(ic, 19)}${t}</a>`;
  return `<aside class="cc-lateral" aria-label="Menu">
    <img class="cc-marca" src="/assets/marca-horizontal.svg" alt="Carteira Central">
    ${NAV.slice(0, 3).map(([r, t, ic]) => link(r, t, ic)).join("")}
    <p>Mais</p>${ITENS_MAIS.map(([r, t, ic]) => link(r, t, ic)).join("")}
  </aside>`;
}

let desenhando = false;
export function desenhar() {
  if (!estado.sessao) return entrada();
  if (!estado.d) return;
  const rota = lerRota();
  estado.rota = rota;
  const grupo = GRUPO[rota.tela] || "mais";
  let corpo;
  try { corpo = TELAS[rota.tela](rota.parametro, rota.query); }
  catch (e) { console.error(e); corpo = `<p class="cc-eyebrow">Erro</p><h1>Não foi possível abrir esta tela</h1><p class="cc-small">Volte ao Início e tente de novo.</p>`; }
  desenhando = true;
  app.innerHTML = `${lateral(rota.tela)}<div class="cc-coluna">${cabecalho()}<main class="cc-main" id="conteudo">${corpo}</main></div>${navegacao(grupo)}`;
  desenhando = false;
  if (estado.ocultar) gravarOcultos(app);
  if (rota.tela === "configuracoes") atualizarBlocoPush();
  fecharAbertura();
  document.title = `${document.querySelector(".cc-main h1")?.textContent || "Início"} · Carteira Central`;
}

// Valores ocultos viram faixas de gravura (o texto "R$ ••••" vira um elemento visual)
function gravarOcultos(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.includes("R$ ••••") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nos = []; while (w.nextNode()) nos.push(w.currentNode);
  for (const n of nos) {
    const frag = document.createDocumentFragment();
    n.nodeValue.split(/(R\$ ••••)/).forEach((parte) => {
      if (parte === "R$ ••••") { const s = document.createElement("span"); s.className = "cc-oculto"; s.setAttribute("role", "img"); s.setAttribute("aria-label", "valor oculto"); frag.appendChild(s); }
      else if (parte) frag.appendChild(document.createTextNode(parte));
    });
    n.parentNode.replaceChild(frag, n);
  }
}
// Tela de abertura: some quando a primeira tela fica pronta
function fecharAbertura() {
  const a = document.getElementById("abertura");
  if (!a || a.dataset.saindo) return;
  a.dataset.saindo = "1";
  const esperar = Math.max(0, 1650 - performance.now()); // deixa a cunhagem terminar
  setTimeout(() => { a.classList.add("sai"); setTimeout(() => a.remove(), 450); }, esperar);
}

// Puxar para atualizar: a moeda CC gira enquanto busca os dados
(() => {
  let y0 = null, dy = 0, ativo = false, ocupado = false;
  const ind = document.createElement("div");
  ind.className = "cc-puxar"; ind.innerHTML = moedaCC(40); ind.setAttribute("aria-hidden", "true");
  document.body.appendChild(ind);
  const LIMIAR = 72;
  addEventListener("touchstart", (e) => { if (ocupado || scrollY > 0 || document.querySelector(".cc-folha-fundo, .cc-folha") || !estado.d) return; y0 = e.touches[0].clientY; dy = 0; ativo = false; }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0 || scrollY > 0) { ind.style.cssText = ""; ativo = false; return; }
    ativo = true;
    const d = Math.min(110, dy * 0.55);
    ind.style.transform = `translate(-50%, ${d}px) rotateY(${dy * 2.2}deg)`; ind.style.opacity = String(Math.min(1, d / LIMIAR));
    ind.classList.toggle("pronto", d >= LIMIAR);
  }, { passive: true });
  addEventListener("touchend", async () => {
    if (y0 === null) return; y0 = null;
    if (!ativo || Math.min(110, dy * 0.55) < LIMIAR) { ind.style.cssText = ""; ind.classList.remove("pronto"); return; }
    ocupado = true; ind.classList.add("girando"); ind.style.transform = "translate(-50%, 72px)"; ind.style.opacity = "1";
    try { await recarregar(); buscarDados(); } finally { setTimeout(() => { ind.classList.remove("girando", "pronto"); ind.style.cssText = ""; ocupado = false; }, 500); }
  });
})();

export async function recarregar() {
  const y = scrollY;
  if (await carregarTudo()) { if (await gerarCobrancasRateio().catch(() => 0)) await carregarTudo(); desenhar(); scrollTo(0, y); }
}

// ---------- entrada (login privado) ----------
function entrada(modo = "entrar") {
  fecharAbertura();
  const novo = modo === "criar";
  app.innerHTML = `<main class="cc-entrada">
    <img class="cc-marca" src="/assets/marca-horizontal.svg" alt="Carteira Central">
    <p class="cc-small">${novo ? "Primeiro acesso: crie o único usuário deste aplicativo." : "Acesso privado."}</p>
    <form id="form-entrada" novalidate>
      ${campo("E-mail", `<input name="email" type="email" autocomplete="username" autocapitalize="none" required>`)}
      ${campo(`Senha${novo ? " (mínimo de 10 caracteres)" : ""}`, `<input name="senha" type="password" autocomplete="${novo ? "new-password" : "current-password"}" required>`)}
      ${novo ? campo("Como quer ser chamado", `<input name="nome" autocomplete="given-name" maxlength="30">`) : ""}
      <div class="cc-acoes"><button class="cc-primary" type="submit">${novo ? "Criar meu acesso" : "Entrar"}</button>
      <button class="cc-secundario" type="button" data-acao="trocar-entrada" data-modo="${novo ? "entrar" : "criar"}">${novo ? "Já tenho acesso" : "Primeiro acesso"}</button></div>
    </form></main>`;
  const form = document.getElementById("form-entrada");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.senha.value;
    if (!email || !password) return erroForm(form, "Preencha e-mail e senha.");
    if (novo && password.length < 10) return erroForm(form, "Use uma senha com pelo menos 10 caracteres.");
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    let cad = null;
    if (novo) cad = await sb.auth.signUp({ email, password, options: { data: { nome: form.nome.value.trim() || null } } });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) erroForm(form, novo ? (/fechado|Database error/i.test(cad?.error?.message || "") ? "O cadastro está fechado: este aplicativo já tem dono." : "Não foi possível criar o acesso.") : "E-mail ou senha incorretos.");
  });
}

// ---------- eventos globais ----------
const internas = {
  "ir": (el) => { fecharFolha(); ir(el.dataset.rota); scrollTo(0, 0); },
  "fechar-folha": () => fecharFolha(),
  "privacidade": () => { estado.ocultar = !estado.ocultar; gravarLocal("cc-ocultar", estado.ocultar ? "1" : "0"); desenhar(); avisar(estado.ocultar ? "Valores ocultos" : "Valores visíveis"); },
  "buscar": () => abrirBusca(),
  "trocar-entrada": (el) => entrada(el.dataset.modo),
  "segmento": async (el) => {
    const nome = el.dataset.nome, v = el.dataset.valor;
    if (nome === "aba-planejar") return ir(`planejar?aba=${v}`);
    if (nome === "tema") { aplicarTema(v); if (await salvarPrefs({ tema: v })) { avisar("Tema salvo."); desenhar(); } return; }
  },
};
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-acao]");
  if (!el || el.disabled) return;
  const f = internas[el.dataset.acao] || acoes[el.dataset.acao];
  if (!f) return;
  e.preventDefault();
  try { await f(el, e); } catch (err) { console.error(err); avisar("Algo deu errado. Tente de novo."); }
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "form-simular") { e.preventDefault(); simularEnvio(e.target); }
});
// Filtros da tela de lançamentos
document.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset?.filtro) return;
  const q = { ...estado.rota.query, [t.dataset.filtro]: t.value };
  Object.keys(q).forEach((k) => !q[k] && delete q[k]);
  ir("lancamentos?" + new URLSearchParams(q).toString());
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolha(); });
addEventListener("hashchange", () => { fecharFolha(); desenhar(); });

// ---------- início ----------
aplicarTema((() => { try { return localStorage.getItem("cc-tema") || "escuro"; } catch { return "escuro"; } })());
sb.auth.onAuthStateChange((_ev, sessao) => {
  const antes = estado.sessao?.user?.id, agora = sessao?.user?.id;
  estado.sessao = sessao;
  if (antes === agora && agora) return;
  if (!sessao) { estado.d = null; fecharFolha(); return entrada(); }
  app.innerHTML = `<p class="carregando">Carregando seus dados…</p>`;
  setTimeout(async () => { if (await carregarTudo()) { if (await gerarCobrancasRateio().catch(() => 0)) await carregarTudo(); aplicarTema(estado.d.prefs.tema || "escuro"); desenhar(); } }, 0);
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
