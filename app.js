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
const dataBR = (iso) => { if (!iso) return "—"; const [a, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const dataHoraBR = (ts) => ts ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) : "—";
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
const TIPOS_CONTA = { corrente: "Conta corrente", poupanca: "Poupança", carteira: "Carteira (dinheiro)", investimento: "Investimento", cartao: "Cartão de crédito" };
const TIPOS_MANUAIS = ["corrente", "poupanca", "carteira", "investimento"];
const ORIGENS = { manual: "Manual", pluggy: "Banco conectado", importacao: "Importado" };
const STATUS_CONEXAO = {
  UPDATED: ["Atualizada", "entra"], UPDATING: ["Coletando no banco", ""], LOGIN_ERROR: ["Precisa reconectar", "sai"],
  OUTDATED: ["Desatualizada", "sai"], WAITING_USER_INPUT: ["Aguardando você", "sai"], CONSENTIMENTO_EXPIRADO: ["Autorização vencida", "sai"],
};

const app = document.getElementById("app");
const folha = document.getElementById("folha");
const folhaFundo = document.getElementById("folha-fundo");
const avisoEl = document.getElementById("aviso");

const estado = {
  sessao: null, aba: "inicio", contas: [], categorias: [], lancamentos: [], recentes: [], conexoes: [], ultimaSinc: null,
  filtro: { mes: hojeISO().slice(0, 7), conta: "", categoria: "" },
};

let avisoTimer;
function avisar(msg) {
  avisoEl.textContent = msg; avisoEl.hidden = false;
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => (avisoEl.hidden = true), 3200);
}
function abrirFolha(html) { folha.innerHTML = html; folha.hidden = false; folhaFundo.hidden = false; folha.scrollTop = 0; }
function fecharFolha() { folha.hidden = true; folhaFundo.hidden = true; folha.innerHTML = ""; }
folhaFundo.addEventListener("click", fecharFolha);
const falhou = (error) => { if (error) { console.error(error); avisar("Não foi possível concluir. Tente de novo."); return true; } return false; };

// ---------- dados ----------
async function carregarBase() {
  const [c, k, r, x, s] = await Promise.all([
    sb.from("contas_saldo").select("*").eq("arquivada", false).order("tipo").order("criado_em"),
    sb.from("categorias").select("*").order("nome"),
    sb.from("lancamentos").select("*").neq("situacao", "futuro").order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(6),
    sb.from("conexoes").select("*").order("criado_em"),
    sb.from("sincronizacoes").select("*").order("id", { ascending: false }).limit(1),
  ]);
  if (falhou(c.error || k.error || r.error || x.error || s.error)) return;
  estado.contas = c.data; estado.categorias = k.data; estado.recentes = r.data; estado.conexoes = x.data; estado.ultimaSinc = s.data[0] || null;
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
const contasDinheiro = () => estado.contas.filter((c) => c.tipo !== "cartao");
const cartoes = () => estado.contas.filter((c) => c.tipo === "cartao");

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

function selosLancamento(l) {
  const s = [`<span class="selo">${ORIGENS[l.origem]}</span>`];
  if (l.natureza === "pagamento_fatura") s.push('<span class="selo">Pagamento de fatura</span>');
  if (l.situacao === "pendente") s.push('<span class="selo">Pendente</span>');
  if (l.situacao === "futuro") s.push('<span class="selo">Futuro</span>');
  if (l.total_parcelas > 1) s.push(`<span class="selo">${l.parcela}/${l.total_parcelas}</span>`);
  return s.join("");
}
function linhaLancamento(l) {
  const c = conta(l.conta_id), k = categoria(l.categoria_id);
  const rotuloCat = l.natureza === "pagamento_fatura" ? "Fatura do cartão" : (k?.nome || "Sem categoria");
  return `<button class="item" data-lanc="${l.id}">
    ${bola(c?.banco)}
    <span class="meio"><p class="nome">${esc(l.descricao)}</p>
    <p class="sub">${esc(rotuloCat)} · ${esc(c?.nome || "Conta arquivada")}${selosLancamento(l)}</p></span>
    <span class="quanto ${l.valor_centavos > 0 ? "entra" : "sai"}">${dinheiro(l.valor_centavos)}</span></button>`;
}
function linhaConta(c) {
  const sub = c.tipo === "cartao"
    ? `Limite ${dinheiro(c.limite_centavos)} · disponível ${dinheiro(c.limite_disponivel_centavos)}${c.vencimento_dia ? ` · vence dia ${c.vencimento_dia}` : ""}`
    : `${TIPOS_CONTA[c.tipo]}${c.incluir_no_calculo ? "" : " · fora do cálculo"}`;
  return `<button class="item" data-conta="${c.id}">${bola(c.banco)}
    <span class="meio"><p class="nome">${esc(c.nome)}<span class="selo">${ORIGENS[c.origem]}</span></p><p class="sub">${sub}</p></span>
    <span class="quanto ${c.saldo_centavos < 0 ? "sai" : ""}">${dinheiro(c.saldo_centavos)}</span></button>`;
}
function dataDosDados(lista) {
  const ds = lista.filter((c) => c.origem === "pluggy" && c.dados_em).map((c) => c.dados_em).sort();
  return ds.length ? ds[0] : null;
}

function telaInicio() {
  const noCalculo = contasDinheiro().filter((c) => c.incluir_no_calculo);
  const saldo = noCalculo.reduce((s, c) => s + Number(c.saldo_centavos), 0);
  const fora = contasDinheiro().length - noCalculo.length;
  const dadosEm = dataDosDados(noCalculo);
  const divida = cartoes().reduce((s, c) => s + Math.max(0, -Number(c.saldo_centavos)), 0);
  const dadosCartao = dataDosDados(cartoes());
  return `<div class="topo"><h1>Início</h1><button class="botao-pequeno" data-acao="novo-lanc" aria-label="Novo lançamento">+ Lançar</button></div>
  <section class="cartao"><p class="rotulo">Saldo atual</p><p class="valor-grande">${dinheiro(saldo)}</p>
    <p class="nota">${noCalculo.length ? `Soma de ${noCalculo.length} conta(s) incluída(s) no cálculo${fora ? `; ${fora} fora do cálculo` : ""}.${dadosEm ? ` Dados dos bancos de ${dataHoraBR(dadosEm)}.` : ""}` : "Cadastre ou conecte uma conta para começar."}</p></section>
  <div class="grade">
    <section class="cartao"><p class="rotulo">Devo nos cartões</p><p class="valor sai" style="color:var(--sai)">${dinheiro(divida)}</p>
      <p class="nota">${cartoes().length} cartão(ões)${dadosCartao ? ` · ${dataBR(dadosCartao)}` : ""}</p></section>
    <section class="cartao"><p class="rotulo">A receber</p><p class="valor">Em construção</p></section>
  </div>
  <section class="cartao"><p class="rotulo">Disponível até o próximo salário</p><p class="valor-grande" style="font-size:20px;color:var(--suave)">Em construção</p>
    <p class="nota">Depende de salário, faturas e compromissos, que entram nas próximas etapas.</p></section>
  ${proximasFaturasHTML()}
  <h2 class="titulo-secao">Contas</h2>
  <div class="lista">${contasDinheiro().length ? contasDinheiro().map(linhaConta).join("") : '<p class="vazio">Nenhuma conta.</p>'}</div>
  <h2 class="titulo-secao">Últimos lançamentos</h2>
  <div class="lista">${estado.recentes.length ? estado.recentes.map(linhaLancamento).join("") : '<p class="vazio">Nenhum lançamento ainda.</p>'}</div>`;
}

let faturasProximas = [];
function proximasFaturasHTML() {
  if (!faturasProximas.length) return "";
  return `<h2 class="titulo-secao">Próximos vencimentos de fatura</h2><div class="lista">${faturasProximas.map((f) => {
    const c = conta(f.conta_id);
    return `<button class="item" data-conta="${f.conta_id}">${bola(c?.banco)}<span class="meio"><p class="nome">${esc(c?.nome || "Cartão")}</p>
      <p class="sub">Vence ${dataBR(f.vencimento)}${f.fechamento ? ` · fechou ${dataBR(f.fechamento)}` : ""}</p></span><span class="quanto">${dinheiro(f.total_centavos)}</span></button>`;
  }).join("")}</div>`;
}
async function carregarFaturasProximas() {
  const limite = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await sb.from("faturas").select("*").gte("vencimento", limite).order("vencimento").limit(6);
  if (!error) faturasProximas = data;
}

function telaLancamentos() {
  const f = estado.filtro, ls = estado.lancamentos;
  const consumo = ls.filter((l) => l.natureza === "normal");
  const entradas = consumo.filter((l) => l.valor_centavos > 0).reduce((s, l) => s + l.valor_centavos, 0);
  const saidas = consumo.filter((l) => l.valor_centavos < 0).reduce((s, l) => s + l.valor_centavos, 0);
  const pagFatura = ls.filter((l) => l.natureza === "pagamento_fatura").length;
  const dias = [...new Set(ls.map((l) => l.data))];
  return `<div class="topo"><h1>Lançamentos</h1><button class="botao-pequeno" data-acao="novo-lanc">+ Lançar</button></div>
  <div class="filtros">
    <input type="month" id="f-mes" value="${f.mes}" aria-label="Mês">
    <select id="f-conta" aria-label="Conta ou cartão"><option value="">Todas as contas e cartões</option>${estado.contas.map((c) => `<option value="${c.id}" ${f.conta === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
    <select id="f-cat" aria-label="Categoria"><option value="">Todas as categorias</option>${estado.categorias.map((c) => `<option value="${c.id}" ${f.categoria === c.id ? "selected" : ""}>${esc(c.nome)} (${c.tipo})</option>`).join("")}</select>
  </div>
  <p class="resumo-filtro"><span>Entradas <b class="entra">${dinheiro(entradas)}</b></span><span>Saídas <b class="sai">${dinheiro(saidas)}</b></span></p>
  ${pagFatura ? `<p class="nota" style="margin:6px 4px 0">${pagFatura} pagamento(s) de fatura não entram nesses totais, para não contar a mesma despesa duas vezes.</p>` : ""}
  ${ls.length ? dias.map((d) => { const doDia = ls.filter((l) => l.data === d);
    return `<p class="dia"><span>${diaExtenso(d)}</span></p><div class="lista">${doDia.map(linhaLancamento).join("")}</div>`; }).join("")
    : '<div class="lista" style="margin-top:12px"><p class="vazio">Nenhum lançamento neste filtro.</p></div>'}`;
}

function telaContas() {
  return `<div class="topo"><h1>Contas</h1><button class="botao-pequeno" data-acao="nova-conta">+ Conta</button></div>
  <h2 class="titulo-secao" style="margin-top:4px">Contas</h2>
  <div class="lista">${contasDinheiro().length ? contasDinheiro().map(linhaConta).join("") : '<p class="vazio">Nenhuma conta.</p>'}</div>
  <h2 class="titulo-secao">Cartões</h2>
  <div class="lista">${cartoes().length ? cartoes().map(linhaConta).join("") : '<p class="vazio">Nenhum cartão conectado.</p>'}</div>
  <p class="nota" style="margin:0 4px">Contas conectadas usam o saldo informado pelo banco. Em contas manuais, o saldo é o saldo inicial somado aos lançamentos efetivados. No cartão, o valor é o quanto você deve.</p>`;
}

function telaMais() {
  const s = estado.ultimaSinc;
  return `<div class="topo"><h1>Mais</h1></div>
  <h2 class="titulo-secao">Conexões bancárias (Meu Pluggy)</h2>
  <div class="lista">${estado.conexoes.length ? estado.conexoes.map((x) => {
    const st = STATUS_CONEXAO[x.status] || [x.status || "Sem consulta", ""];
    const falha = x.consulta_ok === false;
    return `<button class="item" data-conexao="${x.id}">${bola(x.banco)}<span class="meio"><p class="nome">${BANCOS[x.banco][0]}${x.ativa ? "" : '<span class="selo">Pausada</span>'}</p>
      <p class="sub"><span class="${falha ? "sai" : st[1]}">${falha ? "Falha na última consulta" : st[0]}</span> · dados de ${dataHoraBR(x.dados_atualizados_em)}</p></span></button>`;
  }).join("") : '<p class="vazio">Nenhuma conexão cadastrada.</p>'}</div>
  <section class="cartao">
    <p class="nota" style="margin-top:0">O Meu Pluggy coleta seus dados nos bancos sozinho, uma vez a cada 24 horas; essa coleta não pode ser pedida pelo app. O app copia os dados já coletados todos os dias às 14h40, e você pode buscar agora o que já foi coletado.</p>
    <p class="nota">Última busca: ${s ? `${dataHoraBR(s.iniciada_em)} (${s.ok === false ? "com falha" : s.ok ? "concluída" : "em andamento"})` : "nenhuma"}</p>
    <div class="acoes" style="margin-top:12px"><button class="botao" data-acao="buscar-dados">Buscar dados já coletados</button>
    <button class="botao secundario" data-acao="nova-conexao">Adicionar conexão</button></div>
  </section>
  <h2 class="titulo-secao">Acesso</h2>
  <section class="cartao"><p class="rotulo">Conectado como</p><p style="margin:0 0 12px;word-break:break-all">${esc(estado.sessao.user.email)}</p>
    <button class="botao secundario" data-acao="sair">Sair</button></section>`;
}

function desenhar() {
  if (!estado.sessao) return desenharEntrada();
  const t = { inicio: telaInicio, lancamentos: telaLancamentos, contas: telaContas, mais: telaMais }[estado.aba]();
  app.innerHTML = `<main class="tela">${t}</main>${abas()}`;
}

// ---------- detalhes ----------
async function detalheCartao(c) {
  const { data: fats } = await sb.from("faturas").select("*").eq("conta_id", c.id).order("vencimento", { ascending: false }).limit(12);
  const { data: futuras } = await sb.from("lancamentos").select("*").eq("conta_id", c.id).eq("situacao", "futuro").order("data");
  const usado = (c.limite_centavos ?? 0) - (c.limite_disponivel_centavos ?? 0);
  abrirFolha(`<div class="folha-topo"><h2>${esc(c.nome)}</h2><button class="link" data-acao="fechar">Fechar</button></div>
    <section class="cartao"><p class="rotulo">Você deve</p><p class="valor-grande">${dinheiro(Math.max(0, -c.saldo_centavos))}</p>
      <p class="nota">${esc(c.bandeira || "")} ${esc(c.nivel || "")}${c.final_numero ? ` · final ${esc(c.final_numero)}` : ""} · ${BANCOS[c.banco][0]}</p>
      <p class="nota">Limite ${dinheiro(c.limite_centavos)} · usado ${dinheiro(usado)} · disponível ${dinheiro(c.limite_disponivel_centavos)}</p>
      <p class="nota">Fechamento dia ${c.fechamento_dia ?? "—"} (deduzido das faturas) · vencimento dia ${c.vencimento_dia ?? "—"}</p>
      <p class="nota">Dados do banco de ${dataHoraBR(c.dados_em)}</p></section>
    ${futuras?.length ? `<h2 class="titulo-secao">Parcelas já lançadas para os próximos meses</h2><div class="lista">${futuras.map(linhaLancamento).join("")}</div>` : ""}
    <h2 class="titulo-secao">Faturas</h2>
    <div class="lista">${fats?.length ? fats.map((f) => `<button class="item" data-fatura="${f.id}"><span class="meio"><p class="nome">Vence ${dataBR(f.vencimento)}</p>
      <p class="sub">${f.fechamento ? `Fechou ${dataBR(f.fechamento)}` : "Fechamento não informado"}${f.minimo_centavos ? ` · mínimo ${dinheiro(f.minimo_centavos)}` : ""}</p></span>
      <span class="quanto">${dinheiro(f.total_centavos)}</span></button>`).join("") : '<p class="vazio">Nenhuma fatura recebida.</p>'}</div>
    <div class="acoes"><button class="botao secundario" data-acao="editar-conta" data-id="${c.id}">Editar nome e cálculo</button></div>`);
}

async function detalheFatura(id) {
  const [{ data: f }, { data: ls }] = await Promise.all([
    sb.from("faturas").select("*").eq("id", id).single(),
    sb.from("lancamentos").select("*").eq("fatura_id", id).order("data"),
  ]);
  if (!f) return;
  estado.lancamentos = [...estado.lancamentos.filter((x) => !ls.some((y) => y.id === x.id)), ...ls];
  const compras = ls.filter((l) => l.natureza === "normal");
  const soma = -compras.reduce((s, l) => s + l.valor_centavos, 0);
  const c = conta(f.conta_id);
  abrirFolha(`<div class="folha-topo"><h2>Fatura ${dataBR(f.vencimento)}</h2><button class="link" data-acao="voltar-cartao" data-id="${f.conta_id}">Voltar</button></div>
    <section class="cartao"><p class="rotulo">Total da fatura (informado pelo banco)</p><p class="valor-grande">${dinheiro(f.total_centavos)}</p>
      <p class="nota">${esc(c?.nome || "")} · ${f.fechamento ? `fechou ${dataBR(f.fechamento)}` : "fechamento não informado"}</p>
      <p class="nota">Compras, estornos e encargos ligados a esta fatura: ${dinheiro(soma)}${soma !== f.total_centavos ? ". A diferença costuma ser saldo ou pagamento da fatura anterior que o banco lança aqui." : ""}</p></section>
    <div class="lista">${ls.length ? ls.map(linhaLancamento).join("") : '<p class="vazio">Nenhum lançamento ligado.</p>'}</div>`);
}

function detalheConexao(x) {
  const st = STATUS_CONEXAO[x.status] || [x.status || "Sem consulta", ""];
  const d = x.consulta_detalhe || {};
  const vence = x.consentimento_expira_em ? Math.round((new Date(x.consentimento_expira_em) - Date.now()) / 864e5) : null;
  abrirFolha(`<div class="folha-topo"><h2>${BANCOS[x.banco][0]}</h2><button class="link" data-acao="fechar">Fechar</button></div>
    <section class="cartao">
      <p class="rotulo">Situação</p><p style="margin:0 0 10px;font-weight:600" class="${st[1]}">${st[0]}</p>
      <p class="nota">Dados coletados pelo banco em: <b>${dataHoraBR(x.dados_atualizados_em)}</b></p>
      <p class="nota">Próxima coleta automática do Meu Pluggy: ${dataHoraBR(x.proxima_coleta_em)}</p>
      <p class="nota">Autorização válida até ${dataBR(x.consentimento_expira_em)}${vence !== null && vence <= 30 ? ` <b class="sai">(faltam ${vence} dias: renove no Dashboard da Pluggy)</b>` : ""}</p>
      <p class="nota">Última busca pelo app: ${dataHoraBR(x.consultado_em)} — ${x.consulta_ok === false ? `<span class="sai">falhou: ${esc(d.erro || "erro desconhecido")}. Os dados anteriores foram mantidos.</span>` : `${d.contas ?? 0} conta(s), ${d.lancamentos ?? 0} lançamento(s), ${d.faturas ?? 0} fatura(s), ${d.investimentos ?? 0} investimento(s)`}</p>
      ${x.erro ? `<p class="erro" style="margin-top:8px">Banco: ${esc(x.erro)}</p>` : ""}
      <p class="nota" style="word-break:break-all">Identificador: ${esc(x.pluggy_item_id)}</p>
    </section>
    <div class="acoes"><button class="botao secundario" data-acao="pausar-conexao" data-id="${x.id}">${x.ativa ? "Pausar esta conexão" : "Reativar esta conexão"}</button></div>`);
}

// ---------- formulários ----------
function formLancamento(l) {
  if (!estado.contas.length) { avisar("Cadastre uma conta primeiro."); estado.aba = "contas"; desenhar(); return formConta(); }
  const doBanco = l?.origem === "pluggy";
  const tipo = l ? (l.valor_centavos > 0 ? "receita" : "despesa") : "despesa";
  const opcoesCat = (t, sel) => `<option value="">Sem categoria</option>` + estado.categorias.filter((c) => c.tipo === t).map((c) => `<option value="${c.id}" ${sel === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("");
  const contasManuais = estado.contas.filter((c) => c.origem !== "pluggy" || l?.conta_id === c.id);
  abrirFolha(`<div class="folha-topo"><h2>${l ? "Editar lançamento" : "Novo lançamento"}</h2><button class="link" data-acao="fechar">Fechar</button></div>
  <form id="form-lanc" novalidate>
    ${doBanco ? `<section class="cartao"><p class="rotulo">Do banco (não editável)</p><p class="valor-grande ${l.valor_centavos > 0 ? "entra" : "sai"}" style="font-size:26px">${dinheiro(l.valor_centavos)}</p>
      <p class="nota">${dataBR(l.data)} · ${esc(conta(l.conta_id)?.nome)}${l.total_parcelas > 1 ? ` · parcela ${l.parcela} de ${l.total_parcelas}` : ""}${l.data_compra && l.data_compra !== l.data ? ` · compra em ${dataBR(l.data_compra)}` : ""}</p>
      <p class="nota">Descrição no banco: ${esc(l.descricao_original)}${l.categoria_banco ? ` · categoria do banco: ${esc(l.categoria_banco)}` : ""}</p>
      <p class="nota">Situação: ${{ efetivado: "efetivado", pendente: "pendente no banco", futuro: "parcela futura" }[l.situacao]}</p></section>`
    : `<div class="segmento" role="group" aria-label="Tipo"><button type="button" data-tipo="despesa" aria-pressed="${tipo === "despesa"}">Despesa</button><button type="button" data-tipo="receita" aria-pressed="${tipo === "receita"}">Receita</button></div>
    <label class="campo"><span>Valor (R$)</span><input name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${l ? centavosParaCampo(l.valor_centavos) : ""}" required></label>`}
    <label class="campo"><span>Descrição</span><input name="descricao" autocomplete="off" maxlength="140" value="${esc(l?.descricao)}" required></label>
    ${doBanco ? "" : `<label class="campo"><span>Data</span><input name="data" type="date" value="${l?.data || hojeISO()}" required></label>
    <label class="campo"><span>Conta</span><select name="conta">${contasManuais.map((c) => `<option value="${c.id}" ${l?.conta_id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>`}
    <label class="campo"><span>Categoria</span><select name="categoria">${opcoesCat(tipo, l?.categoria_id)}</select></label>
    ${doBanco ? `<label class="interruptor"><span>É pagamento de fatura (não conta como consumo)</span><input type="checkbox" name="pagfatura" ${l.natureza === "pagamento_fatura" ? "checked" : ""}></label>` : ""}
    <label class="campo"><span>Observações</span><textarea name="observacoes" maxlength="500">${esc(l?.observacoes)}</textarea></label>
    ${doBanco ? `<p class="nota" style="margin:0 4px 14px">Suas alterações de descrição, categoria e observações são mantidas nas próximas sincronizações.</p>` : (l ? `<p class="nota" style="margin:0 4px 14px">Origem: ${ORIGENS[l.origem]}</p>` : "")}
    <p class="erro" id="erro-form" hidden></p>
    <div class="acoes"><button class="botao" type="submit">Salvar</button>${l && !doBanco ? '<button class="botao perigo" type="button" data-acao="excluir-lanc">Excluir lançamento</button>' : ""}</div>
  </form>`);
  const form = document.getElementById("form-lanc");
  if (!contasManuais.length && !doBanco) { fecharFolha(); avisar("Lançamentos manuais precisam de uma conta manual. Crie uma em Contas."); return; }
  let tipoAtual = tipo, confirmar = false;
  form.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => {
    tipoAtual = b.dataset.tipo;
    form.querySelectorAll("[data-tipo]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    form.categoria.innerHTML = opcoesCat(tipoAtual, null);
  }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const mostrar = (m) => { erro.textContent = m; erro.hidden = false; };
    const desc = form.descricao.value.trim();
    if (!desc) return mostrar("Informe uma descrição.");
    let reg;
    if (doBanco) {
      reg = { descricao: desc, categoria_id: form.categoria.value || null, observacoes: form.observacoes.value.trim() || null,
        natureza: form.pagfatura.checked ? "pagamento_fatura" : "normal" };
    } else {
      const c = paraCentavos(form.valor.value);
      if (!c || c < 0) return mostrar("Informe um valor maior que zero, como 25,90.");
      if (!form.data.value) return mostrar("Informe a data.");
      reg = { conta_id: form.conta.value, data: form.data.value, descricao: desc, valor_centavos: tipoAtual === "despesa" ? -c : c,
        categoria_id: form.categoria.value || null, observacoes: form.observacoes.value.trim() || null };
    }
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
  const doBanco = c?.origem === "pluggy";
  abrirFolha(`<div class="folha-topo"><h2>${c ? "Editar conta" : "Nova conta manual"}</h2><button class="link" data-acao="fechar">Fechar</button></div>
  <form id="form-conta" novalidate>
    <label class="campo"><span>Nome</span><input name="nome" autocomplete="off" maxlength="60" placeholder="Ex.: Nubank conta" value="${esc(c?.nome)}" required></label>
    ${doBanco ? `<section class="cartao"><p class="rotulo">Do banco</p><p class="nota" style="margin:0">${BANCOS[c.banco][0]} · ${TIPOS_CONTA[c.tipo]}${c.final_numero ? ` · final ${esc(c.final_numero)}` : ""}</p>
      <p class="nota">Saldo informado: ${dinheiro(c.saldo_centavos)} em ${dataHoraBR(c.dados_em)}</p></section>`
    : `<label class="campo"><span>Banco</span><select name="banco">${Object.entries(BANCOS).map(([k, v]) => `<option value="${k}" ${c?.banco === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
    <label class="campo"><span>Tipo</span><select name="tipo">${TIPOS_MANUAIS.map((k) => `<option value="${k}" ${c?.tipo === k ? "selected" : ""}>${TIPOS_CONTA[k]}</option>`).join("")}</select></label>
    <label class="campo"><span>Saldo inicial (R$), antes dos lançamentos</span><input name="saldo" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${c ? (c.saldo_inicial_centavos < 0 ? "-" : "") + centavosParaCampo(c.saldo_inicial_centavos) : ""}"></label>`}
    ${c?.tipo === "cartao" ? "" : `<label class="interruptor"><span>Incluir no saldo e no disponível</span><input type="checkbox" name="incluir" ${!c || c.incluir_no_calculo ? "checked" : ""}></label>`}
    <p class="erro" id="erro-form" hidden></p>
    <div class="acoes"><button class="botao" type="submit">Salvar</button>${c && !doBanco ? '<button class="botao perigo" type="button" data-acao="arquivar-conta">Arquivar conta</button>' : ""}</div>
  </form>`);
  const form = document.getElementById("form-conta");
  let confirmar = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const mostrar = (m) => { erro.textContent = m; erro.hidden = false; };
    const nome = form.nome.value.trim();
    if (!nome) return mostrar("Informe o nome da conta.");
    let reg = { nome };
    if (form.incluir) reg.incluir_no_calculo = form.incluir.checked;
    if (!doBanco) {
      const saldo = form.saldo.value.trim() ? paraCentavos(form.saldo.value) : 0;
      if (saldo === null) return mostrar("Saldo inválido. Use o formato 1.234,56.");
      reg = { ...reg, banco: form.banco.value, tipo: form.tipo.value, saldo_inicial_centavos: saldo };
    }
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

function formConexao() {
  const usadas = estado.conexoes.length;
  abrirFolha(`<div class="folha-topo"><h2>Adicionar conexão</h2><button class="link" data-acao="fechar">Fechar</button></div>
  <section class="cartao"><p class="nota" style="margin:0">No Dashboard da Pluggy: Aplicações → sua aplicação → Demo → Conectar Conta → MeuPluggy. Depois copie o id do banco em Itens Conectados.</p>
    <p class="nota">Conexões em uso: ${usadas} de 5 permitidas no uso pessoal.</p></section>
  <form id="form-conexao" novalidate>
    <label class="campo"><span>Banco</span><select name="banco">${Object.entries(BANCOS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></label>
    <label class="campo"><span>Identificador (itemId)</span><input name="item" autocomplete="off" autocapitalize="none" placeholder="00000000-0000-0000-0000-000000000000"></label>
    <p class="erro" id="erro-form" hidden></p>
    <div class="acoes"><button class="botao" type="submit">Salvar e buscar dados</button></div>
  </form>`);
  const form = document.getElementById("form-conexao");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = document.getElementById("erro-form");
    const item = form.item.value.trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item)) { erro.textContent = "O identificador tem o formato 00000000-0000-0000-0000-000000000000."; erro.hidden = false; return; }
    const { error } = await sb.from("conexoes").insert({ banco: form.banco.value, pluggy_item_id: item });
    if (error) { erro.textContent = /duplicate|unique/i.test(error.message) ? "Essa conexão já está cadastrada." : "Não foi possível salvar."; erro.hidden = false; return; }
    fecharFolha(); await atualizar(); await buscarDados();
  });
}

let buscando = false;
async function buscarDados() {
  if (buscando) return;
  buscando = true;
  const { data, error } = await sb.rpc("buscar_dados_bancos");
  if (falhou(error)) { buscando = false; return; }
  if (data === "recente") { avisar("Uma busca foi feita há menos de 5 minutos. Os dados já estão atualizados."); buscando = false; return; }
  avisar("Buscando os dados já coletados pelo Meu Pluggy…");
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: s } = await sb.from("sincronizacoes").select("*").order("id", { ascending: false }).limit(1);
    if (s?.[0]?.concluida_em) { avisar(s[0].ok ? "Dados atualizados." : "Busca concluída com falhas. Veja cada conexão."); break; }
  }
  buscando = false;
  await atualizar();
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
  await Promise.all([carregarBase(), carregarFaturasProximas()]);
  if (estado.aba === "lancamentos") await carregarLancamentos();
  desenhar();
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-aba],[data-acao],[data-lanc],[data-conta],[data-fatura],[data-conexao]");
  if (!el) return;
  if (el.dataset.aba) { estado.aba = el.dataset.aba; window.scrollTo(0, 0); await atualizar(); return; }
  if (el.dataset.lanc) {
    let l = [...estado.lancamentos, ...estado.recentes].find((x) => x.id === el.dataset.lanc);
    if (!l) { const { data } = await sb.from("lancamentos").select("*").eq("id", el.dataset.lanc).single(); l = data; }
    if (l) formLancamento(l);
    return;
  }
  if (el.dataset.conta) { const c = conta(el.dataset.conta); if (c) (c.tipo === "cartao" ? detalheCartao(c) : formConta(c)); return; }
  if (el.dataset.fatura) { await detalheFatura(el.dataset.fatura); return; }
  if (el.dataset.conexao) { const x = estado.conexoes.find((y) => y.id === el.dataset.conexao); if (x) detalheConexao(x); return; }
  const a = el.dataset.acao;
  if (a === "fechar") fecharFolha();
  else if (a === "novo-lanc") formLancamento();
  else if (a === "nova-conta") formConta();
  else if (a === "editar-conta") { const c = conta(el.dataset.id); if (c) formConta(c); }
  else if (a === "voltar-cartao") { const c = conta(el.dataset.id); if (c) detalheCartao(c); }
  else if (a === "buscar-dados") await buscarDados();
  else if (a === "nova-conexao") formConexao();
  else if (a === "pausar-conexao") {
    const x = estado.conexoes.find((y) => y.id === el.dataset.id);
    const { error } = await sb.from("conexoes").update({ ativa: !x.ativa }).eq("id", x.id);
    if (falhou(error)) return;
    fecharFolha(); avisar(x.ativa ? "Conexão pausada. Os dados já recebidos foram mantidos." : "Conexão reativada."); await atualizar();
  }
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
