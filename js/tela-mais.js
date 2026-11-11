import { carimbo, carimbar, nomeDono, nomeNoCartao } from "./marca.js";
import { sb, estado, icone, dinheiro, dataBR, dataCurta, dataHoraBR, diaExtenso, mesLongo, esc, pct, hoje, titulo, secao, lista, linha, selo, segmento, campo, entradaValor, opcoes, erroForm, paraCentavos, abrirFolha, fecharFolha, avisar, falhou, confirmarDuplo, registrar, conta, categoria, pessoa, BANCOS, logoBanco, logoCompromisso, logo, dominioServico, gravarLocal } from "./base.js";
import { consumoDoMes, caixaDoMes, sugerirAssinaturas, sugerirDuplicidades, sugerirTransferencias, parcelasComSaldo, dividirIgual, dividirPercentual, gerarParcelas, somaMeses, somaDias, agenda, mesDe, normalizarDescricao } from "./calculos.js";
import { inserir, inserirVarios, atualizar, apagar, decidir, salvarPrefs } from "./dados.js";
import { recarregar, ir, aplicarTema } from "./app.js";
import { suaParte, rateiosDe } from "./tela-planejar.js";

const ORIGEM = { manual: "Manual", pluggy: "Banco", importacao: "Importado" };
const SITUACAO = { efetivado: "", pendente: "Pendente no banco", futuro: "Parcela futura" };

// Categorias que você dispensou de revisar (lançamentos anteriores ao início do uso)
const catDispensada = (id) => estado.d.decisoes.some((x) => x.chave === "cat:" + id);
// ---------- Mais ----------
export const ITENS_MAIS = [
  ["planejar", "Planejar", "calendar-days", "Calendário, salário, fixos, metas e simulações"],
  ["contas", "Contas", "landmark", "Contas bancárias e investimentos"],
  ["acertos", "Acertos", "users", "Rachas, quem te deve e o que você deve a pessoas"],
  ["assinaturas", "Assinaturas", "repeat2", "Serviços recorrentes e sugestões"],
  ["revisao", "Revisão", "shield-check", "Duplicidades, transferências e categorias"],
  ["relatorios", "Relatórios", "chart-column", "Resumo do mês, consumo e fluxo de caixa"],
  ["conexoes", "Conexões", "link2", "Meu Pluggy: estado e data dos dados"],
  ["configuracoes", "Configurações", "settings", "Tema, avisos, categorias e acesso"],
];
export function telaMais() {
  const d = estado.d;
  const pend = d.decisoes.filter((x) => x.decisao === "verificar").length + sugerirDuplicidades(d).length + sugerirTransferencias(d).length + d.lancamentos.filter((l) => !l.categoria_id && l.natureza === "normal" && l.situacao !== "futuro" && !catDispensada(l.id)).length;
  return `${titulo("Mais opções", "Mais")}
  ${lista(ITENS_MAIS.map(([r, t, ic, sub]) => linha({ esquerda: `<span class="cc-ic">${icone(ic, 18)}</span>`, titulo: t + (r === "revisao" && pend ? selo(String(pend), "previsto") : ""), sub, acao: "ir", attrs: `data-rota="${r}"` })))}
  <p class="cc-account-line">Carteira Central · uso pessoal e privado</p>`;
}

// ---------- Lançamentos ----------
const marcaRevisao = (id) => estado.d.decisoes.find((x) => x.chave === "rev:" + id)?.decisao;
export function linhaLancamento(l) {
  const c = conta(l.conta_id), k = categoria(l.categoria_id);
  const verificar = marcaRevisao(l.id) === "verificar";
  const rot = l.natureza === "pagamento_fatura" ? "Pagamento de fatura" : l.natureza === "transferencia_propria" ? "Transferência entre minhas contas" : (k?.nome || "Sem categoria");
  const extra = [l.total_parcelas > 1 ? `${l.parcela}/${l.total_parcelas}` : "", SITUACAO[l.situacao] || "", ORIGEM[l.origem]].filter(Boolean);
  return linha({ esquerda: logoBanco(c?.banco), titulo: esc(l.descricao) + (verificar ? selo("Verificar", "vencido") : ""), sub: `${dataCurta(l.data)} · ${esc(rot)} · ${esc(c?.nome || "")}${extra.length ? " · " + extra.join(" · ") : ""}${(l.etiquetas || []).map((e) => " #" + esc(e)).join("")}`, valor: dinheiro(l.valor_centavos, { sinal: true }), classeValor: l.valor_centavos > 0 ? "cc-pos" : "", acao: "editar-lancamento", attrs: `data-id="${l.id}"` });
}
export function telaLancamentos(q) {
  const d = estado.d;
  const mes = /^\d{4}-\d{2}$/.test(q.mes || "") ? q.mes : hoje().slice(0, 7);
  let ls = d.lancamentos.filter((l) => l.data.startsWith(mes));
  if (q.conta) ls = ls.filter((l) => l.conta_id === q.conta);
  if (q.banco) ls = ls.filter((l) => conta(l.conta_id)?.banco === q.banco);
  if (q.categoria) ls = ls.filter((l) => (q.categoria === "sem" ? !l.categoria_id && l.natureza === "normal" : l.categoria_id === q.categoria));
  if (q.situacao) ls = ls.filter((l) => l.situacao === q.situacao);
  if (q.etiqueta) ls = ls.filter((l) => (l.etiquetas || []).includes(q.etiqueta));
  if (q.pessoa) { const ids = new Set(d.rachas.filter((r) => d.cotas.some((c) => c.racha_id === r.id && c.pessoa_id === q.pessoa) || r.pagador_pessoa_id === q.pessoa).map((r) => r.lancamento_id)); ls = ls.filter((l) => ids.has(l.id)); }
  const consumo = ls.filter((l) => l.natureza === "normal" && l.situacao !== "futuro");
  const ent = consumo.filter((l) => l.valor_centavos > 0).reduce((s, l) => s + l.valor_centavos, 0), sai = consumo.filter((l) => l.valor_centavos < 0).reduce((s, l) => s - l.valor_centavos, 0);
  const dias = [...new Set(ls.map((l) => l.data))];
  const etiquetas = [...new Set(d.lancamentos.flatMap((l) => l.etiquetas || []))].sort();
  const sel = (nome, itens, atual, rotulo) => `<select data-filtro="${nome}" aria-label="${rotulo}" style="min-height:44px;border-radius:12px;border:1px solid var(--cc-line);background:var(--cc-surface);color:var(--cc-ivory);padding:0 10px;font-size:14px;max-width:190px"><option value="">${rotulo}</option>${opcoes(itens, atual)}</select>`;
  return `${titulo("Movimentações", "Lançamentos")}
  <div class="cc-chips" style="flex-wrap:nowrap">
    <input type="month" data-filtro="mes" value="${mes}" aria-label="Mês" style="min-height:44px;border-radius:12px;border:1px solid var(--cc-line);background:var(--cc-surface);color:var(--cc-ivory);padding:0 10px;font-size:14px">
    ${sel("banco", Object.entries(BANCOS).filter(([k]) => d.contas.some((c) => c.banco === k)).map(([k, b]) => [k, b.nome]), q.banco, "Todos os bancos")}
    ${sel("conta", d.contas.map((c) => [c.id, c.nome]), q.conta, "Contas e cartões")}
    ${sel("categoria", [["sem", "Sem categoria"], ...d.categorias.map((c) => [c.id, `${c.nome} (${c.tipo})`])], q.categoria, "Categorias")}
    ${sel("situacao", [["efetivado", "Efetivado"], ["pendente", "Pendente"], ["futuro", "Parcela futura"]], q.situacao, "Situação")}
    ${sel("pessoa", d.pessoas.map((p) => [p.id, p.nome]), q.pessoa, "Pessoas")}
    ${etiquetas.length ? sel("etiqueta", etiquetas.map((e) => [e, "#" + e]), q.etiqueta, "Etiquetas") : ""}
  </div>
  <div class="cc-grade2"><div class="cc-stat"><span>Entradas</span><strong class="cc-num cc-pos">${dinheiro(ent)}</strong></div><div class="cc-stat"><span>Saídas (consumo)</span><strong class="cc-num">${dinheiro(sai)}</strong></div></div>
  <p class="cc-small" style="margin-bottom:6px">Pagamentos de fatura e transferências entre suas contas não entram nesses totais.</p>
  ${dias.length ? dias.map((dia) => `<p class="cc-account-line" style="padding-top:14px">${diaExtenso(dia)}</p>${lista(ls.filter((l) => l.data === dia).map(linhaLancamento))}`).join("") : lista([], "Nenhum lançamento com esses filtros.")}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="novo-lancamento">${icone("plus", 18)}Novo lançamento manual</button></div>`;
}

function formLancamento(l) {
  const d = estado.d;
  const doBanco = l?.origem === "pluggy";
  const tipo = l ? (l.valor_centavos > 0 ? "receita" : "despesa") : "despesa";
  const manuais = d.contas.filter((c) => c.origem !== "pluggy" && !c.arquivada);
  const cats = (t) => `<option value="">Sem categoria</option>` + opcoes(d.categorias.filter((k) => k.tipo === t).map((k) => [k.id, k.nome]), l?.categoria_id);
  if (!l && !manuais.length) { avisar("Crie uma conta manual em Mais › Contas para lançar à mão."); return ir("contas"); }
  const f = abrirFolha(l ? "Lançamento" : "Novo lançamento", `<form id="form-lancamento" novalidate>
    ${doBanco ? `<div class="cc-hero"><span class="cc-hero-label">Do banco · não editável</span><strong class="cc-amount">${dinheiro(l.valor_centavos, { sinal: true })}</strong>
      <span class="cc-small">${dataBR(l.data)} · ${esc(conta(l.conta_id)?.nome)}${l.total_parcelas > 1 ? ` · parcela ${l.parcela} de ${l.total_parcelas}` : ""}${l.data_compra && l.data_compra !== l.data ? ` · compra em ${dataBR(l.data_compra)}` : ""}<br>Descrição no banco: ${esc(l.descricao_original)}${l.categoria_banco ? ` · categoria do banco: ${esc(l.categoria_banco)}` : ""}${l.situacao !== "efetivado" ? ` · ${SITUACAO[l.situacao]}` : ""}</span></div>`
      : `${segmento("tipo-lanc", [["despesa", "Despesa"], ["receita", "Receita"]], tipo)}
      <div class="cc-grade-campos">${campo("Valor (R$)", entradaValor("valor", l?.valor_centavos))}${campo("Data", `<input type="date" name="data" value="${l?.data || hoje()}">`)}</div>
      ${campo("Conta", `<select name="conta">${opcoes(manuais.map((c) => [c.id, c.nome]), l?.conta_id)}</select>`)}`}
    ${campo("Descrição", `<input name="descricao" maxlength="140" value="${esc(l?.descricao || "")}">`)}
    ${campo("Categoria", `<select name="categoria">${cats(tipo)}</select>`)}
    ${campo("Como contar", `<select name="natureza">${opcoes([["normal", "Normal (consumo ou receita)"], ["pagamento_fatura", "Pagamento de fatura (não é gasto)"], ["transferencia_propria", "Transferência entre minhas contas"]], l?.natureza || "normal")}</select>`)}
    ${campo("Etiquetas", `<input name="etiquetas" autocapitalize="none" placeholder="viagem, casa" value="${esc((l?.etiquetas || []).join(", "))}">`, "Separe por vírgula.")}
    ${campo("Observações", `<textarea name="observacoes" maxlength="500">${esc(l?.observacoes || "")}</textarea>`)}
    ${doBanco ? `<p class="cc-small" style="margin-bottom:8px">Sua descrição, categoria, etiquetas e observações são mantidas nas próximas sincronizações.</p>` : ""}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button>${l && !doBanco ? `<button type="button" class="cc-perigo" data-acao="apagar-lancamento" data-id="${l.id}">Excluir lançamento</button>` : ""}</div>
  </form>`);
  const form = f.querySelector("form");
  let tipoAtual = tipo;
  f.querySelectorAll('[data-nome="tipo-lanc"]').forEach((b) => b.addEventListener("click", () => {
    tipoAtual = b.dataset.valor; f.querySelectorAll('[data-nome="tipo-lanc"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b))); form.categoria.innerHTML = cats(tipoAtual);
  }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const desc = form.descricao.value.trim();
    if (!desc) return erroForm(form, "Informe uma descrição.");
    const reg = { descricao: desc, categoria_id: form.categoria.value || null, observacoes: form.observacoes.value.trim() || null, natureza: form.natureza.value,
      etiquetas: form.etiquetas.value.split(",").map((s) => s.trim().replace(/^#/, "").toLowerCase()).filter(Boolean) };
    if (!doBanco) {
      const v = paraCentavos(form.valor.value);
      if (!v || v <= 0) return erroForm(form, "Informe um valor maior que zero, como 25,90.");
      if (!form.data.value) return erroForm(form, "Informe a data.");
      Object.assign(reg, { valor_centavos: tipoAtual === "despesa" ? -v : v, data: form.data.value, conta_id: form.conta.value });
    }
    const ok = l ? await atualizar("lancamentos", l.id, reg) : await inserir("lancamentos", reg);
    if (!ok) return;
    fecharFolha(); avisar("Lançamento salvo."); await recarregar();
  });
}

// ---------- Contas ----------
export function telaContas() {
  const d = estado.d;
  const dinheiro_ = d.contas.filter((c) => c.tipo !== "cartao" && !c.arquivada);
  const total = dinheiro_.filter((c) => c.incluir_no_calculo).reduce((s, c) => s + Number(c.saldo_centavos), 0);
  const invest = d.investimentos.filter((i) => i.saldo_centavos !== 0);
  const zerados = d.investimentos.length - invest.length;
  return `${titulo("Dinheiro", "Contas", "mais")}
  <div class="cc-hero"><span class="cc-hero-label">Nas contas consideradas</span><strong class="cc-amount">${dinheiro(total)}</strong><span class="cc-small">${dinheiro_.filter((c) => c.incluir_no_calculo).length} de ${dinheiro_.length} contas no cálculo</span></div>
  ${secao("Contas bancárias")}
  ${lista(dinheiro_.map((c) => linha({ esquerda: logoBanco(c.banco), titulo: esc(c.nome) + (c.incluir_no_calculo ? "" : selo("Fora do cálculo")), sub: c.origem === "pluggy" ? `${esc(c.nome_banco || "")} · dados de ${dataHoraBR(c.dados_em)}` : "Registro manual", valor: dinheiro(c.saldo_centavos), acao: "ir", attrs: `data-rota="conta/${c.id}"` })), "Nenhuma conta.")}
  ${secao("Investimentos", `<span>${dinheiro(d.investimentos.reduce((s, i) => s + Number(i.saldo_centavos), 0))}</span>`)}
  ${lista(invest.map((i) => linha({ esquerda: logoBanco(d.conexoes.find((x) => x.id === i.conexao_id)?.banco), titulo: esc(i.nome), sub: `${esc(i.tipo || "")}${i.vencimento ? ` · vence ${dataBR(i.vencimento)}` : ""} · fora do disponível`, valor: dinheiro(i.saldo_centavos) })), "Nenhum investimento com saldo.")}
  ${zerados ? `<p class="cc-small" style="margin-top:8px">${zerados} investimento(s) com saldo zero ocultos.</p>` : ""}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="nova-conta">${icone("plus", 18)}Nova conta manual</button></div>`;
}
export function telaConta(id) {
  const d = estado.d;
  const c = conta(id);
  if (!c) return titulo("Conta", "Não encontrada", "contas");
  const ls = d.lancamentos.filter((l) => l.conta_id === id).slice(0, 60);
  return `${titulo(c.tipo === "cartao" ? "Cartão" : "Conta", c.nome, "contas")}
  <div class="cc-card"><div class="cc-card-top"><span>${esc(BANCOS[c.banco]?.nome || "")}${c.final_numero ? ` · final ${esc(c.final_numero)}` : ""}</span>${logoBanco(c.banco)}</div>
  <strong class="cc-num">${dinheiro(c.saldo_centavos)}</strong><span class="cc-small">${c.origem === "pluggy" ? `Saldo informado pelo banco em ${dataHoraBR(c.dados_em)}` : "Saldo inicial + lançamentos efetivados"}</span>
  <div class="cc-card-foot"><span>${c.incluir_no_calculo ? "No saldo e no disponível" : "Fora do cálculo"}</span><span>${c.origem === "pluggy" ? "Banco conectado" : "Manual"}</span></div></div>
  <div class="cc-acoes"><button type="button" class="cc-secundario" data-acao="editar-conta" data-id="${c.id}">${icone("pencil", 18)}Editar nome e cálculo</button></div>
  ${secao("Lançamentos recentes", `<a href="#/lancamentos?conta=${c.id}" class="cc-small" style="color:var(--cc-currency)">Ver todos</a>`)}
  ${lista(ls.map(linhaLancamento), "Nenhum lançamento.")}`;
}
function formConta(c) {
  const doBanco = c?.origem === "pluggy";
  const f = abrirFolha(c ? "Editar conta" : "Nova conta manual", `<form novalidate>
    ${campo("Nome", `<input name="nome" maxlength="60" value="${esc(c?.nome || "")}" placeholder="Ex.: Nubank conta">`)}
    ${doBanco ? "" : `${campo("Banco", `<select name="banco">${opcoes(Object.entries(BANCOS).map(([k, b]) => [k, b.nome]), c?.banco)}</select>`)}
    ${campo("Tipo", `<select name="tipo">${opcoes([["corrente", "Conta corrente"], ["poupanca", "Poupança"], ["carteira", "Dinheiro em espécie"], ["investimento", "Investimento"]], c?.tipo)}</select>`)}
    ${campo("Saldo inicial (R$)", entradaValor("saldo", c?.saldo_inicial_centavos ?? 0), "Antes dos lançamentos que você registrar. Use - para negativo.")}`}
    ${c?.tipo === "cartao" ? "" : `<label class="cc-interruptor"><span>Incluir no saldo e no disponível</span><input type="checkbox" name="incluir" ${!c || c.incluir_no_calculo ? "checked" : ""}></label>`}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button>${c && !doBanco ? `<button type="button" class="cc-perigo" data-acao="arquivar-conta" data-id="${c.id}">Arquivar conta (mantém o histórico)</button>` : ""}</div>
  </form>`);
  const form = f.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) return erroForm(form, "Informe o nome.");
    const reg = { nome };
    if (form.incluir) reg.incluir_no_calculo = form.incluir.checked;
    if (!doBanco) {
      const s = paraCentavos(form.saldo.value || "0");
      if (s === null) return erroForm(form, "Saldo inválido. Use o formato 1.234,56.");
      Object.assign(reg, { banco: form.banco.value, tipo: form.tipo.value, saldo_inicial_centavos: s });
    }
    const ok = c ? await atualizar("contas", c.id, reg) : await inserir("contas", reg);
    if (!ok) return;
    fecharFolha(); avisar("Conta salva."); await recarregar();
  });
}

// ---------- Acertos (pessoas) ----------
function restante(a) { return a.valor_total_centavos - estado.d.pagamentos.filter((p) => p.acerto_id === a.id).reduce((s, p) => s + p.valor_centavos, 0); }
function saldoPessoa(id) {
  let s = 0;
  for (const a of estado.d.acertos.filter((x) => x.pessoa_id === id && x.situacao === "aberto")) s += (a.direcao === "me_deve" ? 1 : -1) * restante(a);
  return s;
}
// Tudo que ainda falta acertar, parcela a parcela. Acerto sem parcelas vira um item "sem vencimento".
function pendenciasAcertos(filtroPessoa) {
  const d = estado.d, itens = [];
  for (const a of d.acertos.filter((x) => x.situacao === "aberto" && (!filtroPessoa || x.pessoa_id === filtroPessoa))) {
    const ps = parcelasComSaldo(a, d.parcelas, d.pagamentos).filter((p) => p.restante_centavos > 0);
    if (ps.length) ps.forEach((p) => itens.push({ a, numero: p.numero, total: ps.length + (parcelasComSaldo(a, d.parcelas, d.pagamentos).length - ps.length), vencimento: p.vencimento, valor: p.restante_centavos }));
    else { const r = restante(a); if (r > 0) itens.push({ a, vencimento: null, valor: r }); }
  }
  return itens;
}
// Itens que caem num mês; no mês atual entram também os atrasados
function doMes(itens, mes, atual) { return itens.filter((i) => (i.vencimento ? mesDe(i.vencimento) === mes || (mes === atual && mesDe(i.vencimento) < atual) : mes === atual)); }
const somaDir = (itens, dir) => itens.filter((i) => i.a.direcao === dir).reduce((s, i) => s + i.valor, 0);
function blocoMeses(itens, mes, rotaBase) {
  const h = hoje(), atual = mesDe(h);
  const anterior = mesDe(somaMeses(mes + "-15", -1)), seguinte = mesDe(somaMeses(mes + "-15", 1));
  const sel = doMes(itens, mes, atual).sort((x, y) => (x.vencimento || "0").localeCompare(y.vencimento || "0"));
  const prox = Array.from({ length: 6 }, (_, i) => mesDe(somaMeses(atual + "-15", i)));
  const sep = rotaBase.includes("?") ? "&" : "?";
  return `${secao("Por mês")}
  <div class="cc-mes-nav"><button type="button" class="cc-icon-button" data-acao="ir" data-rota="${rotaBase}${sep}mes=${anterior}" aria-label="Mês anterior">${icone("chevron-left")}</button><strong>${mesLongo(mes)}</strong><button type="button" class="cc-icon-button" data-acao="ir" data-rota="${rotaBase}${sep}mes=${seguinte}" aria-label="Próximo mês">${icone("chevron-right")}</button></div>
  <div class="cc-grade2"><div class="cc-stat"><span>Você paga no mês</span><strong class="cc-num">${dinheiro(somaDir(sel, "eu_devo"))}</strong></div><div class="cc-stat cc-areceber"><span>Você recebe no mês</span><strong class="cc-num">${dinheiro(somaDir(sel, "me_deve"))}</strong></div></div>
  ${lista(sel.map((i) => linha({ esquerda: logo(null, pessoa(i.a.pessoa_id)?.nome, { redondo: true }), titulo: esc(i.a.descricao) + (!i.vencimento ? selo("Sem data", "previsto") : i.vencimento < h ? selo("Atrasado", "vencido") : ""), sub: `${esc(pessoa(i.a.pessoa_id)?.nome)} · ${i.a.direcao === "me_deve" ? "te paga" : "você paga"} · ${i.vencimento ? dataBR(i.vencimento) : "sem data, conta neste mês"}${i.total > 1 ? ` · parcela ${i.numero}/${i.total}` : ""}`, valor: dinheiro(i.valor), classeValor: i.a.direcao === "me_deve" ? "cc-pos" : "", acao: "ir", attrs: `data-rota="pessoa/${i.a.pessoa_id}"` })), "Nada vence neste mês.")}
  ${secao("Próximos 6 meses")}
  ${lista(prox.map((m) => { const x = doMes(itens, m, atual); const pg = somaDir(x, "eu_devo"), rc = somaDir(x, "me_deve"); return linha({ titulo: mesLongo(m).replace(/^./, (c) => c.toUpperCase()), sub: `paga ${dinheiro(pg)} · recebe ${dinheiro(rc)}`, valor: dinheiro(rc - pg, { sinal: true }), classeValor: rc - pg > 0 ? "cc-pos" : "", acao: "ir", attrs: `data-rota="${rotaBase}${sep}mes=${m}"` }); }))}
  ${itens.some((i) => !i.vencimento) ? `<p class="cc-small" style="margin-top:8px">Dívidas sem data contam no mês atual até você definir um vencimento (toque na pessoa › Editar ou definir data).</p>` : ""}`;
}
export function telaAcertos(q = {}) {
  const d = estado.d;
  const mes = /^\d{4}-\d{2}$/.test(q.mes || "") ? q.mes : mesDe(hoje());
  const pessoas = d.pessoas.map((p) => ({ p, s: saldoPessoa(p.id) })).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  const meDevem = pessoas.filter((x) => x.s > 0).reduce((s, x) => s + x.s, 0), devo = pessoas.filter((x) => x.s < 0).reduce((s, x) => s - x.s, 0);
  return `${titulo("Pessoas", "Acertos", "mais")}
  <div class="cc-grade2"><div class="cc-stat cc-areceber"><span>Me devem (total)</span><strong class="cc-num">${dinheiro(meDevem)}</strong><small class="cc-small">fora do disponível</small></div>
  <div class="cc-stat"><span>Eu devo (total)</span><strong class="cc-num">${dinheiro(devo)}</strong><small class="cc-small">entra nos compromissos</small></div></div>
  ${blocoMeses(pendenciasAcertos(), mes, "acertos")}
  ${secao("Saldo por pessoa")}
  ${lista(pessoas.map(({ p, s }) => linha({ esquerda: logo(null, p.nome, { redondo: true }), titulo: esc(p.nome), sub: s > 0 ? "te deve" : s < 0 ? "você deve" : "sem pendências", valor: dinheiro(Math.abs(s)), classeValor: s > 0 ? "cc-pos" : "", acao: "ir", attrs: `data-rota="pessoa/${p.id}"` })), "Nenhuma pessoa cadastrada.")}
  ${secao("Rachas recentes")}
  ${lista(d.rachas.slice(0, 8).map((r) => linha({ esquerda: `<span class="cc-ic">${icone("split", 18)}</span>`, titulo: esc(r.ocasiao), sub: `${dataBR(r.data)} · pago por ${r.pagador_pessoa_id ? esc(pessoa(r.pagador_pessoa_id)?.nome) : "você"} · ${d.cotas.filter((c) => c.racha_id === r.id).length} participantes`, valor: dinheiro(r.valor_total_centavos), acao: "ver-racha", attrs: `data-id="${r.id}"` })), "Nenhum racha ainda.")}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="novo-racha">${icone("split", 18)}Novo racha</button>
  <div class="cc-acoes-linha" style="margin-top:0"><button type="button" class="cc-secundario" data-acao="novo-acerto">${icone("hand-coins", 18)}Dívida ou empréstimo</button><button type="button" class="cc-secundario" data-acao="nova-pessoa">${icone("plus", 18)}Pessoa</button></div></div>`;
}
export function telaPessoa(id, q = {}) {
  const d = estado.d, h = hoje();
  const p = pessoa(id);
  if (!p) return titulo("Pessoa", "Não encontrada", "acertos");
  const s = saldoPessoa(id);
  const acertos = d.acertos.filter((a) => a.pessoa_id === id);
  const bloco = (a) => {
    const ps = parcelasComSaldo(a, d.parcelas, d.pagamentos);
    const r = restante(a), pago = a.valor_total_centavos - r;
    const prox = ps.find((x) => x.restante_centavos > 0);
    return `<div class="cc-card" style="padding:16px">
      <div class="cc-card-top"><span>${a.direcao === "me_deve" ? "Me deve" : "Eu devo"}${a.racha_id ? " · racha" : ""}</span>${a.situacao === "quitado" ? carimbo("Quitado") : prox && prox.vencimento < h ? selo(a.direcao === "me_deve" ? "Atrasado" : "Vencido", "vencido") : selo(a.direcao === "me_deve" ? "A receber" : "A pagar", "previsto")}</div>
      <p style="margin-top:10px;font-weight:600">${esc(a.descricao)}</p>
      <strong class="cc-num" style="font-size:24px;margin:6px 0 2px">${dinheiro(r)}</strong><span class="cc-small">restante de ${dinheiro(a.valor_total_centavos)} · pago ${dinheiro(pago)}</span>
      <div class="cc-progresso"><i style="width:${(pago / a.valor_total_centavos) * 100}%"></i></div>
      ${!ps.length && r > 0 ? `<p class="cc-small" style="margin-top:10px">Sem data definida${a.direcao === "eu_devo" ? " · conta como devido agora nos compromissos" : " · fica em A receber, fora do disponível"}</p>` : ""}
      ${ps.length ? `<p class="cc-small" style="margin-top:10px">${ps.length} parcela(s)${prox ? ` · próxima ${dataBR(prox.vencimento)}: ${dinheiro(prox.restante_centavos)}` : ""}${ps.length && r > 0 ? ` · quitação prevista ${dataBR(ps.filter((x) => x.restante_centavos > 0).pop()?.vencimento)}` : ""}</p>` : ""}
      ${a.situacao === "aberto" ? `<div class="cc-acoes-linha"><button type="button" class="cc-primary" style="margin:0" data-acao="pagar-acerto" data-id="${a.id}">${a.direcao === "me_deve" ? "Registrar recebimento" : "Registrar pagamento"}</button><button type="button" class="cc-secundario" data-acao="detalhe-acerto" data-id="${a.id}">Detalhes</button></div><button type="button" class="cc-text-button" data-acao="editar-acerto" data-id="${a.id}">${icone("pencil", 15)}${ps.length ? "Editar dívida" : "Editar ou definir data"}</button>` : `<button type="button" class="cc-text-button" data-acao="detalhe-acerto" data-id="${a.id}">Ver histórico</button>`}
    </div>`;
  };
  return `${titulo("Pessoa", p.nome, "acertos")}
  ${p.contato || p.observacoes ? `<p class="cc-small" style="margin-bottom:10px">${[p.contato, p.observacoes].filter(Boolean).map(esc).join(" · ")}</p>` : ""}
  <div class="cc-hero"><span class="cc-hero-label">${s > 0 ? `${esc(p.nome)} te deve` : s < 0 ? `Você deve a ${esc(p.nome)}` : "Sem pendências"}</span><strong class="cc-amount">${dinheiro(Math.abs(s))}</strong><span class="cc-small">O que te devem não entra no disponível.</span></div>
  ${acertos.some((a) => a.situacao === "aberto") ? blocoMeses(pendenciasAcertos(id), /^\d{4}-\d{2}$/.test(q.mes || "") ? q.mes : mesDe(h), `pessoa/${id}`) + secao("Acertos em aberto") : ""}
  ${acertos.filter((a) => a.situacao === "aberto").map(bloco).join("") || lista([], "Nenhum acerto em aberto.")}
  ${acertos.some((a) => a.situacao !== "aberto") ? secao("Quitados") + acertos.filter((a) => a.situacao !== "aberto").map(bloco).join("") : ""}
  <div class="cc-acoes"><button type="button" class="cc-secundario" data-acao="novo-acerto" data-pessoa="${p.id}">${icone("plus", 18)}Nova dívida ou empréstimo com ${esc(p.nome)}</button>
  <button type="button" class="cc-secundario" data-acao="editar-pessoa" data-id="${p.id}">${icone("pencil", 18)}Editar dados de ${esc(p.nome)}</button>
  <button type="button" class="cc-text-button" data-acao="ir" data-rota="lancamentos?pessoa=${p.id}">Ver lançamentos ligados a ${esc(p.nome)}</button></div>`;
}
function formPessoa(aoCriar, p = null) {
  const d = estado.d;
  const temVinculo = p && (d.acertos.some((a) => a.pessoa_id === p.id) || d.cotas.some((c) => c.pessoa_id === p.id) || d.rachas.some((r) => r.pagador_pessoa_id === p.id));
  const f = abrirFolha(p ? `Editar ${p.nome}` : "Nova pessoa", `<form novalidate>${campo("Nome", `<input name="nome" maxlength="60" autocomplete="off" value="${esc(p?.nome || "")}">`)}${campo("Contato", `<input name="contato" maxlength="80" placeholder="telefone ou e-mail (opcional)" value="${esc(p?.contato || "")}">`)}${campo("Observações", `<textarea name="observacoes" maxlength="500" placeholder="Ex.: Pix dela, combinados, apelido">${esc(p?.observacoes || "")}</textarea>`)}<div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button>${p ? (temVinculo ? `<p class="cc-small">Para apagar, primeiro apague os acertos e rachas ligados a ${esc(p.nome)}.</p>` : `<button type="button" class="cc-perigo" data-acao="apagar-pessoa" data-id="${p.id}">Apagar pessoa</button>`) : ""}</div></form>`);
  const form = f.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) return erroForm(form, "Informe o nome.");
    if (d.pessoas.some((x) => x.id !== p?.id && x.nome.toLowerCase() === nome.toLowerCase())) return erroForm(form, "Já existe uma pessoa com esse nome.");
    const reg = { nome, contato: form.contato.value.trim() || null, observacoes: form.observacoes.value.trim() || null };
    const r = p ? await atualizar("pessoas", p.id, reg) : await inserir("pessoas", reg);
    if (!r) return;
    fecharFolha(); await recarregar(); aoCriar && !p ? aoCriar(r) : avisar("Pessoa salva.");
  });
}
function formAcerto(pessoaId, ac = null) {
  const d = estado.d;
  if (!d.pessoas.length) return formPessoa((p) => formAcerto(p.id));
  const psAtual = ac ? d.parcelas.filter((p) => p.acerto_id === ac.id).sort((x, y) => x.numero - y.numero) : [];
  const pago = ac ? ac.valor_total_centavos - restante(ac) : 0;
  const semData = ac ? !psAtual.length : false;
  const f = abrirFolha(ac ? "Editar dívida" : "Dívida ou empréstimo", `<form novalidate>
    ${campo("Pessoa", `<select name="pessoa">${opcoes(d.pessoas.map((p) => [p.id, p.nome]), ac?.pessoa_id || pessoaId)}</select>`)}
    ${segmento("direcao", [["eu_devo", "Eu devo"], ["me_deve", "Me deve"]], ac?.direcao || "eu_devo")}
    ${campo("Descrição", `<input name="descricao" maxlength="80" placeholder="Ex.: notebook, empréstimo" value="${esc(ac?.descricao || "")}">`)}
    <div class="cc-grade-campos">${campo("Valor total (R$)", entradaValor("valor", ac?.valor_total_centavos))}${campo("Parcelas", `<select name="parcelas">${opcoes(Array.from({ length: 36 }, (_, i) => [i + 1, i ? `${i + 1}×` : "Pagamento único"]), psAtual.length || 1)}</select>`)}</div>
    <label class="cc-participante" style="margin:4px 0 10px"><span><input type="checkbox" name="semdata" ${semData ? "checked" : ""}> Ainda sem data para pagar</span></label>
    ${campo("Primeiro vencimento", `<input type="date" name="primeira" value="${psAtual[0]?.vencimento || hoje()}">`, "As parcelas seguintes ficam no mesmo dia, mês a mês. Sem data, a dívida conta como devida agora até você marcar uma data.")}
    ${pago ? `<p class="cc-small" style="margin-bottom:10px">Já ${ac.direcao === "me_deve" ? "recebido" : "pago"}: ${dinheiro(pago)}. Os pagamentos continuam valendo e abatem as primeiras parcelas.</p>` : ""}
    ${campo("Observações", `<textarea name="observacoes" maxlength="500">${esc(ac?.observacoes || "")}</textarea>`)}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button></div></form>`);
  const form = f.querySelector("form");
  let direcao = ac?.direcao || "eu_devo";
  const alternar = () => { form.primeira.disabled = form.semdata.checked; if (form.semdata.checked) form.parcelas.value = "1"; form.parcelas.disabled = form.semdata.checked; };
  form.semdata.addEventListener("change", alternar); alternar();
  f.querySelectorAll('[data-nome="direcao"]').forEach((b) => b.addEventListener("click", () => { direcao = b.dataset.valor; f.querySelectorAll('[data-nome="direcao"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = paraCentavos(form.valor.value), n = Number(form.parcelas.value), sem = form.semdata.checked;
    if (!form.descricao.value.trim()) return erroForm(form, "Informe a descrição.");
    if (!v || v <= 0) return erroForm(form, "Informe o valor total.");
    if (!sem && !form.primeira.value) return erroForm(form, "Informe o primeiro vencimento ou marque \"sem data\".");
    if (v < pago) return erroForm(form, `O valor não pode ser menor que o já pago (${dinheiro(pago)}).`);
    const reg = { pessoa_id: form.pessoa.value, direcao, descricao: form.descricao.value.trim(), valor_total_centavos: v, observacoes: form.observacoes.value.trim() || null };
    let alvo = ac;
    if (ac) { reg.situacao = v === pago ? "quitado" : "aberto"; if (!(await atualizar("acertos", ac.id, reg))) return; }
    else { alvo = await inserir("acertos", reg); if (!alvo) return; }
    // Refaz o calendário de parcelas (os pagamentos ficam e abatem as primeiras)
    const novas = sem ? [] : gerarParcelas(v, n, form.primeira.value);
    const iguais = ac && novas.length === psAtual.length && novas.every((p, i) => p.vencimento === psAtual[i].vencimento && p.valor_centavos === psAtual[i].valor_centavos);
    if (!iguais) {
      if (ac) { const { error } = await sb.from("acerto_parcelas").delete().eq("acerto_id", ac.id); if (error) return falhou(error); }
      if (novas.length && !(await inserirVarios("acerto_parcelas", novas.map((p) => ({ ...p, acerto_id: alvo.id }))))) return;
    }
    fecharFolha(); avisar(ac ? "Dívida atualizada." : "Acerto salvo."); await recarregar(); ir(`pessoa/${form.pessoa.value}`);
  });
}
function formPagamento(a) {
  const r = restante(a);
  const f = abrirFolha(a.direcao === "me_deve" ? "Registrar recebimento" : "Registrar pagamento", `<form novalidate>
    <p class="cc-small" style="margin-bottom:12px">${esc(pessoa(a.pessoa_id)?.nome)} · ${esc(a.descricao)} · restante ${dinheiro(r)}</p>
    <div class="cc-grade-campos">${campo("Valor (R$)", entradaValor("valor", r))}${campo("Data", `<input type="date" name="data" value="${hoje()}">`)}</div>
    ${campo("Observações", `<input name="observacoes" maxlength="120">`, "Pode ser um valor parcial.")}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button></div></form>`);
  const form = f.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = paraCentavos(form.valor.value);
    if (!v || v <= 0) return erroForm(form, "Informe um valor maior que zero.");
    if (v > r) return erroForm(form, `O valor passa do restante (${dinheiro(r)}).`);
    if (!(await inserir("acerto_pagamentos", { acerto_id: a.id, data: form.data.value || hoje(), valor_centavos: v, observacoes: form.observacoes.value.trim() || null }))) return;
    if (v === r) await atualizar("acertos", a.id, { situacao: "quitado" });
    fecharFolha(); if (v === r) carimbar("Quitado"); else avisar("Pagamento parcial registrado."); await recarregar();
  });
}
function detalheAcerto(a) {
  const d = estado.d;
  const ps = parcelasComSaldo(a, d.parcelas, d.pagamentos);
  const pags = d.pagamentos.filter((p) => p.acerto_id === a.id);
  abrirFolha(a.descricao, `<p class="cc-small" style="margin-bottom:10px">${esc(pessoa(a.pessoa_id)?.nome)} · ${a.direcao === "me_deve" ? "me deve" : "eu devo"} · total ${dinheiro(a.valor_total_centavos)}</p>
    ${ps.length ? secao("Parcelas") + lista(ps.map((p) => linha({ titulo: `${p.numero}ª · ${dataBR(p.vencimento)}`, sub: p.restante_centavos === 0 ? "paga" : p.pago_centavos ? `pago ${dinheiro(p.pago_centavos)}` : "em aberto", valor: dinheiro(p.valor_centavos) }))) : ""}
    ${secao("Pagamentos")}${lista(pags.map((p) => linha({ titulo: dataBR(p.data), sub: esc(p.observacoes || ""), valor: dinheiro(p.valor_centavos), acao: "apagar-pagamento", attrs: `data-id="${p.id}" data-acerto="${a.id}" aria-label="Apagar pagamento de ${dataBR(p.data)}"` })), "Nenhum pagamento ainda.")}
    <p class="cc-small" style="margin-top:8px">Toque num pagamento para apagar (dois toques).</p>
    <div class="cc-acoes"><button type="button" class="cc-secundario" data-acao="editar-acerto" data-id="${a.id}">${icone("pencil", 18)}Editar dívida</button>${a.situacao === "aberto" ? `<button type="button" class="cc-secundario" data-acao="perdoar-acerto" data-id="${a.id}">Marcar como encerrado sem pagamento</button>` : `<button type="button" class="cc-secundario" data-acao="reabrir-acerto" data-id="${a.id}">Reabrir</button>`}
    <button type="button" class="cc-perigo" data-acao="apagar-acerto" data-id="${a.id}">Apagar este acerto</button></div>`);
}
function formRacha(lancId = null) {
  const d = estado.d;
  if (!d.pessoas.length) return formPessoa(() => formRacha(lancId));
  let saidas = d.lancamentos.filter((l) => l.valor_centavos < 0 && l.natureza === "normal" && l.situacao !== "futuro" && !d.rachas.some((r) => r.lancamento_id === l.id)).slice(0, 60);
  const pre = lancId && d.lancamentos.find((l) => l.id === lancId);
  if (pre && !saidas.includes(pre)) saidas = [pre, ...saidas];
  const f = abrirFolha("Novo racha", `<form id="form-racha" novalidate>
    ${campo("Ocasião", `<input name="ocasiao" maxlength="80" placeholder="Ex.: janta, viagem, casa">`)}
    <div class="cc-grade-campos">${campo("Valor total (R$)", entradaValor("valor"))}${campo("Data", `<input type="date" name="data" value="${hoje()}">`)}</div>
    ${campo("Quem pagou", `<select name="pagador"><option value="">Eu</option>${opcoes(d.pessoas.map((p) => [p.id, p.nome]))}</select>`)}
    ${campo("Saída no banco (opcional)", `<select name="lancamento"><option value="">Não ligar</option>${opcoes(saidas.map((l) => [l.id, `${dataBR(l.data)} · ${l.descricao.slice(0, 26)} · ${dinheiro(l.valor_centavos)}`]))}</select>`, "Ligar preserva a saída original e trata o que vão te devolver como recuperação.")}
    ${segmento("metodo", [["igual", "Igual"], ["percentual", "Por %"], ["valor", "Por valor"], ["uma_pessoa", "Só uma pessoa"]], "igual")}
    <p class="cc-small" id="dica-metodo" style="margin:-4px 0 8px"></p>
    <div id="participantes">${[["", "Eu"], ...d.pessoas.map((p) => [p.id, p.nome])].map(([id, nome]) => `<div class="cc-participante"><label><input type="checkbox" data-part="${id}" ${id === "" ? "checked" : ""}>${esc(nome)}</label><input type="text" inputmode="decimal" data-cota="${id}" aria-label="Cota de ${esc(nome)}" placeholder="—" readonly></div>`).join("")}</div>
    <p class="cc-small" id="resumo-cotas" style="margin-top:10px"></p>
    ${campo("Prazo para acertar", `<input type="date" name="prazo">`, "opcional")}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar racha</button><button type="button" class="cc-text-button" data-acao="nova-pessoa-racha">${icone("plus", 15)}Cadastrar outra pessoa</button></div>
  </form>`);
  const form = f.querySelector("form");
  let metodo = "igual";
  const recalcular = () => {
    const total = paraCentavos(form.valor.value) || 0;
    const uma = metodo === "uma_pessoa";
    f.querySelector("#dica-metodo").textContent = uma ? "Você pagou e uma pessoa fica devendo o valor inteiro. Marque só ela." : "";
    const eu = f.querySelector('[data-part=""]'); eu.disabled = uma; if (uma) { eu.checked = false; form.pagador.value = ""; } form.pagador.disabled = uma;
    if (uma) { const m = [...f.querySelectorAll("[data-part]")].filter((x) => x.dataset.part && x.checked); m.slice(1).forEach((x) => (x.checked = false)); }
    const marcados = [...f.querySelectorAll("[data-part]")].filter((x) => x.checked).map((x) => x.dataset.part);
    f.querySelectorAll("[data-cota]").forEach((inp) => { const on = marcados.includes(inp.dataset.cota); inp.readOnly = metodo === "igual" || !on; if (!on) inp.value = ""; });
    if (uma && marcados.length === 1) f.querySelector(`[data-cota="${marcados[0]}"]`).value = (total / 100).toFixed(2).replace(".", ",");
    if (metodo === "igual" && marcados.length) {
      const vs = dividirIgual(total, marcados.length);
      marcados.forEach((id, i) => { f.querySelector(`[data-cota="${id}"]`).value = (vs[i] / 100).toFixed(2).replace(".", ","); });
    }
    const cotas = calcCotas(total, marcados, metodo, f);
    const soma = cotas ? cotas.reduce((s, c) => s + c.cota, 0) : 0;
    const minha = cotas?.find((c) => c.id === "")?.cota ?? 0;
    const pagEu = !form.pagador.value;
    f.querySelector("#resumo-cotas").textContent = uma ? (marcados.length === 1 ? `${pessoa(marcados[0])?.nome} te deve ${dinheiro(total)}.` : "Marque a pessoa que vai te pagar.") : !cotas ? (metodo === "percentual" ? "Os percentuais precisam somar 100." : "As cotas precisam somar o valor total.") :
      soma !== total ? `As cotas somam ${dinheiro(soma)}; o total é ${dinheiro(total)}.` : pagEu ? `Sua cota: ${dinheiro(minha)} · a receber: ${dinheiro(total - minha)}` : `Sua cota: ${dinheiro(minha)}, que você deve a quem pagou.`;
  };
  f.querySelectorAll('[data-nome="metodo"]').forEach((b) => b.addEventListener("click", () => {
    metodo = b.dataset.valor; f.querySelectorAll('[data-nome="metodo"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    f.querySelectorAll("[data-cota]").forEach((i) => { i.value = ""; i.placeholder = metodo === "percentual" ? "%" : metodo === "valor" ? "0,00" : "—"; });
    recalcular();
  }));
  f.querySelectorAll("[data-part]").forEach((x) => x.addEventListener("change", () => { if (metodo === "uma_pessoa" && x.checked) f.querySelectorAll("[data-part]").forEach((y) => { if (y !== x) y.checked = false; }); }));
  form.addEventListener("input", recalcular); form.addEventListener("change", recalcular);
  form.lancamento.addEventListener("change", () => { const l = d.lancamentos.find((x) => x.id === form.lancamento.value); if (l) { form.valor.value = (-l.valor_centavos / 100).toFixed(2).replace(".", ","); form.data.value = l.data; form.pagador.value = ""; recalcular(); } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const total = paraCentavos(form.valor.value);
    if (!form.ocasiao.value.trim()) return erroForm(form, "Informe a ocasião.");
    if (!total || total <= 0) return erroForm(form, "Informe o valor total.");
    const marcados = [...f.querySelectorAll("[data-part]")].filter((x) => x.checked).map((x) => x.dataset.part);
    if (metodo === "uma_pessoa") { if (marcados.length !== 1 || !marcados[0]) return erroForm(form, "Marque só a pessoa que vai te pagar."); }
    else if (marcados.length < 2) return erroForm(form, "Marque pelo menos duas pessoas, contando você.");
    const pagador = form.pagador.value || null;
    if (pagador && !marcados.includes("")) return erroForm(form, "Se outra pessoa pagou, inclua você entre os participantes.");
    const cotas = calcCotas(total, marcados, metodo, f);
    if (!cotas || cotas.reduce((s, c) => s + c.cota, 0) !== total) return erroForm(form, metodo === "percentual" ? "Os percentuais precisam somar 100." : "As cotas precisam somar o valor total.");
    const r = await inserir("rachas", { ocasiao: form.ocasiao.value.trim(), data: form.data.value || hoje(), valor_total_centavos: total, pagador_pessoa_id: pagador, metodo, lancamento_id: form.lancamento.value || null, prazo: form.prazo.value || null });
    if (!r) return;
    if (!(await inserirVarios("racha_cotas", cotas.map((c) => ({ racha_id: r.id, pessoa_id: c.id || null, cota_centavos: c.cota, percentual: c.percentual ?? null }))))) return;
    // Gera os acertos: se eu paguei, cada pessoa me deve a cota dela; se outra pessoa pagou, eu devo a minha a ela
    const acertos = pagador ? [{ pessoa_id: pagador, direcao: "eu_devo", descricao: `Racha: ${r.ocasiao}`, valor_total_centavos: cotas.find((c) => c.id === "").cota, racha_id: r.id }]
      : cotas.filter((c) => c.id && c.cota > 0).map((c) => ({ pessoa_id: c.id, direcao: "me_deve", descricao: `Racha: ${r.ocasiao}`, valor_total_centavos: c.cota, racha_id: r.id }));
    const criados = await inserirVarios("acertos", acertos.filter((a) => a.valor_total_centavos > 0));
    if (criados && form.prazo.value) await inserirVarios("acerto_parcelas", criados.map((a) => ({ acerto_id: a.id, numero: 1, vencimento: form.prazo.value, valor_centavos: a.valor_total_centavos })));
    if (r.lancamento_id) await decidir("rev:" + r.lancamento_id, "conferido");
    fecharFolha(); avisar("Racha salvo."); await recarregar(); ir(lancId ? "revisao" : "acertos");
  });
  if (pre) { form.lancamento.value = pre.id; form.ocasiao.value = pre.descricao.slice(0, 80); form.lancamento.dispatchEvent(new Event("change")); }
  recalcular();
}
// Cotas a partir do método: igual (centavos para os primeiros), percentual (maior resto) ou valores informados
function calcCotas(total, ids, metodo, f) {
  if (!ids.length) return null;
  if (metodo === "uma_pessoa") return ids.length === 1 ? [{ id: ids[0], cota: total }] : null;
  if (metodo === "igual") return dividirIgual(total, ids.length).map((v, i) => ({ id: ids[i], cota: v }));
  const vals = ids.map((id) => f.querySelector(`[data-cota="${id}"]`).value);
  if (metodo === "percentual") {
    const ps = vals.map((v) => Number(String(v).replace(",", ".")));
    if (ps.some((p) => !isFinite(p) || p < 0) || Math.abs(ps.reduce((s, p) => s + p, 0) - 100) > 0.001) return null;
    return dividirPercentual(total, ps).map((v, i) => ({ id: ids[i], cota: v, percentual: ps[i] }));
  }
  const cs = vals.map(paraCentavos);
  if (cs.some((c) => c === null || c < 0)) return null;
  return cs.map((c, i) => ({ id: ids[i], cota: c }));
}

// ---------- Assinaturas ----------
export function telaAssinaturas() {
  const d = estado.d, h = hoje();
  const ass = d.compromissos.filter((c) => c.tipo === "assinatura" && c.situacao !== "cancelado");
  const canceladas = d.compromissos.filter((c) => c.tipo === "assinatura" && c.situacao === "cancelado");
  const porMes = { mensal: 1, anual: 1 / 12, semestral: 1 / 6, trimestral: 1 / 3, bimestral: 1 / 2, semanal: 52 / 12, quinzenal: 26 / 12, unica: 0 };
  const mensal = Math.round(ass.filter((c) => c.situacao === "ativo").reduce((s, c) => s + suaParte(c) * (porMes[c.periodicidade] ?? 1), 0));
  const divididas = ass.filter((c) => rateiosDe(c).length).length;
  const sug = sugerirAssinaturas(d, h);
  const prox = (c) => agenda([c], d.baixas, h, somaDias(h, 400), h)[0];
  return `${titulo("Compromissos", "Assinaturas", "mais")}
  <div class="cc-grade2"><div class="cc-stat"><span>Custo mensal${divididas ? " (sua parte)" : " equivalente"}</span><strong class="cc-num">${dinheiro(mensal)}</strong><small class="cc-small">${divididas ? `${divididas} dividida(s) com pessoas` : "para comparar custos"}</small></div>
  <div class="cc-stat"><span>Por ano</span><strong class="cc-num">${dinheiro(mensal * 12)}</strong><small class="cc-small">${ass.filter((c) => c.situacao === "ativo").length} ativa(s)</small></div></div>
  ${secao("Próximas cobranças", "<span>datas reais</span>")}
  ${lista(ass.map((c) => { const o = prox(c); return linha({ esquerda: logoCompromisso(c), titulo: esc(c.nome) + (c.situacao === "pausado" ? selo("Pausada") : ""), sub: `${o ? dataBR(o.data) : "sem data"} · ${esc(conta(c.conta_id)?.nome || "forma não definida")}`, valor: dinheiro(c.valor_centavos), valorSub: rateiosDe(c).length ? `sua parte ${dinheiro(suaParte(c))}` : c.periodicidade === "mensal" ? "por mês" : c.periodicidade, acao: "ir", attrs: `data-rota="compromisso/${c.id}"` }); }), "Nenhuma assinatura confirmada.")}
  ${sug.length ? secao("Encontrei nos seus lançamentos", `<span>${sug.length}</span>`) + lista(sug.map((s) => `<div class="cc-row">${logo(dominioServico(s.nome), s.nome)}<div class="cc-row-main"><strong>${esc(s.nome)}</strong><span>${s.meses} meses seguidos · última ${dataBR(s.ultima)} · ${esc(conta(s.conta_id)?.nome || "")}</span></div><div class="cc-row-fim"><strong class="cc-num">${dinheiro(s.valor)}</strong><span><button type="button" class="cc-text-button" style="min-height:44px;display:inline-flex" data-acao="confirmar-assinatura" data-chave="${esc(s.chave)}">Confirmar</button> <button type="button" class="cc-text-button" style="min-height:44px;display:inline-flex;color:var(--cc-muted)" data-acao="rejeitar-assinatura" data-chave="${esc(s.chave)}">Não é</button></span></div></div>`)) : ""}
  ${canceladas.length ? secao("Canceladas", "<span>histórico mantido</span>") + lista(canceladas.map((c) => linha({ esquerda: logoCompromisso(c), titulo: esc(c.nome), sub: `cancelada em ${dataBR(c.cancelado_em)}`, valor: dinheiro(c.valor_centavos), acao: "ir", attrs: `data-rota="compromisso/${c.id}"` }))) : ""}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="novo-compromisso" data-tipo="assinatura">${icone("plus", 18)}Nova assinatura</button></div>`;
}

// ---------- Revisão ----------
// Grava a marcação e atualiza a tela sem recarregar tudo
async function marcarRev(ids, decisao) {
  for (const id of ids) {
    if (!(await decidir("rev:" + id, decisao))) return false;
    const ds = estado.d.decisoes, i = ds.findIndex((x) => x.chave === "rev:" + id);
    if (i >= 0) ds[i] = { ...ds[i], decisao }; else ds.push({ chave: "rev:" + id, decisao });
  }
  ir("revisao"); return true;
}
export function telaRevisao() {
  const d = estado.d, h = hoje();
  const dups = sugerirDuplicidades(d).slice(0, 20), transf = sugerirTransferencias(d).slice(0, 20), sug = sugerirAssinaturas(d, h);
  const semCat = d.lancamentos.filter((l) => !l.categoria_id && l.natureza === "normal" && l.situacao !== "futuro" && !catDispensada(l.id));
  const par = (a, b, txt) => `<div class="cc-card" style="padding:14px"><p class="cc-small" style="margin-bottom:6px">${txt}</p>${lista([linhaLancamento(a), linhaLancamento(b)])}`;
  const marcados = new Map(d.decisoes.filter((x) => x.chave.startsWith("rev:")).map((x) => [x.chave.slice(4), x.decisao]));
  const emRacha = new Set(d.rachas.map((r) => r.lancamento_id).filter(Boolean));
  const conferiveis = d.lancamentos.filter((l) => l.natureza === "normal" && l.situacao !== "futuro" && !emRacha.has(l.id));
  const aVerificar = conferiveis.filter((l) => marcados.get(l.id) === "verificar");
  const novos = conferiveis.filter((l) => !marcados.has(l.id));
  const botoes = (l, verif) => `<div class="cc-rev-botoes">
    <button type="button" class="cc-rev ok" data-acao="rev-ok" data-id="${l.id}" aria-label="Conferido: ${esc(l.descricao)}">${icone("check", 20)}</button>
    ${l.valor_centavos < 0 ? `<button type="button" class="cc-rev dividir" data-acao="rev-dividir" data-id="${l.id}" aria-label="Dividir em racha: ${esc(l.descricao)}">${icone("split", 20)}</button>` : ""}
    ${verif ? "" : `<button type="button" class="cc-rev verificar" data-acao="rev-verificar" data-id="${l.id}" aria-label="Marcar para verificar: ${esc(l.descricao)}">${icone("circle-help", 20)}</button>`}
  </div>`;
  const item = (l, verif) => `<div class="cc-rev-item${verif ? " destaque" : ""}">${linhaLancamento(l)}${botoes(l, verif)}</div>`;
  return `${titulo("Conferência", "Revisão", "mais")}
  <p class="cc-small" style="margin-bottom:14px">Em cada lançamento: ${icone("check", 14)} está certo · ${icone("split", 14)} preciso dividir (abre o racha) · ${icone("circle-help", 14)} preciso verificar (fica em destaque).</p>
  ${aVerificar.length ? secao("Para verificar", `<span>${aVerificar.length}</span>`) + aVerificar.map((l) => item(l, true)).join("") : ""}
  ${secao("Lançamentos para conferir", `<span>${novos.length}</span>`)}
  ${novos.length ? novos.slice(0, 15).map((l) => item(l, false)).join("") + (novos.length > 15 ? `<p class="cc-small" style="margin:8px 0">Mostrando os 15 mais recentes de ${novos.length}.</p>` : "") + `<button type="button" class="cc-text-button" data-acao="rev-todos-ok" data-ids="${novos.slice(0, 15).map((l) => l.id).join(",")}">${icone("check", 15)}Marcar estes ${Math.min(15, novos.length)} como conferidos</button>` : lista([], "Tudo conferido.")}
  ${secao("Categorias pendentes", `<span>${semCat.length}</span>`)}
  ${semCat.length ? lista(semCat.slice(0, 8).map(linhaLancamento)) + `<button type="button" class="cc-text-button" data-acao="ir" data-rota="lancamentos?categoria=sem&mes=${semCat[0].data.slice(0, 7)}">Ver todos sem categoria ${icone("chevron-right", 15)}</button>` : lista([], "Tudo categorizado.")}
  ${secao("Possíveis duplicidades", `<span>${dups.length}</span>`)}
  ${dups.map((x) => par(x.a, x.b, "Mesmo valor, mesma conta e datas próximas; um deles é manual ou importado.") + `<div class="cc-acoes-linha"><button type="button" class="cc-primary" style="margin:0" data-acao="resolver-dup" data-chave="${x.chave}" data-manter="${x.a.origem === "pluggy" ? x.a.id : x.b.id}" data-remover="${x.a.origem === "pluggy" ? x.b.id : x.a.id}">É o mesmo: manter o do banco</button><button type="button" class="cc-secundario" data-acao="rejeitar" data-chave="${x.chave}">São diferentes</button></div></div>`).join("") || lista([], "Nenhuma duplicidade encontrada.")}
  ${secao("Transferências entre minhas contas", `<span>${transf.length}</span>`)}
  ${transf.map((x) => par(x.saida, x.entrada, "Saiu de uma conta sua e entrou em outra no mesmo valor, em até 2 dias.") + `<div class="cc-acoes-linha"><button type="button" class="cc-primary" style="margin:0" data-acao="confirmar-transf" data-chave="${x.chave}" data-a="${x.saida.id}" data-b="${x.entrada.id}">Confirmar transferência</button><button type="button" class="cc-secundario" data-acao="rejeitar" data-chave="${x.chave}">Não é</button></div></div>`).join("") || lista([], "Nenhuma transferência sugerida.")}
  ${secao("Possíveis assinaturas", `<span>${sug.length}</span>`)}
  ${sug.length ? `<button type="button" class="cc-text-button" data-acao="ir" data-rota="assinaturas">Revisar ${sug.length} sugestão(ões) em Assinaturas ${icone("chevron-right", 15)}</button>` : lista([], "Nenhuma sugestão nova.")}`;
}

// ---------- Relatórios ----------
export function telaRelatorios(q) {
  const d = estado.d;
  const mes = /^\d{4}-\d{2}$/.test(q.mes || "") ? q.mes : hoje().slice(0, 7);
  const ant = somaMeses(`${mes}-01`, -1).slice(0, 7);
  const c = consumoDoMes(d, mes), ca = consumoDoMes(d, ant), cx = caixaDoMes(d, mes);
  const nomeCat = (id) => (id ? categoria(id)?.nome : "Sem categoria") || "Sem categoria";
  const mapaAnt = new Map(ca.porCategoria);
  const mudancas = [...new Set([...c.porCategoria.map((x) => x[0]), ...ca.porCategoria.map((x) => x[0])])]
    .map((id) => ({ id, agora: c.porCategoria.find((x) => x[0] === id)?.[1] || 0, antes: mapaAnt.get(id) || 0 })).map((x) => ({ ...x, dif: x.agora - x.antes }))
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 4);
  const mx = Math.max(...c.porCategoria.map((x) => x[1]), 1);
  const reservado = d.objetivos.filter((o) => o.situacao === "ativo").reduce((s, o) => s + o.valor_guardado_centavos, 0);
  const pessoasMe = d.acertos.filter((a) => a.direcao === "me_deve" && a.situacao === "aberto").reduce((s, a) => s + restante(a), 0);
  const pessoasDevo = d.acertos.filter((a) => a.direcao === "eu_devo" && a.situacao === "aberto").reduce((s, a) => s + restante(a), 0);
  const cartoes = d.contas.filter((x) => x.tipo === "cartao").reduce((s, x) => s + Math.max(0, -x.saldo_centavos), 0);
  const nome = nomeDono();
  return `${titulo("Relatórios", "Resumo do mês", "mais")}
  <div class="cc-mes-nav"><button type="button" class="cc-icon-button" data-acao="ir" data-rota="relatorios?mes=${ant}" aria-label="Mês anterior">${icone("chevron-left")}</button><strong>${mesLongo(mes)}</strong><button type="button" class="cc-icon-button" data-acao="ir" data-rota="relatorios?mes=${somaMeses(`${mes}-01`, 1).slice(0, 7)}" aria-label="Próximo mês">${icone("chevron-right")}</button></div>
  <article class="cc-papel">
  <header class="cc-papel-topo"><img src="/assets/monograma-escuro.svg" alt="" width="34" height="34"><div><p>Carteira Central · extrato pessoal</p><h2>${mesLongo(mes).replace(/^./, (x) => x.toUpperCase())}</h2></div><span class="cc-papel-serie">Nº ${mes.replace("-", "·")}</span></header>
  <div class="cc-duas"><div>
  ${secao("Consumo", "<span>o que você gastou</span>")}
  <div class="cc-grade2"><div class="cc-stat"><span>Receitas</span><strong class="cc-num cc-pos">${dinheiro(c.entradas)}</strong></div><div class="cc-stat"><span>Despesas</span><strong class="cc-num">${dinheiro(c.saidas)}</strong></div></div>
  <div class="cc-stat" style="margin-bottom:12px"><span>Resultado do mês</span><strong class="cc-num">${dinheiro(c.resultado, { sinal: true })}</strong><small class="cc-small">Compras no cartão contam aqui, na data da compra. Pagamento de fatura e transferências entre suas contas não contam; a parte de um racha que vão te devolver é recuperação.</small></div>
  ${secao("Por categoria")}
  <div class="cc-list" style="padding:10px 14px">${c.porCategoria.length ? c.porCategoria.map(([id, v]) => `<a class="cc-hbar" href="#/lancamentos?mes=${mes}&categoria=${id || "sem"}" style="text-decoration:none;color:inherit"><span>${esc(nomeCat(id))}</span><div><i style="width:${(v / mx) * 100}%;${categoria(id)?.cor ? `background:${categoria(id).cor}` : ""}"></i></div><strong class="cc-num">${dinheiro(v)}</strong></a>`).join("") : '<p class="cc-vazio">Sem despesas no mês.</p>'}</div>
  ${secao(`O que mais mudou desde ${mesLongo(ant).split(" ")[0]}`)}
  ${lista(mudancas.map((m) => linha({ titulo: esc(nomeCat(m.id)), sub: `${dinheiro(m.antes)} → ${dinheiro(m.agora)}`, valor: dinheiro(m.dif, { sinal: true }), acao: "ir", attrs: `data-rota="lancamentos?mes=${mes}&categoria=${m.id || "sem"}"` })), "Sem dados para comparar.")}
  </div><div>
  ${secao("Fluxo de caixa", "<span>o que passou pelas contas</span>")}
  <div class="cc-grade2"><div class="cc-stat"><span>Entrou nas contas</span><strong class="cc-num cc-pos">${dinheiro(cx.entradas)}</strong></div><div class="cc-stat"><span>Saiu das contas</span><strong class="cc-num">${dinheiro(cx.saidas)}</strong></div></div>
  <div class="cc-stat" style="margin-bottom:12px"><span>Faturas de cartão pagas</span><strong class="cc-num">${dinheiro(cx.faturasPagas)}</strong><small class="cc-small">No caixa, a fatura é a saída; no consumo, contam as compras.</small></div>
  ${secao("Hoje")}
  ${lista([linha({ titulo: "Reservado em metas e reservas", valor: dinheiro(reservado) }), linha({ titulo: "Devo nos cartões", valor: dinheiro(cartoes) }), linha({ titulo: "Devo a pessoas", valor: dinheiro(pessoasDevo) }), linha({ titulo: "Pessoas me devem", valor: dinheiro(pessoasMe) })])}
  </div></div>
  <footer class="cc-papel-assinatura"><span class="cc-assinatura">${esc(nome || "Titular")}</span><span class="cc-papel-linha"></span><small>${esc(nomeNoCartao() || "Titular")} · emitido em ${dataBR(hoje())}</small></footer>
  </article>
  <div><div>
  <div class="cc-acoes"><button type="button" class="cc-secundario" data-acao="exportar" data-mes="${mes}">${icone("upload", 18)}Exportar lançamentos do mês (CSV)</button><button type="button" class="cc-secundario" data-acao="exportar-tudo">${icone("upload", 18)}Exportar todos os registros (CSV)</button></div>
  </div></div>`;
}
function baixarCSV(nome, linhas) {
  const csv = "﻿" + linhas.map((l) => l.map((v) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
}
const valorCSV = (c) => (c / 100).toFixed(2).replace(".", ",");

// ---------- Conexões ----------
export function telaConexoes() {
  const d = estado.d;
  const nomes = { UPDATED: ["Atualizada", "ok"], UPDATING: ["Coletando no banco", "previsto"], LOGIN_ERROR: ["Precisa reconectar", "vencido"], OUTDATED: ["Desatualizada", "vencido"], WAITING_USER_INPUT: ["Aguardando você", "vencido"], CONSENTIMENTO_EXPIRADO: ["Autorização vencida", "vencido"] };
  return `${titulo("Integração", "Conexões", "mais")}
  <p class="cc-info" style="margin-top:0"><strong>Como funciona</strong>O Meu Pluggy coleta seus dados nos bancos sozinho, uma vez a cada 24 horas; essa coleta não pode ser pedida pelo app. O app copia o que já foi coletado todos os dias às 14h40, e você pode buscar agora o que já está coletado.</p>
  ${lista(d.conexoes.map((x) => { const s = nomes[x.status] || [x.status || "Sem consulta", ""]; const det = x.consulta_detalhe || {}; return `<div class="cc-row" style="align-items:flex-start">${logoBanco(x.banco)}<div class="cc-row-main"><strong>${BANCOS[x.banco]?.nome}${x.ativa ? "" : selo("Pausada")}${x.consulta_ok === false ? selo("Falha na última busca", "vencido") : selo(s[0], s[1])}</strong>
    <span>Dados coletados pelo banco: ${dataHoraBR(x.dados_atualizados_em)} · próxima coleta: ${dataHoraBR(x.proxima_coleta_em)}</span>
    <span>Autorização válida até ${dataBR(x.consentimento_expira_em)} · última busca pelo app: ${dataHoraBR(x.consultado_em)}</span>
    <span>Cobertura: ${det.contas ?? 0} conta(s) e cartão(ões), ${det.lancamentos ?? 0} lançamento(s) na última busca, ${det.faturas ?? 0} fatura(s), ${det.investimentos ?? 0} investimento(s)</span>
    ${x.consulta_ok === false ? `<span class="cc-alerta">${esc(det.erro || "Erro desconhecido")}. Os dados anteriores foram mantidos.</span>` : ""}
    <button type="button" class="cc-text-button" data-acao="pausar-conexao" data-id="${x.id}">${x.ativa ? "Pausar" : "Reativar"}</button></div></div>`; }), "Nenhuma conexão.")}
  <p class="cc-small" style="margin-top:8px">${d.conexoes.length} de 5 conexões do uso pessoal do Meu Pluggy. Última busca: ${d.ultimaSinc ? `${dataHoraBR(d.ultimaSinc.iniciada_em)} (${d.ultimaSinc.ok === false ? "com falha" : d.ultimaSinc.ok ? "concluída" : "em andamento"})` : "nenhuma"}.</p>
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="buscar-dados">${icone("refresh-cw", 18)}Buscar dados já coletados</button>
  ${d.conexoes.length < 5 ? `<button type="button" class="cc-secundario" data-acao="nova-conexao">${icone("plus", 18)}Adicionar conexão (ex.: Banco do Brasil)</button>` : ""}</div>`;
}
function formConexao() {
  const f = abrirFolha("Adicionar conexão", `<p class="cc-info" style="margin-top:0"><strong>Antes</strong>No Dashboard da Pluggy: Aplicações › sua aplicação › Demo › Conectar Conta › MeuPluggy. Depois copie o id do banco em Itens Conectados.</p>
  <form novalidate>${campo("Banco", `<select name="banco">${opcoes(Object.entries(BANCOS).map(([k, b]) => [k, b.nome]), "bb")}</select>`)}${campo("Identificador (itemId)", `<input name="item" autocapitalize="none" autocomplete="off" placeholder="00000000-0000-0000-0000-000000000000">`)}
  <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar e buscar dados</button></div></form>`);
  const form = f.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = form.item.value.trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item)) return erroForm(form, "O identificador tem o formato 00000000-0000-0000-0000-000000000000.");
    const { error } = await sb.from("conexoes").insert({ banco: form.banco.value, pluggy_item_id: item });
    if (error) return erroForm(form, /duplicate|unique/i.test(error.message) ? "Essa conexão já está cadastrada." : "Não foi possível salvar.");
    fecharFolha(); await recarregar(); buscarDados();
  });
}
let buscando = false;
export async function buscarDados() {
  if (buscando) return; buscando = true;
  const { data, error } = await sb.rpc("buscar_dados_bancos");
  if (falhou(error)) { buscando = false; return; }
  if (data === "recente") { avisar("Uma busca foi feita há menos de 5 minutos."); buscando = false; return; }
  avisar("Buscando os dados já coletados pelo Meu Pluggy…");
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: s } = await sb.from("sincronizacoes").select("*").order("id", { ascending: false }).limit(1);
    if (s?.[0]?.concluida_em) { avisar(s[0].ok ? "Dados atualizados." : "Busca concluída com falhas. Veja cada conexão."); break; }
  }
  buscando = false; await recarregar();
}

// ---------- Notificações (Web Push) ----------
const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function blocoPush() {
  const av = estado.d.prefs.avisos || {};
  if (!pushSuportado()) return `<p class="cc-small">Para receber notificações, abra a Carteira Central pelo ícone na tela de início do iPhone (adicionado pelo Safari em Compartilhar › Adicionar à Tela de Início). Pelo navegador o iPhone não permite.</p>`;
  if (Notification.permission === "denied") return `<p class="cc-small">As notificações foram bloqueadas. Libere em Ajustes do iPhone › Notificações › Carteira, depois volte aqui.</p>`;
  return `<div class="cc-list" style="padding:12px 14px">
    <p class="cc-small" id="push-estado" style="margin-bottom:10px">Verificando…</p>
    <label class="cc-interruptor"><span>Resumo da manhã<br><small class="cc-small">o que vence ou entra hoje e amanhã</small></span><input type="checkbox" data-aviso="push_resumo" ${av.push_resumo ? "checked" : ""}></label>
    <label class="cc-interruptor"><span>Fatura fechou<br><small class="cc-small">valor final e vencimento de cada cartão</small></span><input type="checkbox" data-aviso="push_fatura" ${av.push_fatura ? "checked" : ""}></label>
    <p class="cc-small" style="margin:6px 0 10px">Chegam às 9h, só quando houver algo para avisar.</p>
    <div class="cc-acoes" style="margin-top:0" id="push-botoes"></div>
  </div>`;
}
async function inscricaoAtual() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
export async function atualizarBlocoPush() {
  const el = document.getElementById("push-estado"), bt = document.getElementById("push-botoes");
  if (!el || !bt) return;
  const sub = await inscricaoAtual().catch(() => null);
  const ativo = sub && Notification.permission === "granted";
  el.textContent = ativo ? "Ativas neste iPhone." : "Desligadas neste aparelho.";
  bt.innerHTML = ativo
    ? `<button type="button" class="cc-secundario" data-acao="push-teste">${icone("bell", 18)}Enviar notificação de teste</button><button type="button" class="cc-secundario" data-acao="push-previa">Ver o que chegaria hoje</button><button type="button" class="cc-text-button" data-acao="push-desligar">Desligar neste aparelho</button>`
    : `<button type="button" class="cc-primary" data-acao="push-ativar">${icone("bell", 18)}Ativar notificações</button>`;
}
const b64uParaBytes = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4); return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); };
const bytesParaB64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function ativarPush() {
  // o pedido de permissão precisa sair direto do toque
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { avisar("Sem permissão, o iPhone não deixa enviar notificações."); return desenharConfig(); }
  const { data, error } = await sb.functions.invoke("notificar", { body: { acao: "chave", origem: location.origin } });
  if (error || !data?.chave) return avisar("Não consegui preparar as notificações. Tente de novo.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(data.chave) });
  const j = sub.toJSON();
  const { error: e2 } = await sb.from("push_inscricoes").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, aparelho: /iPhone/.test(navigator.userAgent) ? "iPhone" : /Mac/.test(navigator.userAgent) ? "Mac" : "Outro" }, { onConflict: "endpoint" });
  if (falhou(e2)) return;
  const av = estado.d.prefs.avisos || {};
  await salvarPrefs({ avisos: { ...av, push_resumo: av.push_resumo ?? true, push_fatura: av.push_fatura ?? true } });
  await sb.functions.invoke("notificar", { body: { acao: "teste" } });
  avisar("Notificações ativadas. Mandei uma de teste.");
  desenharConfig();
}
function desenharConfig() { const b = document.getElementById("bloco-push"); if (b) { b.innerHTML = blocoPush(); atualizarBlocoPush(); } }
registrar({
  "push-ativar": () => ativarPush(),
  "push-teste": async () => { const { data, error } = await sb.functions.invoke("notificar", { body: { acao: "teste" } }); avisar(error ? "Não consegui enviar o teste." : data?.entregues ? "Teste enviado." : "Nenhum aparelho recebeu. Tente desligar e ativar de novo."); },
  "push-previa": async () => {
    const { data, error } = await sb.functions.invoke("notificar", { body: { acao: "previa" } });
    if (error) return avisar("Não consegui montar a prévia.");
    const itens = [data.resumo, ...(data.faturas || [])].filter(Boolean);
    abrirFolha("O que chegaria hoje às 9h", itens.length ? itens.map((m) => `<div class="cc-list" style="padding:12px 14px;margin-bottom:10px"><strong>${esc(m.titulo)}</strong><p class="cc-small" style="white-space:pre-line;margin-top:4px">${esc(m.corpo)}</p></div>`).join("") + `<p class="cc-small">Cada aviso chega uma vez só.</p>` : lista([], "Nada para avisar hoje: nenhuma notificação seria enviada."));
  },
  "push-desligar": async () => {
    const sub = await inscricaoAtual();
    if (sub) { await sb.from("push_inscricoes").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    avisar("Notificações desligadas neste aparelho."); desenharConfig();
  },
});

// ---------- Configurações ----------
export function telaConfiguracoes() {
  const d = estado.d;
  const av = d.prefs.avisos || {};
  const cats = (t) => lista(d.categorias.filter((c) => c.tipo === t).map((c) => linha({ esquerda: `<span class="cc-ic" style="color:${esc(c.cor || "var(--cc-currency)")}">${icone((c.icone || "circle-ellipsis").replace("repeat-2", "repeat2").replace("undo-2", "undo2"), 18)}</span>`, titulo: esc(c.nome), acao: "editar-categoria", attrs: `data-id="${c.id}"` })));
  return `${titulo("Preferências", "Configurações", "mais")}
  ${secao("Seu nome")}
  <form id="form-nome" novalidate>
  <div class="cc-grade-campos">${campo("Na saudação e no extrato", `<input name="nome" maxlength="40" value="${esc(d.prefs.nome || "")}" autocomplete="given-name">`)}${campo("Impresso nos cartões", `<input name="nome_cartao" maxlength="26" value="${esc(d.prefs.nome_cartao || "")}" style="text-transform:uppercase" autocomplete="off">`)}</div>
  <button class="cc-secundario" type="submit">Salvar nome</button></form>
  ${secao("Tema")}
  ${segmento("tema", [["escuro", "Escuro"], ["claro", "Claro"], ["sistema", "Do aparelho"]], d.prefs.tema || "escuro")}
  ${secao("Privacidade")}
  <label class="cc-interruptor"><span>Abrir com os valores ocultos</span><input type="checkbox" data-pref-local="cc-ocultar" ${estado.ocultar ? "checked" : ""}></label>
  ${secao("Notificações no iPhone")}
  <div id="bloco-push">${blocoPush()}</div>
  ${secao("Avisos no app")}
  <label class="cc-interruptor"><span>Vencimento de fatura</span><input type="checkbox" data-aviso="fatura" ${av.fatura !== false ? "checked" : ""}></label>
  ${campo("Avisar quantos dias antes", `<select data-aviso-dias="fatura_dias">${opcoes([[1, "1 dia"], [3, "3 dias"], [5, "5 dias"], [7, "7 dias"]], av.fatura_dias ?? 3)}</select>`)}
  <label class="cc-interruptor"><span>Renovação de assinatura (com lembrete)</span><input type="checkbox" data-aviso="renovacao" ${av.renovacao !== false ? "checked" : ""}></label>
  <label class="cc-interruptor"><span>Parcela atrasada de quem me deve</span><input type="checkbox" data-aviso="acertos" ${av.acertos ? "checked" : ""}></label>
  <label class="cc-interruptor"><span>Problema de conexão com banco</span><input type="checkbox" data-aviso="conexao" ${av.conexao !== false ? "checked" : ""}></label>
  <p class="cc-small">Esses avisos aparecem no topo do Início quando você abre o app.</p>
  ${secao("Categorias de despesa")}${cats("despesa")}
  ${secao("Categorias de receita")}${cats("receita")}
  <div class="cc-acoes"><button type="button" class="cc-secundario" data-acao="editar-categoria">${icone("plus", 18)}Nova categoria</button></div>
  ${secao("Acesso")}
  <div class="cc-list" style="padding:14px"><p class="cc-small">Conectado como</p><p style="word-break:break-all;margin-bottom:12px">${esc(estado.sessao?.user?.email)}</p><button type="button" class="cc-secundario" data-acao="sair">${icone("log-out", 18)}Sair</button></div>`;
}
const ICONES_CAT = ["utensils", "shopping-basket", "house", "car", "heart-pulse", "party-popper", "repeat2", "shopping-bag", "graduation-cap", "receipt", "landmark", "circle-ellipsis", "briefcase", "sparkles", "undo2", "trending-up", "gift", "banknote", "piggy-bank", "wallet", "tag", "star"];
const CORES_CAT = ["#A8C686", "#B69A60", "#E0A458", "#8FB3C9", "#C9A0DC", "#E58A8A", "#7FC8B5", "#D9B26F", "#9BB7E0", "#8FA88A", "#C98F7A", "#9AA59A"];
function formCategoria(k) {
  const f = abrirFolha(k ? "Editar categoria" : "Nova categoria", `<form novalidate>
    ${campo("Nome", `<input name="nome" maxlength="40" value="${esc(k?.nome || "")}">`)}
    ${k ? "" : campo("Tipo", `<select name="tipo">${opcoes([["despesa", "Despesa"], ["receita", "Receita"]])}</select>`)}
    ${campo("Cor", `<select name="cor">${opcoes(CORES_CAT.map((c) => [c, c]), k?.cor || CORES_CAT[0])}</select>`)}
    <fieldset style="border:0;padding:0;margin:0 0 14px"><legend class="cc-small" style="margin-bottom:6px">Ícone</legend><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${ICONES_CAT.map((i) => `<label style="position:relative;display:grid;place-items:center;min-height:44px;border:1px solid var(--cc-line);border-radius:10px;cursor:pointer"><input type="radio" name="icone" value="${i}" ${((k?.icone || "").replace("-2", "2") || "tag") === i ? "checked" : ""} style="position:absolute;opacity:0" aria-label="${i}">${icone(i, 20)}</label>`).join("")}</div></fieldset>
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button></div></form>`);
  const form = f.querySelector("form");
  const marcar = () => form.querySelectorAll('input[name="icone"]').forEach((r) => (r.parentElement.style.borderColor = r.checked ? "var(--cc-currency)" : "var(--cc-line)"));
  form.addEventListener("change", marcar); marcar();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) return erroForm(form, "Informe o nome.");
    const reg = { nome, cor: form.cor.value, icone: form.querySelector('input[name="icone"]:checked')?.value || "tag" };
    const ok = k ? await atualizar("categorias", k.id, reg) : await inserir("categorias", { ...reg, tipo: form.tipo.value });
    if (!ok) return;
    fecharFolha(); avisar("Categoria salva."); await recarregar();
  });
}

// ---------- Busca global ----------
export function abrirBusca() {
  const f = abrirFolha("Buscar", `<div class="cc-busca"><input type="search" id="campo-busca" placeholder="Lançamentos, pessoas, compromissos, contas" autocomplete="off" aria-label="Buscar"></div><div id="resultado-busca"></div>`);
  const inp = f.querySelector("#campo-busca"), out = f.querySelector("#resultado-busca");
  const buscar = () => {
    const t = inp.value.trim().toLowerCase();
    if (t.length < 2) { out.innerHTML = `<p class="cc-vazio">Digite pelo menos 2 letras.</p>`; return; }
    const d = estado.d;
    const ls = d.lancamentos.filter((l) => l.descricao.toLowerCase().includes(t) || (l.descricao_original || "").toLowerCase().includes(t) || (l.observacoes || "").toLowerCase().includes(t) || (l.etiquetas || []).some((e) => e.includes(t))).slice(0, 30);
    const ps = d.pessoas.filter((p) => p.nome.toLowerCase().includes(t));
    const cs = d.compromissos.filter((c) => c.nome.toLowerCase().includes(t));
    const ct = d.contas.filter((c) => c.nome.toLowerCase().includes(t));
    out.innerHTML = [
      ps.length ? secao("Pessoas") + lista(ps.map((p) => linha({ esquerda: logo(null, p.nome, { redondo: true }), titulo: esc(p.nome), acao: "ir", attrs: `data-rota="pessoa/${p.id}"` }))) : "",
      cs.length ? secao("Compromissos") + lista(cs.map((c) => linha({ esquerda: logoCompromisso(c), titulo: esc(c.nome), valor: dinheiro(c.valor_centavos), acao: "ir", attrs: `data-rota="compromisso/${c.id}"` }))) : "",
      ct.length ? secao("Contas e cartões") + lista(ct.map((c) => linha({ esquerda: logoBanco(c.banco), titulo: esc(c.nome), valor: dinheiro(c.saldo_centavos), acao: "ir", attrs: `data-rota="${c.tipo === "cartao" ? "cartoes" : "conta"}/${c.id}"` }))) : "",
      secao("Lançamentos", `<span>${ls.length}${ls.length === 30 ? "+" : ""}</span>`) + lista(ls.map(linhaLancamento), "Nada encontrado."),
    ].join("");
  };
  inp.addEventListener("input", buscar); buscar(); inp.focus();
}

// ---------- ações ----------
registrar({
  "editar-lancamento": (el) => formLancamento(estado.d.lancamentos.find((l) => l.id === el.dataset.id)),
  "novo-lancamento": () => formLancamento(null),
  "apagar-lancamento": async (el) => { if (!confirmarDuplo(el, "Toque de novo para excluir")) return; if (await apagar("lancamentos", el.dataset.id)) { fecharFolha(); avisar("Lançamento excluído."); await recarregar(); } },
  "nova-conta": () => formConta(null),
  "editar-conta": (el) => formConta(conta(el.dataset.id)),
  "arquivar-conta": async (el) => { if (!confirmarDuplo(el, "Toque de novo para arquivar")) return; if (await atualizar("contas", el.dataset.id, { arquivada: true })) { fecharFolha(); avisar("Conta arquivada."); await recarregar(); ir("contas"); } },
  "nova-pessoa": () => formPessoa(),
  "editar-acerto": (el) => { const a = estado.d.acertos.find((x) => x.id === el.dataset.id); if (a) formAcerto(a.pessoa_id, a); },
  "editar-pessoa": (el) => formPessoa(null, pessoa(el.dataset.id)),
  "apagar-pessoa": async (el) => { if (!confirmarDuplo(el, "Toque de novo para apagar")) return; if (await apagar("pessoas", el.dataset.id)) { fecharFolha(); avisar("Pessoa apagada."); await recarregar(); ir("acertos"); } },
  "rev-ok": async (el) => { if (await marcarRev([el.dataset.id], "conferido")) avisar("Conferido."); },
  "rev-verificar": async (el) => { if (await marcarRev([el.dataset.id], "verificar")) avisar("Marcado para verificar."); },
  "rev-dividir": (el) => formRacha(el.dataset.id),
  "rev-todos-ok": async (el) => { if (await marcarRev(el.dataset.ids.split(","), "conferido")) avisar("Conferidos."); },
  "nova-pessoa-racha": () => formPessoa(() => formRacha()),
  "novo-acerto": (el) => formAcerto(el.dataset.pessoa),
  "pagar-acerto": (el) => formPagamento(estado.d.acertos.find((a) => a.id === el.dataset.id)),
  "detalhe-acerto": (el) => detalheAcerto(estado.d.acertos.find((a) => a.id === el.dataset.id)),
  "apagar-pagamento": async (el) => {
    if (!confirmarDuplo(el, "Toque de novo para apagar este pagamento")) return;
    if (await apagar("acerto_pagamentos", el.dataset.id)) { await atualizar("acertos", el.dataset.acerto, { situacao: "aberto" }); fecharFolha(); avisar("Pagamento apagado."); await recarregar(); }
  },
  "perdoar-acerto": async (el) => { if (!confirmarDuplo(el, "Toque de novo para encerrar")) return; if (await atualizar("acertos", el.dataset.id, { situacao: "perdoado" })) { fecharFolha(); avisar("Acerto encerrado."); await recarregar(); } },
  "reabrir-acerto": async (el) => { if (await atualizar("acertos", el.dataset.id, { situacao: "aberto" })) { fecharFolha(); avisar("Acerto reaberto."); await recarregar(); } },
  "apagar-acerto": async (el) => { if (!confirmarDuplo(el, "Toque de novo para apagar")) return; if (await apagar("acertos", el.dataset.id)) { fecharFolha(); avisar("Acerto apagado."); await recarregar(); } },
  "novo-racha": () => formRacha(),
  "ver-racha": (el) => {
    const d = estado.d, r = d.rachas.find((x) => x.id === el.dataset.id);
    const cs = d.cotas.filter((c) => c.racha_id === r.id);
    const l = d.lancamentos.find((x) => x.id === r.lancamento_id);
    abrirFolha(r.ocasiao, `<p class="cc-small" style="margin-bottom:10px">${dataBR(r.data)} · ${dinheiro(r.valor_total_centavos)} · pago por ${r.pagador_pessoa_id ? esc(pessoa(r.pagador_pessoa_id)?.nome) : "você"} · divisão ${{ igual: "igual", percentual: "por percentual", valor: "por valor", uma_pessoa: "uma pessoa paga tudo" }[r.metodo]}</p>
      ${lista(cs.map((c) => linha({ titulo: c.pessoa_id ? esc(pessoa(c.pessoa_id)?.nome) : "Você", sub: c.percentual ? `${String(c.percentual).replace(".", ",")}%` : "", valor: dinheiro(c.cota_centavos) })))}
      ${l ? secao("Saída original no banco") + lista([linhaLancamento(l)]) : ""}
      <div class="cc-acoes"><button type="button" class="cc-perigo" data-acao="apagar-racha" data-id="${r.id}">Apagar racha e acertos gerados</button></div>`);
  },
  "apagar-racha": async (el) => { if (!confirmarDuplo(el, "Toque de novo para apagar")) return; if (await apagar("rachas", el.dataset.id)) { fecharFolha(); avisar("Racha apagado."); await recarregar(); } },
  "confirmar-assinatura": async (el) => {
    const s = sugerirAssinaturas(estado.d, hoje()).find((x) => x.chave === el.dataset.chave);
    if (!s) return;
    const ok = await inserir("compromissos", { tipo: "assinatura", nome: s.nome, valor_centavos: s.valor, periodicidade: "mensal", proxima_data: somaMeses(s.ultima, 1), conta_id: s.conta_id, origem: "sugerido", dominio: dominioServico(s.nome), categoria_id: estado.d.categorias.find((k) => k.nome === "Assinaturas" && k.tipo === "despesa")?.id || null });
    if (ok) { await decidir(s.chave, "confirmado"); avisar("Assinatura confirmada."); await recarregar(); }
  },
  "rejeitar-assinatura": async (el) => { if (await decidir(el.dataset.chave, "rejeitado")) { avisar("Certo, não vou sugerir de novo."); await recarregar(); } },
  "rejeitar": async (el) => { if (await decidir(el.dataset.chave, "rejeitado")) { avisar("Decisão guardada."); await recarregar(); } },
  "resolver-dup": async (el) => {
    if (!confirmarDuplo(el, "Toque de novo: o registro manual será excluído")) return;
    if (await apagar("lancamentos", el.dataset.remover)) { await decidir(el.dataset.chave, "confirmado"); avisar("Duplicidade resolvida."); await recarregar(); }
  },
  "confirmar-transf": async (el) => {
    const ok = (await atualizar("lancamentos", el.dataset.a, { natureza: "transferencia_propria", par_transferencia_id: el.dataset.b })) && (await atualizar("lancamentos", el.dataset.b, { natureza: "transferencia_propria", par_transferencia_id: el.dataset.a }));
    if (ok) { await decidir(el.dataset.chave, "confirmado"); avisar("Transferência confirmada: o patrimônio não muda."); await recarregar(); }
  },
  "exportar": (el) => {
    const d = estado.d, m = el.dataset.mes;
    baixarCSV(`carteira-central-${m}.csv`, [["data", "descricao", "valor", "conta", "categoria", "natureza", "situacao", "origem", "etiquetas", "observacoes"],
      ...d.lancamentos.filter((l) => l.data.startsWith(m)).map((l) => [l.data, l.descricao, valorCSV(l.valor_centavos), conta(l.conta_id)?.nome, categoria(l.categoria_id)?.nome || "", l.natureza, l.situacao, l.origem, (l.etiquetas || []).join(","), l.observacoes || ""])]);
  },
  "exportar-tudo": () => {
    const d = estado.d;
    baixarCSV("carteira-central-lancamentos.csv", [["data", "descricao", "valor", "conta", "categoria", "natureza", "situacao", "origem", "etiquetas", "observacoes"], ...d.lancamentos.map((l) => [l.data, l.descricao, valorCSV(l.valor_centavos), conta(l.conta_id)?.nome, categoria(l.categoria_id)?.nome || "", l.natureza, l.situacao, l.origem, (l.etiquetas || []).join(","), l.observacoes || ""])]);
    setTimeout(() => baixarCSV("carteira-central-compromissos.csv", [["tipo", "nome", "valor", "frequencia", "proxima_data", "situacao", "conta"], ...d.compromissos.map((c) => [c.tipo, c.nome, valorCSV(c.valor_centavos), c.periodicidade, c.proxima_data, c.situacao, conta(c.conta_id)?.nome || ""])]), 400);
    setTimeout(() => baixarCSV("carteira-central-acertos.csv", [["pessoa", "direcao", "descricao", "total", "restante", "situacao"], ...d.acertos.map((a) => [pessoa(a.pessoa_id)?.nome, a.direcao, a.descricao, valorCSV(a.valor_total_centavos), valorCSV(restante(a)), a.situacao])]), 800);
  },
  "buscar-dados": () => buscarDados(),
  "nova-conexao": () => formConexao(),
  "pausar-conexao": async (el) => { const x = estado.d.conexoes.find((y) => y.id === el.dataset.id); if (await atualizar("conexoes", x.id, { ativa: !x.ativa })) { avisar(x.ativa ? "Conexão pausada. Os dados recebidos foram mantidos." : "Conexão reativada."); await recarregar(); } },
  "editar-categoria": (el) => formCategoria(el.dataset.id ? categoria(el.dataset.id) : null),
  "sair": async () => { await sb.auth.signOut(); },
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "form-nome") return;
  e.preventDefault();
  const f = e.target;
  if (await salvarPrefs({ nome: f.nome.value.trim() || null, nome_cartao: f.nome_cartao.value.trim().toUpperCase() || null })) { avisar("Nome salvo."); recarregar(); }
});
// Preferências tocadas direto nos controles da tela de configurações
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset?.aviso) { await salvarPrefs({ avisos: { ...(estado.d.prefs.avisos || {}), [t.dataset.aviso]: t.checked } }); avisar("Preferência salva."); }
  else if (t.dataset?.avisoDias) { await salvarPrefs({ avisos: { ...(estado.d.prefs.avisos || {}), fatura_dias: Number(t.value) } }); avisar("Preferência salva."); }
  else if (t.dataset?.prefLocal) { gravarLocal(t.dataset.prefLocal, t.checked ? "1" : "0"); avisar("Preferência salva neste aparelho."); }
});
