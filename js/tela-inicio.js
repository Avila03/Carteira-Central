import { estado, icone, dinheiro, dataBR, dataCurta, dataHoraBR, mesCurto, esc, pct, hoje, titulo, secao, lista, linha, selo, logoBanco, logoCompromisso, registrar, conta, categoria } from "./base.js";
import { resumoInicio, indices, consumoDoMes, faturasPrevistas, agenda, somaMeses, somaDias, diffDias, ENTRADAS, parcelasComSaldo } from "./calculos.js";

export function calcular() {
  const d = estado.d, h = hoje();
  const r = resumoInicio(d, h);
  return { r, ix: indices(d, r), h };
}

// ---------- avisos (dentro do app) ----------
export function avisos(d, h) {
  const out = [], pref = d.prefs.avisos || {};
  const dias = pref.fatura_dias ?? 3;
  if (pref.fatura !== false) {
    for (const c of d.contas.filter((x) => x.tipo === "cartao" && !x.arquivada)) {
      const f = faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 1)[0];
      const falta = diffDias(h, f.vencimento);
      if (f.total > 0 && falta <= dias) out.push({ tipo: "aviso", texto: `A fatura do ${esc(c.nome)} vence ${falta <= 0 ? "hoje" : falta === 1 ? "amanhã" : `em ${falta} dias`} (${dataBR(f.vencimento)}): ${dinheiro(f.total)}.`, rota: `cartoes/${c.id}` });
    }
  }
  if (pref.conexao !== false) {
    for (const x of d.conexoes.filter((y) => y.ativa)) {
      const nome = { inter: "Inter", itau: "Itaú", mercadopago: "Mercado Pago", neon: "Neon", nubank: "Nubank", bb: "Banco do Brasil" }[x.banco] || "Banco";
      if (x.consulta_ok === false || ["LOGIN_ERROR", "OUTDATED", "CONSENTIMENTO_EXPIRADO"].includes(x.status)) out.push({ tipo: "erro", texto: `A conexão do ${nome} precisa de atenção. Os dados anteriores foram mantidos.`, rota: "conexoes" });
      else if (x.consentimento_expira_em && diffDias(h, x.consentimento_expira_em.slice(0, 10)) <= 30) out.push({ tipo: "aviso", texto: `A autorização do ${nome} no Meu Pluggy vence em ${dataBR(x.consentimento_expira_em)}. Renove no Dashboard da Pluggy.`, rota: "conexoes" });
    }
  }
  if (pref.renovacao !== false) {
    for (const o of agenda(d.compromissos.filter((c) => c.tipo === "assinatura" && c.lembrete_dias), d.baixas, h, somaDias(h, 31), h)) {
      if (diffDias(h, o.data) <= o.compromisso.lembrete_dias && o.situacao === "previsto") out.push({ tipo: "aviso", texto: `${esc(o.compromisso.nome)} renova em ${dataBR(o.data)}: ${dinheiro(o.valor)}.`, rota: `compromisso/${o.compromisso.id}` });
    }
  }
  for (const o of agenda(d.compromissos.filter((c) => c.tipo === "salario"), d.baixas, somaDias(h, -20), somaDias(h, -1), h)) {
    if (o.situacao === "atrasado") out.push({ tipo: "erro", texto: `O salário previsto para ${dataBR(o.data)} ainda não foi marcado como recebido.`, rota: `compromisso/${o.compromisso.id}` });
  }
  if (pref.acertos) {
    for (const a of d.acertos.filter((x) => x.direcao === "me_deve" && x.situacao === "aberto")) {
      const vencidas = parcelasComSaldo(a, d.parcelas, d.pagamentos).filter((p) => p.restante_centavos > 0 && p.vencimento < h);
      if (vencidas.length) out.push({ tipo: "aviso", texto: `${esc(d.pessoas.find((p) => p.id === a.pessoa_id)?.nome || "Alguém")} tem ${vencidas.length} parcela(s) em atraso de "${esc(a.descricao)}".`, rota: `pessoa/${a.pessoa_id}` });
    }
  }
  return out;
}

// ---------- gráficos pequenos ----------
function miniMes(d, h) {
  const mes = h.slice(0, 7);
  const c = consumoDoMes(d, mes);
  const mx = Math.max(c.entradas, c.saidas, 1);
  const barra = (v, cls) => `<i class="${cls}" style="height:${Math.max(3, (v / mx) * 100)}%"></i>`;
  return `<button type="button" class="cc-mini" data-acao="ir" data-rota="relatorios" style="text-align:left;color:inherit;width:100%;cursor:pointer">
    <h3>Mês de ${mesCurto(h)}</h3>
    <div class="cc-barras" role="img" aria-label="Entrou ${dinheiro(c.entradas)}, saiu ${dinheiro(c.saidas)}">
      <div>${barra(c.entradas, "forte")}<small>Entrou</small></div><div>${barra(c.saidas, "ouro")}<small>Saiu</small></div></div>
    <p class="cc-small" style="margin-top:6px">Resultado</p><strong class="cc-num" style="font-size:15px">${dinheiro(c.resultado, { sinal: true })}</strong></button>`;
}
export function compromissosPorMes(d, h, n = 6) {
  const meses = Array.from({ length: n }, (_, i) => somaMeses(`${h.slice(0, 7)}-01`, i).slice(0, 7));
  const tot = Object.fromEntries(meses.map((m) => [m, 0]));
  const ate = somaMeses(`${h.slice(0, 7)}-01`, n);
  for (const c of d.contas.filter((x) => x.tipo === "cartao" && !x.arquivada)) {
    for (const f of faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, n + 1)) { const m = f.vencimento.slice(0, 7); if (m in tot) tot[m] += f.total; }
  }
  const cartoes = new Set(d.contas.filter((x) => x.tipo === "cartao").map((x) => x.id));
  for (const o of agenda(d.compromissos.filter((c) => !ENTRADAS.has(c.tipo) && !cartoes.has(c.conta_id)), d.baixas, h, ate, h)) {
    if (o.situacao === "previsto") { const m = o.data.slice(0, 7); if (m in tot) tot[m] += o.valor; }
  }
  for (const a of d.acertos.filter((x) => x.direcao === "eu_devo" && x.situacao === "aberto")) {
    for (const p of parcelasComSaldo(a, d.parcelas, d.pagamentos)) { const m = p.vencimento.slice(0, 7); if (p.restante_centavos > 0 && m in tot) tot[m] += p.restante_centavos; }
  }
  return meses.map((m) => ({ mes: m, valor: tot[m] }));
}
function miniCompromissos(d, h) {
  const ms = compromissosPorMes(d, h);
  const mx = Math.max(...ms.map((m) => m.valor), 1);
  return `<button type="button" class="cc-mini" data-acao="ir" data-rota="planejar" style="text-align:left;color:inherit;width:100%;cursor:pointer">
    <h3>Próximos 6 meses</h3>
    <div class="cc-barras" role="img" aria-label="Compromissos previstos por mês">${ms.map((m, i) => `<div><i class="${i === 0 ? "ouro" : ""}" style="height:${Math.max(3, (m.valor / mx) * 100)}%"></i><small>${mesCurto(m.mes + "-01")}</small></div>`).join("")}</div>
    <p class="cc-small" style="margin-top:6px">Este mês</p><strong class="cc-num" style="font-size:15px">${dinheiro(ms[0].valor)}</strong></button>`;
}
function gastoPorCartao(d, h) {
  const cs = d.contas.filter((x) => x.tipo === "cartao" && !x.arquivada).map((c) => ({ c, v: faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 1)[0].total }));
  if (!cs.length) return "";
  const mx = Math.max(...cs.map((x) => x.v), 1);
  return `${secao("Gasto por cartão", `<span>fatura aberta</span>`)}<div class="cc-list" style="padding:10px 14px">${cs.sort((a, b) => b.v - a.v).map(({ c, v }) =>
    `<a class="cc-hbar" href="#/cartoes/${c.id}" style="text-decoration:none;color:inherit"><span>${esc(c.nome.replace(/ cartão$/, ""))}</span><div><i style="width:${(v / mx) * 100}%"></i></div><strong class="cc-num">${dinheiro(v)}</strong></a>`).join("")}</div>`;
}

// ---------- Início ----------
export function telaInicio() {
  const d = estado.d;
  const { r, ix, h } = calcular();
  const nome = (estado.sessao?.user?.user_metadata?.nome) || "";
  const dadosEm = r.consideradas.filter((c) => c.dados_em).map((c) => c.dados_em).sort()[0];
  const av = avisos(d, h);
  const proximos = proximosPagamentos(d, h, 5);
  const cartoes = d.contas.filter((c) => c.tipo === "cartao" && !c.arquivada);
  const cartaoFat = cartoes.map((c) => ({ c, f: faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 1)[0] }));

  return `<p class="cc-eyebrow">Visão geral · ${new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(new Date())}</p>
  <h1>${nome ? `Olá, ${esc(nome)}` : "Olá"}</h1>
  ${av.map((a) => `<button type="button" class="cc-aviso ${a.tipo === "erro" ? "erro" : ""}" data-acao="ir" data-rota="${a.rota}">${icone(a.tipo === "erro" ? "triangle-alert" : "bell", 18)}<span>${a.texto}</span></button>`).join("")}
  <button type="button" class="cc-hero" data-acao="ir" data-rota="composicao/saldo">
    <span class="cc-hero-label">Saldo atual</span>
    <strong class="cc-amount">${dinheiro(r.saldo)}</strong>
    <span class="cc-small">${r.consideradas.length} conta(s) no cálculo${dadosEm ? ` · dados do banco de ${dataHoraBR(dadosEm)}` : ""}</span>
  </button>
  <div class="cc-grade2">
    <button type="button" class="cc-stat" data-acao="ir" data-rota="composicao/compromissos"><span>Compromissos até ${dataCurta(r.horizonte)}</span><strong class="cc-num">${dinheiro(r.compromissos)}</strong><small class="cc-small">${r.compItens.length} item(ns)</small></button>
    <button type="button" class="cc-stat cc-areceber" data-acao="ir" data-rota="composicao/receber"><span>A receber</span><strong class="cc-num">${dinheiro(r.aReceber)}</strong><small class="cc-small">Previsto, fora do disponível</small></button>
  </div>
  <button type="button" class="cc-stat cc-available" style="margin-bottom:6px" data-acao="ir" data-rota="composicao/disponivel">
    <span>Disponível estimado até ${r.semSalario ? "o fim do mês" : `o salário (${dataCurta(r.horizonte)})`}</span>
    <strong class="cc-num" style="font-size:24px">${dinheiro(r.disponivel)}</strong>
    <small class="cc-small">Estimativa · ${r.semSalario ? "cadastre o salário em Planejar para usar a data dele" : "saldo − compromissos − reservas"}</small>
  </button>
  <button type="button" class="cc-text-button" data-acao="ir" data-rota="composicao/disponivel">Entender meu disponível ${icone("chevron-right", 15)}</button>

  ${secao("Índices")}
  <div class="cc-indices">
    <button type="button" class="cc-indice" data-acao="ir" data-rota="composicao/indices"><span>Cobertura da dívida</span><strong class="cc-num">${pct(ix.cobertura)}</strong><small>dinheiro ÷ dívida</small></button>
    <button type="button" class="cc-indice" data-acao="ir" data-rota="composicao/indices"><span>Uso do limite</span><strong class="cc-num">${pct(ix.usoLimite)}</strong><small>${dinheiro(ix.usado)}</small></button>
    <button type="button" class="cc-indice" data-acao="ir" data-rota="composicao/indices"><span>Comprometimento do salário</span><strong class="cc-num">${pct(ix.comprometimento)}</strong><small>${r.salario ? "até o salário" : "sem salário"}</small></button>
  </div>
  <div class="cc-grade2">${miniMes(d, h)}${miniCompromissos(d, h)}</div>
  ${gastoPorCartao(d, h)}

  ${secao("Meus cartões", `<span>${cartoes.length} cartões</span>`)}
  ${lista(cartaoFat.map(({ c, f }) => linha({ esquerda: logoBanco(c.banco), titulo: esc(c.nome), sub: `Fatura aberta · vence ${dataBR(f.vencimento)}`, valor: dinheiro(f.total), acao: "ir", attrs: `data-rota="cartoes/${c.id}"` })), "Nenhum cartão.")}

  ${secao("Próximos pagamentos", `<a href="#/planejar" class="cc-small" style="color:var(--cc-currency)">Ver todos</a>`)}
  ${lista(proximos.map((p) => linha({ esquerda: p.esquerda, titulo: p.titulo, sub: `${dataBR(p.data)}${p.selo}`, valor: dinheiro(p.valor), acao: "ir", attrs: `data-rota="${p.rota}"` })), "Nenhum pagamento previsto. Cadastre gastos fixos e assinaturas em Planejar.")}
  ${d.ultimaSinc ? `<p class="cc-account-line">Última busca nos bancos: ${dataHoraBR(d.ultimaSinc.iniciada_em)}</p>` : ""}`;
}

// Próximos pagamentos: faturas, compromissos e parcelas com pessoas, por data
export function proximosPagamentos(d, h, n = 5) {
  const itens = [];
  for (const c of d.contas.filter((x) => x.tipo === "cartao" && !x.arquivada)) {
    const f = faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 1)[0];
    if (f.total > 0) itens.push({ data: f.vencimento, titulo: `Fatura ${esc(c.nome)}`, valor: f.total, esquerda: logoBanco(c.banco), selo: selo("Previsto", "previsto"), rota: `cartoes/${c.id}` });
  }
  const cartoes = new Set(d.contas.filter((x) => x.tipo === "cartao").map((x) => x.id));
  for (const o of agenda(d.compromissos.filter((c) => !ENTRADAS.has(c.tipo) && !cartoes.has(c.conta_id)), d.baixas, somaDias(h, -30), somaDias(h, 60), h)) {
    if (o.situacao !== "previsto" && o.situacao !== "vencido") continue;
    itens.push({ data: o.data, titulo: esc(o.compromisso.nome), valor: o.valor, esquerda: logoCompromisso(o.compromisso), selo: o.situacao === "vencido" ? selo("Vencido", "vencido") : selo("Previsto", "previsto"), rota: `compromisso/${o.compromisso.id}` });
  }
  for (const a of d.acertos.filter((x) => x.direcao === "eu_devo" && x.situacao === "aberto")) {
    const p = parcelasComSaldo(a, d.parcelas, d.pagamentos).find((x) => x.restante_centavos > 0);
    if (p) itens.push({ data: p.vencimento, titulo: `${esc(d.pessoas.find((x) => x.id === a.pessoa_id)?.nome || "Pessoa")} · ${esc(a.descricao)}`, valor: p.restante_centavos, esquerda: `<span class="cc-ic">${icone("users", 18)}</span>`, selo: p.vencimento < h ? selo("Vencido", "vencido") : selo("Previsto", "previsto"), rota: `pessoa/${a.pessoa_id}` });
  }
  return itens.sort((a, b) => (a.data < b.data ? -1 : 1)).slice(0, n);
}

// ---------- composição de cada total ----------
export function telaComposicao(tipo) {
  const d = estado.d;
  const { r, ix } = calcular();
  const lin = (t, v, sub = "", rota = "") => linha({ titulo: t, sub, valor: dinheiro(v), acao: rota ? "ir" : "", attrs: rota ? `data-rota="${rota}"` : "" });
  const contaLinha = (c) => linha({ esquerda: logoBanco(c.banco), titulo: esc(c.nome), sub: c.origem === "pluggy" ? `Banco · ${dataHoraBR(c.dados_em)}` : "Registro manual", valor: dinheiro(c.saldo_centavos), acao: "ir", attrs: `data-rota="conta/${c.id}"` });
  if (tipo === "saldo") {
    return `${titulo("Composição", "Saldo atual", "inicio")}
    <div class="cc-hero"><span class="cc-hero-label">Soma das contas consideradas</span><strong class="cc-amount">${dinheiro(r.saldo)}</strong><span class="cc-small">Só dinheiro já na conta. Recebimentos previstos não entram.</span></div>
    ${secao("Contas consideradas")}${lista(r.consideradas.map(contaLinha), "Nenhuma conta no cálculo.")}
    ${r.foraDoCalculo.length ? secao("Fora do cálculo") + lista(r.foraDoCalculo.map(contaLinha)) : ""}
    <p class="cc-info"><strong>Como mudar</strong>Abra uma conta em Mais › Contas e marque ou desmarque “Incluir no saldo e no disponível”.</p>`;
  }
  if (tipo === "compromissos") {
    const grupos = [...new Set(r.compItens.map((i) => i.grupo))];
    return `${titulo("Composição", `Compromissos até ${dataBR(r.horizonte)}`, "inicio")}
    <div class="cc-hero"><span class="cc-hero-label">Total a pagar até ${r.semSalario ? "o fim do mês" : "o próximo salário"}</span><strong class="cc-amount">${dinheiro(r.compromissos)}</strong><span class="cc-small">Faturas, gastos fixos, assinaturas pagas na conta e parcelas com pessoas. Compras no cartão aparecem uma vez, dentro da fatura.</span></div>
    ${grupos.map((g) => secao(g) + lista(r.compItens.filter((i) => i.grupo === g).map((i) => lin(esc(i.descricao).replace(/ · vence (\d{4}-\d\d-\d\d)/, (m, x) => ` · vence ${dataBR(x)}`), i.valor, `${dataBR(i.data)}${i.situacao === "vencido" ? " · vencido" : " · previsto"}`, i.cartao ? `cartoes/${i.cartao.id}` : i.compromisso ? `compromisso/${i.compromisso.id}` : i.acerto ? `pessoa/${i.acerto.pessoa_id}` : "")))).join("") || lista([], "Nenhum compromisso no período.")}`;
  }
  if (tipo === "receber") {
    return `${titulo("Composição", "A receber", "inicio")}
    <div class="cc-hero"><span class="cc-hero-label">Total previsto</span><strong class="cc-amount">${dinheiro(r.aReceber)}</strong><span class="cc-small">Nada disto entra no saldo nem no disponível até chegar de fato na conta.</span></div>
    ${secao("Recebimentos previstos", `<span>${dinheiro(r.aReceberPrevisto)}</span>`)}${lista(r.previstos.map((i) => lin(esc(i.descricao), i.valor, `${dataBR(i.data)} · ${i.situacao === "atrasado" ? "atrasado" : "previsto"}`, `compromisso/${i.compromisso.id}`)), "Nenhum salário ou receita prevista. Cadastre em Planejar.")}
    ${secao("Pessoas que me devem", `<span>${dinheiro(r.aReceberPessoas)}</span>`)}${lista(r.pessoasItens.map((i) => lin(esc(i.descricao), i.valor, "a receber", `pessoa/${i.acerto.pessoa_id}`)), "Ninguém te deve no momento.")}`;
  }
  if (tipo === "disponivel") {
    return `${titulo("Composição", "Disponível estimado", "inicio")}
    <div class="cc-composition" style="margin-top:0">
      <div><span>Saldo das contas consideradas</span><strong class="cc-num">${dinheiro(r.saldo)}</strong></div>
      <div><span>Compromissos até ${dataBR(r.horizonte)}</span><strong class="cc-num">− ${dinheiro(r.compromissos)}</strong></div>
      <div><span>Reservado para metas e reservas</span><strong class="cc-num">− ${dinheiro(r.reservas)}</strong></div>
      <div><span>Disponível estimado</span><strong class="cc-num" style="color:var(--cc-currency)">${dinheiro(r.disponivel)}</strong></div>
    </div>
    <p class="cc-info"><strong>Período</strong>${r.semSalario ? `Sem salário cadastrado, o cálculo vai até o fim do mês (${dataBR(r.horizonte)}).` : `De hoje até o próximo salário, previsto para ${dataBR(r.horizonte)} (${dinheiro(r.salario.valor)}).`}</p>
    <p class="cc-info"><strong>O que não entra</strong>Salário e receitas previstas (${dinheiro(r.aReceberPrevisto)}) e o que outras pessoas te devem (${dinheiro(r.aReceberPessoas)}). Investimentos também ficam fora.</p>
    ${secao("Contas consideradas")}${lista(r.consideradas.map(contaLinha))}
    ${secao("Compromissos descontados")}${lista(r.compItens.map((i) => lin(esc(i.descricao).replace(/ · vence (\d{4}-\d\d-\d\d)/, (m, x) => ` · vence ${dataBR(x)}`), i.valor, dataBR(i.data))), "Nenhum.")}
    ${secao("Reservas descontadas")}${lista(r.reservasItens.map((i) => lin(esc(i.descricao), i.valor, i.objetivo.guardado_em === "conta" ? "guardado em conta considerada" : "reserva organizacional", "planejar?aba=objetivos")), "Nenhuma reserva. Crie metas e reservas em Planejar.")}`;
  }
  if (tipo === "indices") {
    return `${titulo("Composição", "Índices", "inicio")}
    ${lista([
      linha({ titulo: "Cobertura da dívida", sub: `(saldo ${dinheiro(r.saldo)} + investido ${dinheiro(ix.investido)}) ÷ dívida ${dinheiro(ix.divida)}`, valor: pct(ix.cobertura) }),
      linha({ titulo: "Uso do limite", sub: `${dinheiro(ix.usado)} usados de ${dinheiro(ix.limite)} somando os cartões`, valor: pct(ix.usoLimite) }),
      linha({ titulo: "Comprometimento do salário", sub: r.salario ? `compromissos até ${dataBR(r.horizonte)} ÷ salário de ${dinheiro(r.salario.valor)}` : "cadastre o salário em Planejar", valor: pct(ix.comprometimento) }),
    ])}
    <p class="cc-info"><strong>Dívida considerada</strong>Cartões ${dinheiro(ix.dividaCartoes)} + pessoas ${dinheiro(ix.dividaPessoas)}.</p>`;
  }
  return "";
}

registrar({});
