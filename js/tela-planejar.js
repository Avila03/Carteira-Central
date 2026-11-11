import { carimbar } from "./marca.js";
import { estado, icone, dinheiro, dataBR, dataCurta, mesCurto, mesLongo, esc, hoje, titulo, secao, lista, linha, selo, segmento, campo, entradaValor, opcoes, erroForm, paraCentavos, abrirFolha, fecharFolha, avisar, confirmarDuplo, registrar, conta, categoria, logoCompromisso, logoBanco, dominioServico, pct } from "./base.js";
import { agenda, ocorrencias, somaDias, somaMeses, diasNoMes, faturasPrevistas, parcelasComSaldo, simularCompra, compromissoDaSimulacao, dividirIgual, ENTRADAS, resumoInicio, diffDias } from "./calculos.js";
import { inserir, inserirVarios, atualizar, apagar } from "./dados.js";
import { sb, pessoa as pessoaPor } from "./base.js";
import { recarregar, ir } from "./app.js";
import { compromissosPorMes } from "./tela-inicio.js";

export const TIPOS = { salario: "Salário", receita: "Receita extra", fixo: "Gasto fixo", assinatura: "Assinatura", futura: "Despesa futura" };
const PERIODOS = [["unica", "Uma vez"], ["semanal", "Semanal"], ["quinzenal", "Quinzenal"], ["mensal", "Mensal"], ["bimestral", "Bimestral"], ["trimestral", "Trimestral"], ["semestral", "Semestral"], ["anual", "Anual"]];
const POR_MES = { unica: 0, semanal: 52 / 12, quinzenal: 26 / 12, mensal: 1, bimestral: 1 / 2, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12 };
const nomeSituacao = { previsto: "Previsto", pago: "Pago", recebido: "Recebido", atrasado: "Atrasado", vencido: "Vencido", ignorado: "Ignorado" };

// Todos os eventos de um intervalo: compromissos, faturas e parcelas com pessoas
export function eventos(d, de, ate, h) {
  const ev = [];
  for (const o of agenda(d.compromissos, d.baixas, de, ate, h)) ev.push({ data: o.data, titulo: o.compromisso.nome, valor: o.valor, entrada: o.entrada, situacao: o.situacao, esquerda: logoCompromisso(o.compromisso), rota: `compromisso/${o.compromisso.id}`, cartao: conta(o.compromisso.conta_id)?.tipo === "cartao" });
  for (const c of d.contas.filter((x) => x.tipo === "cartao" && !x.arquivada)) {
    for (const f of faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 13)) if (f.vencimento >= de && f.vencimento <= ate && f.total > 0) ev.push({ data: f.vencimento, titulo: `Fatura ${c.nome}`, valor: f.total, entrada: false, situacao: "previsto", esquerda: logoBanco(c.banco), rota: `cartoes/${c.id}` });
    for (const x of d.faturas.filter((y) => y.conta_id === c.id && y.vencimento >= de && y.vencimento <= ate && y.vencimento < h)) ev.push({ data: x.vencimento, titulo: `Fatura ${c.nome}`, valor: x.total_centavos, entrada: false, situacao: "pago", esquerda: logoBanco(c.banco), rota: `cartoes/${c.id}` });
  }
  for (const a of d.acertos.filter((x) => x.situacao === "aberto")) {
    const nome = d.pessoas.find((p) => p.id === a.pessoa_id)?.nome || "Pessoa";
    for (const p of parcelasComSaldo(a, d.parcelas, d.pagamentos)) if (p.vencimento >= de && p.vencimento <= ate) ev.push({ data: p.vencimento, titulo: `${nome} · ${a.descricao} (${p.numero})`, valor: p.restante_centavos || p.valor_centavos, entrada: a.direcao === "me_deve", situacao: p.restante_centavos === 0 ? (a.direcao === "me_deve" ? "recebido" : "pago") : p.vencimento < h ? (a.direcao === "me_deve" ? "atrasado" : "vencido") : "previsto", esquerda: `<span class="cc-ic">${icone("users", 18)}</span>`, rota: `pessoa/${a.pessoa_id}` });
  }
  return ev.sort((a, b) => (a.data < b.data ? -1 : 1));
}
const linhaEvento = (e) => linha({ esquerda: e.esquerda, titulo: esc(e.titulo), sub: `${dataBR(e.data)}${e.cartao ? " · no cartão" : ""}${selo(nomeSituacao[e.situacao] || e.situacao, e.situacao)}`, valor: dinheiro(e.entrada ? e.valor : -e.valor, { sinal: e.entrada }), classeValor: e.entrada ? "cc-pos" : "", acao: "ir", attrs: `data-rota="${e.rota}"` });

// ---------- Planejar ----------
export function telaPlanejar(q) {
  const aba = q.aba || "calendario";
  const corpo = { calendario: abaCalendario, compromissos: abaCompromissos, objetivos: abaObjetivos, simular: abaSimular }[aba]?.(q) || "";
  return `${titulo("Planejamento", "Planejar", "mais")}
  ${segmento("aba-planejar", [["calendario", "Calendário"], ["compromissos", "Compromissos"], ["objetivos", "Objetivos"], ["simular", "Simular"]], aba)}
  ${corpo}`;
}

function abaCalendario(q) {
  const d = estado.d, h = hoje();
  const mes = /^\d{4}-\d{2}$/.test(q.mes || "") ? q.mes : h.slice(0, 7);
  const [a, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`, fim = `${mes}-${String(diasNoMes(a, m)).padStart(2, "0")}`;
  const ev = eventos(d, inicio, fim, h);
  const diaSel = q.dia && q.dia.startsWith(mes) ? q.dia : (h.startsWith(mes) ? h : inicio);
  const primeiroDow = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
  const cel = [];
  for (let i = 0; i < primeiroDow; i++) cel.push(`<span></span>`);
  for (let dia = 1; dia <= diasNoMes(a, m); dia++) {
    const iso = `${mes}-${String(dia).padStart(2, "0")}`;
    const doDia = ev.filter((e) => e.data === iso);
    cel.push(`<button type="button" class="cc-dia ${iso === h ? "hoje" : ""}" aria-pressed="${iso === diaSel}" data-acao="ir" data-rota="planejar?aba=calendario&mes=${mes}&dia=${iso}" aria-label="${dataBR(iso)}${doDia.length ? `, ${doDia.length} evento(s)` : ""}">${dia}<span class="pontos">${doDia.slice(0, 3).map((e) => `<i class="${e.entrada ? "entra" : ""}"></i>`).join("")}</span></button>`);
  }
  // Saldo projetado no dia escolhido: saldo atual + o que entra − o que sai até lá (só previstos)
  const r = resumoInicio(d, h);
  let projetado = r.saldo;
  if (diaSel >= h) for (const e of eventos(d, h, diaSel, h)) if (e.situacao === "previsto" || e.situacao === "vencido" || e.situacao === "atrasado") { if (e.cartao) continue; projetado += e.entrada ? e.valor : -e.valor; }
  const doDia = ev.filter((e) => e.data === diaSel);
  const entra = doDia.filter((e) => e.entrada).reduce((s, e) => s + e.valor, 0), sai = doDia.filter((e) => !e.entrada && !e.cartao).reduce((s, e) => s + e.valor, 0);
  const mesAnt = somaMeses(inicio, -1).slice(0, 7), mesProx = somaMeses(inicio, 1).slice(0, 7);
  const doze = compromissosPorMes(d, h, 12);
  const mx = Math.max(...doze.map((x) => x.valor), 1);
  const topo = [...doze].sort((x, y) => y.valor - x.valor).slice(0, 2).map((x) => x.mes);
  return `<div class="cc-mes-nav"><button type="button" class="cc-icon-button" data-acao="ir" data-rota="planejar?aba=calendario&mes=${mesAnt}" aria-label="Mês anterior">${icone("chevron-left")}</button><strong>${mesLongo(mes)}</strong><button type="button" class="cc-icon-button" data-acao="ir" data-rota="planejar?aba=calendario&mes=${mesProx}" aria-label="Próximo mês">${icone("chevron-right")}</button></div>
  <div class="cc-calendario">${["D", "S", "T", "Q", "Q", "S", "S"].map((x) => `<span aria-hidden="true">${x}</span>`).join("")}${cel.join("")}</div>
  <div class="cc-grade2">
    <div class="cc-stat"><span>Entradas em ${dataCurta(diaSel)}</span><strong class="cc-num cc-pos">${dinheiro(entra)}</strong></div>
    <div class="cc-stat"><span>Saídas em ${dataCurta(diaSel)}</span><strong class="cc-num">${dinheiro(sai)}</strong></div>
  </div>
  ${diaSel >= h ? `<div class="cc-stat cc-available" style="margin-bottom:12px"><span>Saldo projetado ao fim de ${dataBR(diaSel)}</span><strong class="cc-num">${dinheiro(projetado)}</strong><small class="cc-small">Estimativa · inclui salário e receitas previstas; compras no cartão entram pela fatura</small></div>` : ""}
  ${secao(diaSel === h ? "Hoje" : dataBR(diaSel))}${lista(doDia.map(linhaEvento), "Nada previsto neste dia.")}
  ${secao(`Todo ${mesLongo(mes).split(" ")[0]}`, `<span>${ev.length} evento(s)</span>`)}${lista(ev.map(linhaEvento), "Nada previsto neste mês.")}
  ${secao("Próximos 12 meses", "<span>a pagar previsto</span>")}
  <div class="cc-list" style="padding:10px 14px">${doze.map((x) => `<a class="cc-hbar" href="#/planejar?aba=calendario&mes=${x.mes}" style="text-decoration:none;color:inherit"><span style="text-transform:capitalize">${mesLongo(x.mes).replace(" de ", " ")}</span><div><i style="width:${(x.valor / mx) * 100}%;${topo.includes(x.mes) ? "background:var(--cc-gold)" : ""}"></i></div><strong class="cc-num">${dinheiro(x.valor)}</strong></a>`).join("")}</div>
  <p class="cc-small" style="margin-top:8px">Em dourado, os dois meses de maior comprometimento.</p>
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="novo-compromisso" data-tipo="futura">${icone("plus", 18)}Programar despesa</button></div>`;
}

function abaCompromissos(q) {
  const d = estado.d, h = hoje();
  const filtro = q.tipo || "todos";
  const cs = d.compromissos.filter((c) => (filtro === "todos" || c.tipo === filtro) && (q.cancelados ? true : c.situacao !== "cancelado"));
  const prox = (c) => agenda([c], d.baixas, somaDias(h, -45), somaDias(h, 400), h).find((o) => o.situacao !== "pago" && o.situacao !== "recebido" && o.situacao !== "ignorado");
  const grupo = (tipo) => {
    const itens = cs.filter((c) => c.tipo === tipo);
    if (!itens.length) return "";
    return secao(TIPOS[tipo] + (tipo === "receita" ? "s" : tipo === "salario" ? "" : "s")) + lista(itens.map((c) => {
      const o = prox(c);
      return linha({ esquerda: logoCompromisso(c), titulo: esc(c.nome) + (c.situacao !== "ativo" ? selo(c.situacao === "pausado" ? "Pausado" : "Cancelado") : ""), sub: `${PERIODOS.find((p) => p[0] === c.periodicidade)?.[1]}${o ? ` · próxima ${dataBR(o.data)}${selo(nomeSituacao[o.situacao], o.situacao)}` : ""}${conta(c.conta_id) ? ` · ${esc(conta(c.conta_id).nome)}` : ""}`, valor: dinheiro(ENTRADAS.has(tipo) ? c.valor_centavos : -c.valor_centavos), valorSub: c.valor_variavel ? "estimado" : "", classeValor: ENTRADAS.has(tipo) ? "cc-pos" : "", acao: "ir", attrs: `data-rota="compromisso/${c.id}"` });
    }));
  };
  const ativosDesp = d.compromissos.filter((c) => c.situacao === "ativo" && !ENTRADAS.has(c.tipo) && c.periodicidade !== "unica");
  const mensal = ativosDesp.reduce((s, c) => s + c.valor_centavos * (POR_MES[c.periodicidade] || 0), 0);
  return `<div class="cc-chips">${[["todos", "Todos"], ["salario", "Salário"], ["receita", "Receitas"], ["fixo", "Gastos fixos"], ["assinatura", "Assinaturas"], ["futura", "Despesas futuras"]].map(([v, t]) => `<button type="button" class="cc-chip" aria-pressed="${filtro === v}" data-acao="ir" data-rota="planejar?aba=compromissos&tipo=${v}">${t}</button>`).join("")}</div>
  <div class="cc-grade2"><div class="cc-stat"><span>Recorrentes por mês</span><strong class="cc-num">${dinheiro(Math.round(mensal))}</strong><small class="cc-small">custo mensal equivalente</small></div>
  <div class="cc-stat"><span>Por ano</span><strong class="cc-num">${dinheiro(Math.round(mensal * 12))}</strong><small class="cc-small">gastos fixos e assinaturas</small></div></div>
  ${!d.compromissos.some((c) => c.tipo === "salario") ? `<button type="button" class="cc-aviso" data-acao="novo-compromisso" data-tipo="salario">${icone("briefcase", 18)}<span>Cadastre seu salário: com a data e o valor, o Início calcula quanto você pode gastar até ele chegar.</span></button>` : ""}
  ${["salario", "receita", "fixo", "assinatura", "futura"].map(grupo).join("") || lista([], "Nenhum compromisso cadastrado.")}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="novo-compromisso" data-tipo="${filtro === "todos" ? "fixo" : filtro}">${icone("plus", 18)}Novo compromisso</button>
  <button type="button" class="cc-text-button" data-acao="ir" data-rota="planejar?aba=compromissos&tipo=${filtro}${q.cancelados ? "" : "&cancelados=1"}">${q.cancelados ? "Esconder cancelados" : "Mostrar cancelados"}</button></div>`;
}

function abaObjetivos() {
  const d = estado.d, h = hoje();
  const grupo = (tipo, nome) => {
    const os = d.objetivos.filter((o) => o.tipo === tipo && o.situacao !== "arquivado");
    return secao(nome) + lista(os.map((o) => {
      const falta = Math.max(0, o.valor_alvo_centavos - o.valor_guardado_centavos);
      const meses = o.prazo ? Math.max(1, Math.ceil(diffDias(h, o.prazo) / 30.44)) : null;
      const porMes = meses ? Math.ceil(falta / meses) : null;
      const p = Math.min(100, (o.valor_guardado_centavos / o.valor_alvo_centavos) * 100);
      return `<button type="button" class="cc-row" data-acao="editar-objetivo" data-id="${o.id}" style="flex-wrap:wrap">
        ${tipo === "desejo" ? `<span class="cc-ic">${icone("gift", 18)}</span>` : `<span class="cc-ic">${icone(tipo === "reserva" ? "piggy-bank" : "target", 18)}</span>`}
        <div class="cc-row-main"><strong>${esc(o.nome)}${o.prioridade ? selo(["", "Alta", "Média", "Baixa"][o.prioridade]) : ""}${o.situacao === "concluido" ? selo("Concluído", "ok") : ""}</strong>
        <span>${dinheiro(o.valor_guardado_centavos)} de ${dinheiro(o.valor_alvo_centavos)} · falta ${dinheiro(falta)}${porMes ? ` · guardar ${dinheiro(porMes)}/mês até ${dataBR(o.prazo)}` : ""}${o.guardado_em === "conta" && conta(o.conta_id) ? ` · em ${esc(conta(o.conta_id).nome)}` : " · reserva organizacional"}</span>
        <div class="cc-progresso"><i style="width:${p}%"></i></div></div></button>`;
    }), tipo === "desejo" ? "Nenhum desejo. Anote o que quer comprar, com preço e link." : "Nada cadastrado.");
  };
  const r = resumoInicio(d, h);
  return `<div class="cc-stat" style="margin-bottom:12px"><span>Reservado e descontado do disponível</span><strong class="cc-num">${dinheiro(r.reservas)}</strong><small class="cc-small">Cada reserva conta uma única vez: organizacional, ou guardada numa conta que está no cálculo.</small></div>
  ${grupo("meta", "Metas")}${grupo("reserva", "Reservas")}${grupo("desejo", "Desejos")}
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="editar-objetivo">${icone("plus", 18)}Novo objetivo</button></div>`;
}

function abaSimular(q) {
  const d = estado.d;
  const cartoes = d.contas.filter((c) => !c.arquivada);
  const sims = d.simulacoes;
  return `<form id="form-simular" novalidate>
    ${campo("O que você quer comprar?", `<input name="descricao" maxlength="80" placeholder="Ex.: notebook" value="${esc(q.descricao || "")}">`)}
    <div class="cc-grade-campos">${campo("Valor total (R$)", entradaValor("valor", q.valor ? Number(q.valor) : undefined))}${campo("Parcelas", `<select name="parcelas">${opcoes(Array.from({ length: 24 }, (_, i) => [i + 1, i ? `${i + 1}×` : "À vista"]), q.parcelas || 1)}</select>`)}</div>
    <div class="cc-grade-campos">${campo("Data da compra", `<input type="date" name="data" value="${q.data || hoje()}">`)}${campo("Forma de pagamento", `<select name="conta">${opcoes(cartoes.map((c) => [c.id, c.nome]), q.cartao)}</select>`)}</div>
    <div class="cc-acoes"><button class="cc-primary" type="submit">${icone("calculator", 18)}Simular</button></div>
  </form>
  <div id="resultado-simulacao"></div>
  ${secao("Simulações salvas")}
  ${lista(sims.map((s) => linha({ esquerda: `<span class="cc-ic">${icone("calculator", 18)}</span>`, titulo: esc(s.descricao) + (s.incluida ? selo("No planejamento", "ok") : selo("Simulação", "simulacao")), sub: `${s.parcelas}× · ${dataBR(s.data)} · ${esc(conta(s.conta_id)?.nome || "")}`, valor: dinheiro(s.valor_total_centavos), acao: "ver-simulacao", attrs: `data-id="${s.id}"` })), "Nenhuma simulação salva.")}`;
}

// ---------- detalhe de um compromisso ----------
export function telaCompromisso(id) {
  const d = estado.d, h = hoje();
  const c = d.compromissos.find((x) => x.id === id);
  if (!c) return `${titulo("Compromisso", "Não encontrado", "planejar?aba=compromissos")}`;
  const ocs = agenda([c], d.baixas, somaMeses(h, -4), somaMeses(h, 6), h);
  const entrada = ENTRADAS.has(c.tipo);
  const mensal = c.valor_centavos * (POR_MES[c.periodicidade] || 0);
  return `${titulo(TIPOS[c.tipo], c.nome, "planejar?aba=compromissos")}
  <div class="cc-card"><div class="cc-card-top"><span>${PERIODOS.find((p) => p[0] === c.periodicidade)?.[1]}${c.valor_variavel ? " · valor variável" : ""}</span>${logoCompromisso(c)}</div>
    <strong class="cc-num">${dinheiro(c.valor_centavos)}</strong><span class="cc-small">${c.valor_variavel ? "Previsão de valor" : "Valor"}${c.periodicidade !== "unica" ? ` · ${dinheiro(Math.round(mensal))} por mês · ${dinheiro(Math.round(mensal * 12))} por ano` : ""}</span>
    <div class="cc-card-foot"><span>${conta(c.conta_id) ? `${entrada ? "Recebe em" : "Paga com"} ${esc(conta(c.conta_id).nome)}` : "Conta não definida"}</span><span>${c.situacao === "ativo" ? "Ativo" : c.situacao === "pausado" ? "Pausado" : `Cancelado em ${dataBR(c.cancelado_em)}`}</span></div></div>
  ${rateiosDe(c).length ? secao("Dividido com", `<span>sua parte ${dinheiro(suaParte(c))}</span>`) + lista(rateiosDe(c).map((r) => linha({ titulo: esc(pessoaPor(r.pessoa_id)?.nome || "Pessoa"), sub: "te paga a cada cobrança", valor: dinheiro(r.cota_centavos), classeValor: "cc-pos", acao: "ir", attrs: `data-rota="pessoa/${r.pessoa_id}"` }))) + `<p class="cc-small" style="margin:6px 0 4px">Cobranças desde ${dataBR(c.rateio_desde)} viram valores a receber em Acertos.</p>` : ""}
  ${secao("Ocorrências", "<span>toque para marcar</span>")}
  ${lista(ocs.map((o) => linha({ titulo: dataBR(o.data), sub: selo(nomeSituacao[o.situacao], o.situacao).replace('class="cc-selo', 'style="margin-left:0" class="cc-selo') + (o.baixa?.lancamento_id ? " · ligado a um lançamento" : ""), valor: dinheiro(o.valor), acao: "baixar", attrs: `data-id="${c.id}" data-ref="${o.data}"` })), "Sem ocorrências neste período.")}
  ${c.observacoes ? `<p class="cc-info"><strong>Observações</strong>${esc(c.observacoes)}</p>` : ""}
  <p class="cc-info"><strong>Cancelar aqui não cancela no fornecedor</strong>Marcar como cancelado tira das previsões e mantém o histórico. O cancelamento junto à empresa continua sendo com você.</p>
  <div class="cc-acoes"><button type="button" class="cc-primary" data-acao="editar-compromisso" data-id="${c.id}">${icone("pencil", 18)}Editar</button>
  ${c.situacao === "cancelado" ? `<button type="button" class="cc-secundario" data-acao="reativar-compromisso" data-id="${c.id}">Reativar</button>` : `<button type="button" class="cc-perigo" data-acao="cancelar-compromisso" data-id="${c.id}">Marcar como cancelado</button>`}</div>`;
}

// ---------- rateio de assinaturas e gastos fixos ----------
export const rateiosDe = (c) => estado.d.rateios.filter((r) => r.compromisso_id === c.id && r.cota_centavos > 0);
export const suaParte = (c) => Math.max(0, c.valor_centavos - rateiosDe(c).reduce((s, r) => s + r.cota_centavos, 0));
// Cada cobrança que chega (até hoje) vira "me deve" para cada pessoa da divisão, vencendo na data da cobrança.
export async function gerarCobrancasRateio() {
  const d = estado.d, h = hoje();
  let novas = 0;
  for (const c of d.compromissos.filter((x) => x.rateio_desde && x.situacao === "ativo")) {
    const rs = rateiosDe(c);
    if (!rs.length) continue;
    for (const ref of ocorrencias(c, c.rateio_desde, h)) {
      if (d.baixas.some((b) => b.compromisso_id === c.id && b.referencia === ref && b.situacao === "ignorado")) continue;
      for (const r of rs) {
        if (d.acertos.some((a) => a.compromisso_id === c.id && a.referencia === ref && a.pessoa_id === r.pessoa_id)) continue;
        const { data: a, error } = await sb.from("acertos").insert({ pessoa_id: r.pessoa_id, direcao: "me_deve", descricao: `${c.nome} · ${mesLongo(ref.slice(0, 7))}`, valor_total_centavos: r.cota_centavos, compromisso_id: c.id, referencia: ref }).select().single();
        if (error) continue; // já existia (outro aparelho criou)
        await sb.from("acerto_parcelas").insert({ acerto_id: a.id, numero: 1, vencimento: ref, valor_centavos: r.cota_centavos });
        novas++;
      }
    }
  }
  return novas;
}

// ---------- formulários ----------
function formCompromisso(c, padrao = {}) {
  const d = estado.d;
  const tipo = c?.tipo || padrao.tipo || "fixo";
  const contas = d.contas.filter((x) => !x.arquivada && (ENTRADAS.has(tipo) ? x.tipo !== "cartao" : true));
  const cats = d.categorias.filter((k) => k.tipo === (ENTRADAS.has(tipo) ? "receita" : "despesa"));
  const f = abrirFolha(c ? "Editar compromisso" : `Novo: ${TIPOS[tipo].toLowerCase()}`, `<form id="form-compromisso" novalidate>
    ${campo("Tipo", `<select name="tipo">${opcoes(Object.entries(TIPOS), tipo)}</select>`)}
    ${campo(tipo === "salario" ? "Descrição" : "Nome", `<input name="nome" maxlength="80" value="${esc(c?.nome || (tipo === "salario" ? "Salário" : ""))}" placeholder="${tipo === "assinatura" ? "Ex.: Netflix" : tipo === "fixo" ? "Ex.: Conta de luz" : ""}">`)}
    <div class="cc-grade-campos">${campo(tipo === "salario" ? "Valor líquido (R$)" : "Valor (R$)", entradaValor("valor", c?.valor_centavos))}${campo("Frequência", `<select name="periodicidade">${opcoes(PERIODOS, c?.periodicidade || (tipo === "futura" ? "unica" : "mensal"))}</select>`)}</div>
    <label class="cc-interruptor"><span>O valor varia (é uma previsão)</span><input type="checkbox" name="variavel" ${c?.valor_variavel ? "checked" : ""}></label>
    <div class="cc-grade-campos">${campo(tipo === "salario" ? "Próximo recebimento" : "Próxima data", `<input type="date" name="data" value="${c?.proxima_data || padrao.data || hoje()}">`)}${campo("Termina em", `<input type="date" name="fim" value="${c?.fim_em || ""}">`, "opcional")}</div>
    ${campo(ENTRADAS.has(tipo) ? "Conta de recebimento" : "Forma de pagamento", `<select name="conta"><option value="">Não definida</option>${opcoes(contas.map((x) => [x.id, x.nome]), c?.conta_id || padrao.conta)}</select>`, ENTRADAS.has(tipo) ? "" : "No cartão, o gasto entra na fatura prevista; na conta, entra no disponível.")}
    ${campo("Categoria", `<select name="categoria"><option value="">Sem categoria</option>${opcoes(cats.map((k) => [k.id, k.nome]), c?.categoria_id)}</select>`)}
    ${tipo === "assinatura" ? campo("Site do serviço", `<input name="dominio" autocapitalize="none" placeholder="netflix.com" value="${esc(c?.dominio || "")}">`, "Usado só para mostrar o logotipo oficial.") + campo("Lembrar antes da cobrança", `<select name="lembrete">${opcoes([["", "Não lembrar"], [1, "1 dia antes"], [3, "3 dias antes"], [7, "7 dias antes"]], c?.lembrete_dias ?? "")}</select>`) : ""}
    ${tipo === "assinatura" || tipo === "fixo" ? secaoRateio(c) : ""}
    ${campo("Observações", `<textarea name="observacoes" maxlength="500">${esc(c?.observacoes || "")}</textarea>`, tipo === "assinatura" ? "Anote fim de desconto ou de teste grátis." : "")}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button>${c ? `<button type="button" class="cc-perigo" data-acao="apagar-compromisso" data-id="${c.id}">Apagar de vez (sem histórico)</button>` : ""}</div>
  </form>`);
  const form = f.querySelector("form");
  const rat = ligarRateio(f, form, c);
  form.tipo.addEventListener("change", () => { fecharFolha(); formCompromisso(c ? { ...c, tipo: form.tipo.value } : null, { ...padrao, tipo: form.tipo.value }); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = paraCentavos(form.valor.value);
    const nome = form.nome.value.trim();
    if (!nome) return erroForm(form, "Informe o nome.");
    if (v === null || v < 0) return erroForm(form, "Informe um valor, como 49,90.");
    if (!form.data.value) return erroForm(form, "Informe a data.");
    const reg = { tipo: form.tipo.value, nome, valor_centavos: v, valor_variavel: form.variavel.checked, periodicidade: form.periodicidade.value, proxima_data: form.data.value, fim_em: form.fim.value || null,
      conta_id: form.conta.value || null, categoria_id: form.categoria.value || null, observacoes: form.observacoes.value.trim() || null,
      dominio: form.dominio ? (form.dominio.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || dominioServico(nome)) : (c?.dominio || dominioServico(nome)),
      lembrete_dias: form.lembrete && form.lembrete.value ? Number(form.lembrete.value) : null };
    const cotas = rat ? rat.cotas(v) : null;
    if (rat && cotas === false) return erroForm(form, "As partes das pessoas passam do valor total.");
    if (rat) { reg.rateio_desde = cotas.length ? (form.desde.value || hoje()) : null; reg.rateio_metodo = cotas.length ? rat.metodo() : null; }
    const ok = c ? await atualizar("compromissos", c.id, reg) : await inserir("compromissos", reg);
    if (!ok) return;
    if (rat) {
      const id = c?.id || ok.id;
      const { error } = await sb.from("compromisso_rateios").delete().eq("compromisso_id", id);
      if (error) return avisar("Não consegui salvar a divisão.");
      if (cotas.length && !(await inserirVarios("compromisso_rateios", cotas.map((x) => ({ compromisso_id: id, pessoa_id: x.pessoa, cota_centavos: x.cota }))))) return;
    }
    fecharFolha(); avisar(cotas?.length ? "Salvo. Cada cobrança vira um valor a receber de cada pessoa." : "Compromisso salvo."); await recarregar();
  });
}

function secaoRateio(c) {
  const d = estado.d;
  const atuais = c ? d.rateios.filter((r) => r.compromisso_id === c.id) : [];
  if (!d.pessoas.length) return `${secao("Dividir com pessoas")}<p class="cc-small" style="margin-bottom:12px">Cadastre as pessoas em Mais › Acertos para dividir este valor.</p>`;
  const metodo = c?.rateio_metodo || "igual";
  return `${secao("Dividir com pessoas")}
    <p class="cc-small" style="margin-bottom:8px">Você paga o valor inteiro; a cada cobrança, cada pessoa marcada fica te devendo a parte dela.</p>
    ${segmento("rateio-metodo", [["igual", "Igual, comigo"], ["valor", "Por valor"]], metodo)}
    <div id="rateio-pessoas">${d.pessoas.map((p) => { const r = atuais.find((x) => x.pessoa_id === p.id); return `<div class="cc-participante"><label><input type="checkbox" data-rpess="${p.id}" ${r ? "checked" : ""}>${esc(p.nome)}</label><input type="text" inputmode="decimal" data-rcota="${p.id}" aria-label="Parte de ${esc(p.nome)}" value="${r ? (r.cota_centavos / 100).toFixed(2).replace(".", ",") : ""}" placeholder="—"></div>`; }).join("")}</div>
    <p class="cc-small" id="rateio-resumo" style="margin:8px 0 10px"></p>
    ${campo("Cobrar a partir de", `<input type="date" name="desde" value="${c?.rateio_desde || hoje().slice(0, 8) + "01"}">`, "Cobranças desde esta data viram valores a receber.")}`;
}
function ligarRateio(f, form, c) {
  if (!f.querySelector("#rateio-pessoas")) return null;
  let metodo = c?.rateio_metodo || "igual";
  const marcados = () => [...f.querySelectorAll("[data-rpess]")].filter((x) => x.checked).map((x) => x.dataset.rpess);
  const calc = (total) => {
    const ids = marcados();
    if (!ids.length) return [];
    if (metodo === "igual") { const vs = dividirIgual(total, ids.length + 1); return ids.map((id, i) => ({ pessoa: id, cota: vs[i + 1] })); }
    const cs = ids.map((id) => ({ pessoa: id, cota: paraCentavos(f.querySelector(`[data-rcota="${id}"]`).value) || 0 }));
    return cs.reduce((s, x) => s + x.cota, 0) > total ? false : cs;
  };
  const atualizar = () => {
    const total = paraCentavos(form.valor.value) || 0, cs = calc(total);
    f.querySelectorAll("[data-rcota]").forEach((i) => { const on = marcados().includes(i.dataset.rcota); i.readOnly = metodo === "igual" || !on; if (!on) i.value = ""; });
    if (metodo === "igual" && cs) cs.forEach((x) => { f.querySelector(`[data-rcota="${x.pessoa}"]`).value = (x.cota / 100).toFixed(2).replace(".", ","); });
    f.querySelector("#rateio-resumo").textContent = cs === false ? "As partes passam do valor total." : cs.length ? `Sua parte: ${dinheiro(total - cs.reduce((s, x) => s + x.cota, 0))} · a receber por cobrança: ${dinheiro(cs.reduce((s, x) => s + x.cota, 0))}` : "Ninguém marcado: você paga tudo.";
  };
  f.querySelectorAll('[data-nome="rateio-metodo"]').forEach((b) => b.addEventListener("click", () => { metodo = b.dataset.valor; f.querySelectorAll('[data-nome="rateio-metodo"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b))); atualizar(); }));
  form.addEventListener("input", atualizar); form.addEventListener("change", atualizar);
  atualizar();
  return { cotas: (total) => calc(total), metodo: () => metodo };
}

function formObjetivo(o) {
  const d = estado.d;
  const f = abrirFolha(o ? "Editar objetivo" : "Novo objetivo", `<form id="form-objetivo" novalidate>
    ${campo("Tipo", `<select name="tipo">${opcoes([["meta", "Meta com prazo"], ["reserva", "Reserva"], ["desejo", "Desejo"]], o?.tipo || "meta")}</select>`)}
    ${campo("Nome", `<input name="nome" maxlength="80" value="${esc(o?.nome || "")}" placeholder="Ex.: IPVA, emergência, viagem">`)}
    <div class="cc-grade-campos">${campo("Valor desejado (R$)", entradaValor("alvo", o?.valor_alvo_centavos))}${campo("Já guardado (R$)", entradaValor("guardado", o?.valor_guardado_centavos ?? 0))}</div>
    <div class="cc-grade-campos">${campo("Prazo", `<input type="date" name="prazo" value="${o?.prazo || ""}">`, "opcional")}${campo("Contribuição por mês (R$)", entradaValor("contribuicao", o?.contribuicao_mensal_centavos ?? undefined), "opcional")}</div>
    ${campo("Onde está o dinheiro guardado", `<select name="onde"><option value="organizacional">Separado só no app (reserva organizacional)</option>${opcoes(d.contas.filter((c) => c.tipo !== "cartao" && !c.arquivada).map((c) => [c.id, `Numa conta: ${c.nome}`]), o?.guardado_em === "conta" ? o.conta_id : "")}</select>`, "O valor guardado é descontado do disponível uma única vez.")}
    ${campo("Link", `<input name="link" type="url" inputmode="url" autocapitalize="none" placeholder="https://" value="${esc(o?.link || "")}">`, "para desejos")}
    ${campo("Prioridade", `<select name="prioridade">${opcoes([["", "Sem prioridade"], [1, "Alta"], [2, "Média"], [3, "Baixa"]], o?.prioridade ?? "")}</select>`)}
    ${o ? `<label class="cc-interruptor"><span>Concluído</span><input type="checkbox" name="concluido" ${o.situacao === "concluido" ? "checked" : ""}></label>` : ""}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button>${o?.link ? `<a class="cc-secundario" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">${icone("external-link", 18)}Abrir link</a>` : ""}${o ? `<button type="button" class="cc-perigo" data-acao="arquivar-objetivo" data-id="${o.id}">Arquivar</button>` : ""}</div>
  </form>`);
  const form = f.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alvo = paraCentavos(form.alvo.value), guardado = paraCentavos(form.guardado.value || "0"), contrib = form.contribuicao.value ? paraCentavos(form.contribuicao.value) : null;
    if (!form.nome.value.trim()) return erroForm(form, "Informe o nome.");
    if (!alvo || alvo <= 0) return erroForm(form, "Informe o valor desejado.");
    if (guardado === null || guardado < 0) return erroForm(form, "Valor guardado inválido.");
    const link = form.link.value.trim();
    if (link && !/^https?:\/\//i.test(link)) return erroForm(form, "O link precisa começar com https://");
    const reg = { tipo: form.tipo.value, nome: form.nome.value.trim(), valor_alvo_centavos: alvo, valor_guardado_centavos: guardado, prazo: form.prazo.value || null, contribuicao_mensal_centavos: contrib,
      guardado_em: form.onde.value === "organizacional" ? "organizacional" : "conta", conta_id: form.onde.value === "organizacional" ? null : form.onde.value, link: link || null, prioridade: form.prioridade.value ? Number(form.prioridade.value) : null,
      situacao: form.concluido?.checked ? "concluido" : "ativo" };
    const ok = o ? await atualizar("objetivos", o.id, reg) : await inserir("objetivos", reg);
    if (!ok) return;
    fecharFolha(); avisar("Objetivo salvo."); await recarregar();
  });
}

function formBaixa(c, ref) {
  const d = estado.d, h = hoje();
  const b = d.baixas.find((x) => x.compromisso_id === c.id && x.referencia === ref);
  const entrada = ENTRADAS.has(c.tipo);
  // Sugestões de lançamentos que podem ser esta ocorrência: mesmo sentido, perto da data e do valor
  const sugestoes = d.lancamentos.filter((l) => (entrada ? l.valor_centavos > 0 : l.valor_centavos < 0) && l.situacao !== "futuro" && Math.abs(diffDias(ref, l.data)) <= 10 && Math.abs(Math.abs(l.valor_centavos) - c.valor_centavos) <= Math.max(500, c.valor_centavos * 0.25))
    .sort((a, b2) => Math.abs(Math.abs(a.valor_centavos) - c.valor_centavos) - Math.abs(Math.abs(b2.valor_centavos) - c.valor_centavos)).slice(0, 6);
  const f = abrirFolha(`${c.nome} · ${dataBR(ref)}`, `<form id="form-baixa" novalidate>
    <p class="cc-small" style="margin-bottom:12px">Previsto: ${dinheiro(c.valor_centavos)}${b ? ` · registrado como ${b.situacao}` : ""}</p>
    ${campo("O que aconteceu", `<select name="situacao">${opcoes([[entrada ? "recebido" : "pago", entrada ? "Recebido" : "Pago"], ["ignorado", "Não vai acontecer (ignorar)"], ["", "Ainda previsto (desfazer)"]], b?.situacao ?? (entrada ? "recebido" : "pago"))}</select>`)}
    <div class="cc-grade-campos">${campo("Valor real (R$)", entradaValor("valor", b?.valor_centavos ?? c.valor_centavos))}${campo("Data", `<input type="date" name="data" value="${b?.data_efetiva || (ref <= h ? ref : h)}">`)}</div>
    ${campo("Ligar a um lançamento do banco", `<select name="lancamento"><option value="">Nenhum</option>${opcoes(sugestoes.map((l) => [l.id, `${dataBR(l.data)} · ${l.descricao.slice(0, 28)} · ${dinheiro(l.valor_centavos)}`]), b?.lancamento_id)}</select>`, sugestoes.length ? "Ligar evita contar a mesma coisa duas vezes." : "Nenhum lançamento parecido encontrado perto desta data.")}
    <div class="cc-acoes"><button class="cc-primary" type="submit">Salvar</button></div>
  </form>`);
  const form = f.querySelector("form");
  form.lancamento.addEventListener("change", () => { const l = d.lancamentos.find((x) => x.id === form.lancamento.value); if (l) { form.valor.value = (Math.abs(l.valor_centavos) / 100).toFixed(2).replace(".", ","); form.data.value = l.data; } });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.situacao.value) {
      if (b && !(await apagar("compromisso_baixas", b.id))) return;
      fecharFolha(); avisar("Ocorrência voltou para prevista."); return recarregar();
    }
    const v = paraCentavos(form.valor.value);
    if (v === null || v < 0) return erroForm(form, "Valor inválido.");
    const reg = { compromisso_id: c.id, referencia: ref, situacao: form.situacao.value, valor_centavos: v, data_efetiva: form.data.value || null, lancamento_id: form.lancamento.value || null };
    const ok = b ? await atualizar("compromisso_baixas", b.id, reg) : await inserir("compromisso_baixas", reg);
    if (!ok) return;
    if (reg.lancamento_id) await atualizar("lancamentos", reg.lancamento_id, { compromisso_id: c.id });
    fecharFolha(); if (reg.situacao === "pago" || reg.situacao === "recebido") carimbar(reg.situacao === "pago" ? "Pago" : "Recebido"); else avisar("Ocorrência atualizada."); await recarregar();
  });
}

registrar({
  "novo-compromisso": (el) => formCompromisso(null, { tipo: el.dataset.tipo, conta: el.dataset.conta }),
  "editar-compromisso": (el) => formCompromisso(estado.d.compromissos.find((c) => c.id === el.dataset.id)),
  "baixar": (el) => formBaixa(estado.d.compromissos.find((c) => c.id === el.dataset.id), el.dataset.ref),
  "cancelar-compromisso": async (el) => {
    if (!confirmarDuplo(el, "Toque de novo para marcar como cancelado")) return;
    if (await atualizar("compromissos", el.dataset.id, { situacao: "cancelado", cancelado_em: hoje() })) { avisar("Marcado como cancelado. O histórico foi mantido."); await recarregar(); }
  },
  "reativar-compromisso": async (el) => { if (await atualizar("compromissos", el.dataset.id, { situacao: "ativo", cancelado_em: null })) { avisar("Reativado."); await recarregar(); } },
  "apagar-compromisso": async (el) => {
    if (!confirmarDuplo(el, "Toque de novo para apagar de vez")) return;
    if (await apagar("compromissos", el.dataset.id)) { fecharFolha(); avisar("Compromisso apagado."); ir("planejar?aba=compromissos"); }
  },
  "editar-objetivo": (el) => formObjetivo(el.dataset.id ? estado.d.objetivos.find((o) => o.id === el.dataset.id) : null),
  "arquivar-objetivo": async (el) => { if (!confirmarDuplo(el, "Toque de novo para arquivar")) return; if (await atualizar("objetivos", el.dataset.id, { situacao: "arquivado" })) { fecharFolha(); avisar("Objetivo arquivado."); await recarregar(); } },
  "ver-simulacao": (el) => {
    const s = estado.d.simulacoes.find((x) => x.id === el.dataset.id);
    if (s) ir(`planejar?aba=simular&descricao=${encodeURIComponent(s.descricao)}&valor=${s.valor_total_centavos}&parcelas=${s.parcelas}&data=${s.data}&cartao=${s.conta_id || ""}&sim=${s.id}`);
  },
  "incluir-simulacao": async (el) => {
    if (el.dataset.enviando) return;
    const d = estado.d, dados = JSON.parse(el.dataset.sim);
    const c = conta(dados.conta);
    const comp0 = compromissoDaSimulacao(dados);
    // Não inclui duas vezes: nem a mesma simulação salva, nem uma igual já incluída
    const salva = dados.id && d.simulacoes.find((s) => s.id === dados.id);
    const repetida = d.compromissos.find((x) => x.origem === "simulacao" && x.situacao !== "cancelado" && x.nome === dados.descricao && x.proxima_data === comp0.proxima_data && x.valor_centavos === comp0.valor_centavos && (x.fim_em || null) === comp0.fim_em);
    if ((salva && salva.incluida) || repetida) { avisar("Essa simulação já está no planejamento."); return ir(`compromisso/${(salva?.compromisso_id) || repetida.id}`); }
    el.dataset.enviando = "1"; el.disabled = true;
    try {
      const comp = await inserir("compromissos", { tipo: "futura", nome: dados.descricao, ...comp0, conta_id: dados.conta || null, origem: "simulacao",
        observacoes: `Simulação incluída: ${dados.parcelas > 1 ? `${dados.parcelas}× ` : "à vista, "}total ${dinheiro(dados.valor)}${comp0.ajuste_centavos ? " (os centavos que sobram vão nas primeiras parcelas)" : ""}` });
      if (!comp) return;
      const sim = { descricao: dados.descricao, valor_total_centavos: dados.valor, parcelas: dados.parcelas, data: dados.data, conta_id: dados.conta || null, incluida: true, compromisso_id: comp.id };
      if (salva) await atualizar("simulacoes", salva.id, sim); else await inserir("simulacoes", sim);
      avisar(`Incluída no planejamento${c?.tipo === "cartao" ? ", dentro das faturas previstas do cartão" : ""}.`); await recarregar(); ir("planejar?aba=compromissos&tipo=futura");
    } finally { delete el.dataset.enviando; if (el.isConnected) el.disabled = false; }
  },
  "salvar-simulacao": async (el) => {
    const dados = JSON.parse(el.dataset.sim);
    if (await inserir("simulacoes", { descricao: dados.descricao, valor_total_centavos: dados.valor, parcelas: dados.parcelas, data: dados.data, conta_id: dados.conta || null })) { avisar("Simulação salva. Ela não entra no planejamento."); await recarregar(); }
  },
});

// O formulário de simulação é tratado no envio (ver app.js: "submit" delegado)
export function simularEnvio(form) {
  const d = estado.d, h = hoje();
  const valor = paraCentavos(form.valor.value), parcelas = Number(form.parcelas.value), dataC = form.data.value, c = conta(form.conta.value);
  const alvo = document.getElementById("resultado-simulacao");
  if (!form.descricao.value.trim()) return erroForm(form, "Diga o que quer comprar.");
  if (!valor || valor <= 0) return erroForm(form, "Informe o valor total.");
  if (!dataC) return erroForm(form, "Informe a data.");
  form.querySelector(".cc-erro[data-geral]")?.remove();
  const ps = simularCompra({ valor, parcelas, data: dataC, cartao: c?.tipo === "cartao" ? c : null }, h);
  const base = compromissosPorMes(d, h, 8);
  const porMes = new Map(); for (const p of ps) porMes.set(p.data.slice(0, 7), (porMes.get(p.data.slice(0, 7)) || 0) + p.valor);
  const r = resumoInicio(d, h);
  const dentro = ps.filter((p) => p.data <= r.horizonte).reduce((s, p) => s + p.valor, 0);
  const sim = { descricao: form.descricao.value.trim(), valor, parcelas, data: dataC, conta: c?.id || "", parcelaValor: ps[ps.length - 1].valor, resto: ps[0].valor !== ps[ps.length - 1].valor, id: new URLSearchParams(location.hash.split("?")[1] || "").get("sim") || "" };
  const jaIncluida = sim.id && d.simulacoes.find((s) => s.id === sim.id)?.incluida;
  alvo.innerHTML = `${secao("Resultado", selo("Simulação", "simulacao"))}
  <div class="cc-grade2"><div class="cc-stat"><span>${parcelas > 1 ? `${parcelas} parcelas de` : "À vista"}</span><strong class="cc-num">${dinheiro(ps[ps.length - 1].valor)}</strong>${ps[0].valor !== ps[ps.length - 1].valor ? `<small class="cc-small">primeira: ${dinheiro(ps[0].valor)}</small>` : ""}</div>
  <div class="cc-stat cc-available"><span>Disponível até ${dataCurta(r.horizonte)}</span><strong class="cc-num">${dinheiro(r.disponivel - dentro)}</strong><small class="cc-small">hoje: ${dinheiro(r.disponivel)}</small></div></div>
  ${lista(base.map((m) => { const extra = porMes.get(m.mes) || 0; return linha({ titulo: `<span style="text-transform:capitalize">${mesLongo(m.mes)}</span>`, sub: extra ? `${c?.tipo === "cartao" ? "fatura" : "saída"} com a compra · antes ${dinheiro(m.valor)}` : `sem efeito · ${dinheiro(m.valor)}`, valor: dinheiro(m.valor + extra), valorSub: extra ? `+${dinheiro(extra)}` : "" }); }))}
  <p class="cc-info"><strong>Só uma simulação</strong>Nada muda no planejamento até você incluir. ${c?.tipo === "cartao" ? "No cartão, cada parcela cai na fatura do ciclo correspondente." : "Na conta, cada parcela sai na data do mês."}</p>
  <div class="cc-acoes">${jaIncluida ? `<p class="cc-small">Esta simulação já está no planejamento.</p>` : `<button type="button" class="cc-primary" data-acao="incluir-simulacao" data-sim='${esc(JSON.stringify(sim))}'>Incluir no planejamento</button>`}
  ${sim.id ? "" : `<button type="button" class="cc-secundario" data-acao="salvar-simulacao" data-sim='${esc(JSON.stringify(sim))}'>Só salvar a simulação</button>`}</div>`;
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
}
