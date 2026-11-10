import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const sb = createClient(
  "https://snqfytgrbszoaaqmotir.supabase.co",
  "sb_publishable_Q6H4Sp1JU0K4hultdr75Rw_0Su_eXgE"
);

// ---------- utilidades (dinheiro em centavos, datas no fuso de São Paulo) ----------
const FUSO = "America/Sao_Paulo";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (c) => brl.format((c || 0) / 100);
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const dataBR = (iso) => { const [a, m, d] = iso.split("-"); return `${d}/${m}/${a}`; };
const diaExtenso = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(a, m - 1, d)));
};
const fimDoMes = (am) => { const [a, m] = am.split("-").map(Number); return `${am}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "1.234,56" | "1234,5" | "1234.56" | "300" -> centavos inteiros (sem ponto flutuante)
export function paraCentavos(txt) {
  let s = String(txt ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  const neg = s.startsWith("-"); s = s.replace(/-/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  const c = Number(int) * 100 + Number((dec + "00").slice(0, 2));
  return neg ? -c : c;
}
const centavosParaCampo = (c) => (Math.abs(c) / 100).toFixed(2).replace(".", ",");

const BANCOS = {
  nubank: ["Nubank", "#820ad1", "Nu"], inter: ["Inter", "#ff7a00", "In"], bb: ["Banco do Brasil", "#0038a8", "BB"],
  itau: ["Itaú", "#ec7000", "It"], mercadopago: ["Mercado Pago", "#00a1ea", "MP"], neon: ["Neon", "#00b3c7", "Ne"],
  outro: ["Outro", "#6b736d", "•"],
};
const TIPOS_CONTA = { corrente: "Conta corrente", poupanca: "Poupança", carteira: "Carteira (dinheiro)", investimento: "Investimento" };
const ORIGENS = { manual: "Manual", pluggy: "Banco conectado", importacao: "Importado" };

const app = document.getElementById("app");
const folha = document.getElementById("folha");
const folhaFundo = document.getElementById("folha-fundo");
const avisoEl = document.getElementById("aviso");

const estado = {
  sessao: null, aba: "inicio", contas: [], categorias: [], lancamentos: [], recentes: [],
  filtro: { mes: hojeISO().slice(0, 7), conta: "", categoria: "" },
};

let avisoTimer;
function avisar(msg) {
  avisoEl.textContent = msg; avisoEl.hidden = false;
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => (avisoEl.hidden = true), 2600);
}
function abrirFolha(html) { folha.innerHTML = html; folha.hidden = false; folhaFundo.hidden = false; folha.scrollTop = 0; }
function fecharFolha() { folha.hidden = true; folhaFundo.hidden = true; folha.innerHTML = ""; }
folhaFundo.addEventListener("click", fecharFolha);
const falhou = (error) => { if (error) { console.error(error); avisar("Não foi possível concluir. Tente de novo."); return true; } return false; };

// ---------- dados ----------
async function carregarBase() {
  const [c, k, r] = await Promise.all([
    sb.from("contas_saldo").select("*").eq("arquivada", false).order("criado_em"),
    sb.from("categorias").select("*").order("nome"),
    sb.from("lancamentos").select("*").order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(5),
  ]);
  if (falhou(c.error || k.error || r.error)) return;
  estado.contas = c.data; estado.categorias = k.data; estado.recentes = r.data;
}
async function carregarLancamentos() {
  const f = estado.filtro;
  let q = sb.from("lancamentos").select("*").gte("data", `${f.mes}-01`).lte("data", fimDoMes(f.mes))
    .order("data", { ascending: false }).order("criado_em", { ascending: false });
  if (f.conta) q = q.eq("conta_id", f.conta);
  if (f.categoria) q = q.eq("categoria_id", f.categoria);
  const { data, error } = await q;
  if (falhou(error)) return;
  estado.lancamentos = data;
}
const conta = (id) => estado.contas.find((c) => c.id === id);
const categoria = (id) => estado.categorias.find((c) => c.id === id);

// ---------- telas ----------
const ICONES = {
  inicio: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  lancamentos: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  contas: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  mais: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
};
const NOMES_ABA = { inicio: "Início", lancamentos: "Lançamentos", contas: "Contas", mais: "Mais" };

function abas() {
  return `<nav class="abas" aria-label="Navegação principal">${Object.keys(NOMES_ABA).map((a) =>
    `<button class="aba" data-aba="${a}" ${estado.aba === a ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[a]}</svg>${NOMES_ABA[a]}</button>`).join("")}</nav>`;
}
function bola(banco) { const b = BANCOS[banco] || BANCOS.outro; return `<span class="bola" style="background:${b[1]}" aria-hidden="true">${b[2]}</span>`; }

function linhaLancamento(l) {
  const c = conta(l.conta_id), k = categoria(l.categoria_id);
  return `<button class="item" data-lanc="${l.id}">
    ${bola(c?.banco)}
    <span class="meio"><p class="nome">${esc(l.descricao)}</p>
    <p class="sub">${esc(k?.nome || "Sem categoria")} · ${esc(c?.nome || "Conta arquivada")}<span class="selo">${ORIGENS[l.origem]}</span></p></span>
    <span class="quanto ${l.valor_centavos > 0 ? "entra" : "sai"}">${dinheiro(l.valor_centavos)}</span></button>`;
}

function telaInicio() {
  const noCalculo = estado.contas.filter((c) => c.incluir_no_calculo);
  const saldo = noCalculo.reduce((s, c) => s + Number(c.saldo_centavos), 0);
  const fora = estado.contas.length - noCalculo.length;
  return `<div class="topo"><h1>Início</h1><button class="botao-pequeno" data-acao="novo-lanc" aria-label="Novo lançamento">+ Lançar</button></div>
  <section class="cartao"><p class="rotulo">Saldo atual</p><p class="valor-grande">${dinheiro(saldo)}</p>
    <p class="nota">${noCalculo.length ? `Soma de ${noCalculo.length} conta(s) incluída(s) no cálculo${fora ? `; ${fora} fora do cálculo` : ""}. Fonte: registros manuais.` : "Cadastre uma conta para começar."}</p></section>
  <div class="grade">
    <section class="cartao"><p class="rotulo">Comprometido</p><p class="valor">Em construção</p></section>
    <section class="cartao"><p class="rotulo">A receber</p><p class="valor">Em construção</p></section>
  </div>
  <section class="cartao"><p class="rotulo">Disponível até o próximo salário</p><p class="valor-grande" style="font-size:20px;color:var(--suave)">Em construção</p>
    <p class="nota">Depende de salário, faturas e compromissos, que entram nas próximas etapas.</p></section>
  <h2 class="titulo-secao">Contas</h2>
  <div class="lista">${estado.contas.length ? estado.contas.map((c) => `<button class="item" data-conta="${c.id}">${bola(c.banco)}
      <span class="meio"><p class="nome">${esc(c.nome)}</p><p class="sub">${TIPOS_CONTA[c.tipo]}${c.incluir_no_calculo ? "" : " · fora do cálculo"}</p></span>
      <span class="quanto">${dinheiro(c.saldo_centavos)}</span></button>`).join("") : '<p class="vazio">Nenhuma conta cadastrada.</p>'}</div>
  <h2 class="titulo-secao">Últimos lançamentos</h2>
  <div class="lista">${estado.recentes.length ? estado.recentes.map(linhaLancamento).join("") : '<p class="vazio">Nenhum lançamento ainda.</p>'}</div>`;
}

function telaLancamentos() {
  const f = estado.filtro, ls = estado.lancamentos;
  const entradas = ls.filter((l) => l.valor_centavos > 0).reduce((s, l) => s + l.valor_centavos, 0);
  const saidas = ls.filter((l) => l.valor_centavos < 0).reduce((s, l) => s + l.valor_centavos, 0);
  const dias = [...new Set(ls.map((l) => l.data))];
  return `<div class="topo"><h1>Lançamentos</h1><button class="botao-pequeno" data-acao="novo-lanc">+ Lançar</button></div>
  <div class="filtros">
    <input type="month" id="f-mes" value="${f.mes}" aria-label="Mês">
    <select id="f-conta" aria-label="Conta"><option value="">Todas as contas</option>${estado.contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <select id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${estado.categorias.map((c) => `<option value="${c.id}" ${f.categoria === c.id ? "selected" : ""}>${esc(c.nome)} (${c.tipo})</option>`).join("")}</select>
  </div>
  <p class="resumo-filtro"><span>Entradas <b class="entra">${dinheiro(entradas)}</b></span><span>Saídas <b class="sai">${dinheiro(saidas)}</b></span></p>
  ${ls.length ? dias.map((d) => { const doDia = ls.filter((l) => l.data === d);
    return `<p class="dia"><span>${diaExtenso(d)}</span><span>${dinheiro(doDia.reduce((s, l) => s + l.valor_centavos, 0))}</span></p><div class="lista">${doDia.map(linhaLancamento).join("")}</div>`; }).join("")
    : '<div class="lista" style="margin-top:12px"><p class="vazio">Nenhum lançamento neste filtro.</p></div>'}`;
}

function telaContas() {
  return `<div class="topo"><h1>Contas</h1><button class="botao-pequeno" data-acao="nova-conta">+ Conta</button></div>
  <div class="lista">${estado.contas.length ? estado.contas.map((c) => `<button class="item" data-conta="${c.id}">${bola(c.banco)}
    <span class="meio"><p class="nome">${esc(c.nome)}<span class="selo">${ORIGENS[c.origem]}</span></p>
    <p class="sub">${BANCOS[c.banco][0]} · ${TIPOS_CONTA[c.tipo]}${c.incluir_no_calculo ? "" : " · fora do cálculo"}</p></span>
    <span class="quanto">${dinheiro(c.saldo_centavos)}</span></button>`).join("") : '<p class="vazio">Cadastre sua primeira conta para lançar movimentações.</p>'}</div>
  <p class="nota" style="margin:0 4px">O saldo de uma conta manual é o saldo inicial somado aos lançamentos efetivados.</p>`;
}

function telaMais() {
  return `<div class="topo"><h1>Mais</h1></div>
  <h2 class="titulo-secao">Conexões bancárias</h2>
  <section class="cartao"><p style="margin:0;font-weight:600">Meu Pluggy: ainda não conectado</p>
    <p class="nota">A integração será ligada depois da validação da primeira conexão (Inter). Até lá, todos os dados são manuais.</p></section>
  <h2 class="titulo-secao">Acesso</h2>
  <section class="cartao"><p class="rotulo">Conectado como</p><p style="margin:0 0 12px;word-break:break-all">${esc(estado.sessao.user.email)}</p>
    <button class="botao secundario" data-acao="sair">Sair</button></section>`;
}

function desenhar() {
  if (!estado.sessao) return desenharEntrada();
  const t = { inicio: telaInicio, lancamentos: telaLancamentos, contas: telaContas, mais: telaMais }[estado.aba]();
  app.innerHTML = `<main class="tela">${t}</main>${abas()}`;
}

// ---------- formulários ----------
function formLancamento(l) {
  if (!estado.contas.length) { avisar("Cadastre uma conta primeiro."); estado.aba = "contas"; desenhar(); return formConta(); }
  const tipo = l ? (l.valor_centavos > 0 ? "receita" : "despesa") : "despesa";
  const opcoesCat = (t, sel) => `<option value="">Sem categoria</option>` + estado.categorias.filter((c) => c.tipo === t).map((c) => `<option value="${c.id}" ${sel === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("");
  abrirFolha(`<div class="folha-topo"><h2>${l ? "Editar lançamento" : "Novo lançamento"}</h2><button class="link" data-acao="fechar">Fechar</button></div>
  <form id="form-lanc" novalidate>
    <div class="segmento" role="group" aria-label="Tipo"><button type="button" data-tipo="despesa" aria-pressed="${tipo === "despesa"}">Despesa</button><button type="button" data-tipo="receita" aria-pressed="${tipo === "receita"}">Receita</button></div>
    <label class="campo"><span>Valor (R$)</span><input name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${l ? centavosParaCampo(l.valor_centavos) : ""}" required></label>
    <label class="campo"><span>Descrição</span><input name="descricao" autocomplete="off" maxlength="140" value="${esc(l?.descricao)}" required></label>
    <label class="campo"><span>Data</span><input name="data" type="date" value="${l?.data || hojeISO()}" required></label>
    <label class="campo"><span>Conta</span><select name="conta">${estado.contas.map((c) => `<option value="${c.id}" ${l?.conta_id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
    <label class="campo"><span>Categoria</span><select name="categoria">${opcoesCat(tipo, l?.categoria_id)}</select></label>
    <label class="campo"><span>Observações</span><textarea name="observacoes" maxlength="500">${esc(l?.observacoes)}</textarea></label>
    ${l ? `<p class="nota" style="margin:0 4px 14px">Origem: ${ORIGENS[l.origem]}</p>` : ""}
    <p class="erro" id="erro-form" hidden></p>
    <div class="acoes"><button class="botao" type="submit">Salvar</button>${l ? '<button class="botao perigo" type="button" data-acao="excluir-lanc">Excluir lançamento</button>' : ""}</div>
  </form>`);
  const form = document.getElementById("form-lanc");
  let tipoAtual = tipo, confirmar = false;
  form.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => {
    tipoAtual = b.dataset.tipo;
    form.querySelectorAll("[data-tipo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    form.categoria.innerHTML = opcoesCat(tipoAtual, null);
  }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const c = paraCentavos(form.valor.value);
    const desc = form.descricao.value.trim();
    if (!c || c < 0) { erro.textContent = "Informe um valor maior que zero, como 25,90."; erro.hidden = false; return; }
    if (!desc) { erro.textContent = "Informe uma descrição."; erro.hidden = false; return; }
    if (!form.data.value) { erro.textContent = "Informe a data."; erro.hidden = false; return; }
    const reg = { conta_id: form.conta.value, data: form.data.value, descricao: desc, valor_centavos: tipoAtual === "despesa" ? -c : c,
      categoria_id: form.categoria.value || null, observacoes: form.observacoes.value.trim() || null };
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    const { error } = l ? await sb.from("lancamentos").update(reg).eq("id", l.id) : await sb.from("lancamentos").insert(reg);
    btn.disabled = false;
    if (falhou(error)) return;
    fecharFolha(); avisar("Lançamento salvo."); await atualizar();
  });
  form.querySelector('[data-acao="excluir-lanc"]')?.addEventListener("click", async (e) => {
    if (!confirmar) { confirmar = true; e.target.textContent = "Toque de novo para confirmar a exclusão"; return; }
    const { error } = await sb.from("lancamentos").delete().eq("id", l.id);
    if (falhou(error)) return;
    fecharFolha(); avisar("Lançamento excluído."); await atualizar();
  });
}

function formConta(c) {
  abrirFolha(`<div class="folha-topo"><h2>${c ? "Editar conta" : "Nova conta"}</h2><button class="link" data-acao="fechar">Fechar</button></div>
  <form id="form-conta" novalidate>
    <label class="campo"><span>Nome</span><input name="nome" autocomplete="off" maxlength="60" placeholder="Ex.: Inter conta corrente" value="${esc(c?.nome)}" required></label>
    <label class="campo"><span>Banco</span><select name="banco">${Object.entries(BANCOS).map(([k, v]) => `<option value="${k}" ${c?.banco === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
    <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS_CONTA).map(([k, v]) => `<option value="${k}" ${c?.tipo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <label class="campo"><span>Saldo inicial (R$), antes dos lançamentos</span><input name="saldo" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${c ? (c.saldo_inicial_centavos < 0 ? "-" : "") + centavosParaCampo(c.saldo_inicial_centavos) : ""}"></label>
    <label class="interruptor"><span>Incluir no saldo e no disponível</span><input type="checkbox" name="incluir" ${!c || c.incluir_no_calculo ? "checked" : ""}></label>
    <p class="erro" id="erro-form" hidden></p>
    <div class="acoes"><button class="botao" type="submit">Salvar</button>${c ? '<button class="botao perigo" type="button" data-acao="arquivar-conta">Arquivar conta</button>' : ""}</div>
  </form>`);
  const form = document.getElementById("form-conta");
  let confirmar = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const nome = form.nome.value.trim();
    const saldo = form.saldo.value.trim() ? paraCentavos(form.saldo.value) : 0;
    if (!nome) { erro.textContent = "Informe o nome da conta."; erro.hidden = false; return; }
    if (saldo === null) { erro.textContent = "Saldo inválido. Use o formato 1.234,56."; erro.hidden = false; return; }
    const reg = { nome, banco: form.banco.value, tipo: form.tipo.value, saldo_inicial_centavos: saldo, incluir_no_calculo: form.incluir.checked };
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    const { error } = c ? await sb.from("contas").update(reg).eq("id", c.id) : await sb.from("contas").insert(reg);
    btn.disabled = false;
    if (falhou(error)) return;
    fecharFolha(); avisar("Conta salva."); await atualizar();
  });
  form.querySelector('[data-acao="arquivar-conta"]')?.addEventListener("click", async (e) => {
    if (!confirmar) { confirmar = true; e.target.textContent = "Toque de novo para arquivar (o histórico é mantido)"; return; }
    const { error } = await sb.from("contas").update({ arquivada: true }).eq("id", c.id);
    if (falhou(error)) return;
    fecharFolha(); avisar("Conta arquivada."); await atualizar();
  });
}

// ---------- entrada ----------
function desenharEntrada(modo = "entrar", msg = "") {
  const novo = modo === "criar";
  app.innerHTML = `<main class="entrada"><h1>Carteira Central</h1><p class="sub">${novo ? "Primeiro acesso: crie o único usuário deste aplicativo." : "Acesso privado."}</p>
  <form id="form-entrada" novalidate>
    <label class="campo"><span>E-mail</span><input name="email" type="email" autocomplete="username" autocapitalize="none" required></label>
    <label class="campo"><span>Senha${novo ? " (mínimo de 10 caracteres)" : ""}</span><input name="senha" type="password" autocomplete="${novo ? "new-password" : "current-password"}" required></label>
    <p class="erro" id="erro-form" ${msg ? "" : "hidden"}>${esc(msg)}</p>
    <div class="acoes"><button class="botao" type="submit">${novo ? "Criar meu acesso" : "Entrar"}</button>
    <button class="botao secundario" type="button" id="troca-modo">${novo ? "Já tenho acesso" : "Primeiro acesso"}</button></div>
  </form></main>`;
  document.getElementById("troca-modo").addEventListener("click", () => desenharEntrada(novo ? "entrar" : "criar"));
  const form = document.getElementById("form-entrada");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const mostrar = (m) => { erro.textContent = m; erro.hidden = false; };
    const email = form.email.value.trim(), password = form.senha.value;
    if (!email || !password) return mostrar("Preencha e-mail e senha.");
    if (novo && password.length < 10) return mostrar("Use uma senha com pelo menos 10 caracteres.");
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    let cadastro = null;
    if (novo) cadastro = await sb.auth.signUp({ email, password });
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    if (error) mostrar(novo ? (/fechado|Database error/i.test(cadastro?.error?.message || "") ? "O cadastro está fechado: este aplicativo já tem dono." : "Não foi possível criar o acesso. Confira os dados e tente de novo.") : "E-mail ou senha incorretos.");
  });
}

// ---------- eventos ----------
async function atualizar() {
  await carregarBase();
  if (estado.aba === "lancamentos") await carregarLancamentos();
  desenhar();
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-aba],[data-acao],[data-lanc],[data-conta]");
  if (!el) return;
  if (el.dataset.aba) { estado.aba = el.dataset.aba; window.scrollTo(0, 0); await atualizar(); return; }
  if (el.dataset.lanc) { const l = [...estado.lancamentos, ...estado.recentes].find((x) => x.id === el.dataset.lanc); if (l) formLancamento(l); return; }
  if (el.dataset.conta) { const c = conta(el.dataset.conta); if (c) formConta(c); return; }
  const a = el.dataset.acao;
  if (a === "fechar") fecharFolha();
  else if (a === "novo-lanc") formLancamento();
  else if (a === "nova-conta") formConta();
  else if (a === "sair") await sb.auth.signOut();
});

document.addEventListener("change", async (e) => {
  const id = e.target.id;
  if (id === "f-mes" && e.target.value) estado.filtro.mes = e.target.value;
  else if (id === "f-conta") estado.filtro.conta = e.target.value;
  else if (id === "f-cat") estado.filtro.categoria = e.target.value;
  else return;
  await carregarLancamentos(); desenhar();
});

sb.auth.onAuthStateChange((_evento, sessao) => {
  const antes = estado.sessao?.user?.id, agora = sessao?.user?.id;
  estado.sessao = sessao;
  if (antes === agora && agora) return;
  if (!sessao) { fecharFolha(); desenhar(); return; }
  setTimeout(atualizar, 0);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
