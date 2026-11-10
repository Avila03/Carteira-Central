// Carteira Central — regras financeiras puras (sem acesso à rede), testáveis isoladamente.
// Valores sempre em centavos inteiros; datas como "AAAA-MM-DD" no fuso de São Paulo.

export const FUSO = "America/Sao_Paulo";
export const hojeISO = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);

// ---------- datas ----------
const partes = (iso) => iso.split("-").map(Number);
const fmt = (a, m, d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const diasNoMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
export function somaDias(iso, n) {
  const [a, m, d] = partes(iso);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
// Soma meses mantendo o dia de referência (31 vira o último dia do mês quando preciso)
export function somaMeses(iso, n, diaRef) {
  const [a, m, d] = partes(iso);
  const alvo = (a * 12 + (m - 1)) + n;
  const na = Math.floor(alvo / 12), nm = (alvo % 12) + 1;
  return fmt(na, nm, Math.min(diaRef ?? d, diasNoMes(na, nm)));
}
export const mesDe = (iso) => iso.slice(0, 7);
export function diffDias(a, b) {
  const [y1, m1, d1] = partes(a), [y2, m2, d2] = partes(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
// Próxima data (>= ref) com um certo dia do mês
export function proximoDia(ref, dia) {
  const [a, m] = partes(ref);
  let c = fmt(a, m, Math.min(dia, diasNoMes(a, m)));
  if (c < ref) c = somaMeses(fmt(a, m, 1), 1, Math.min(dia, 31));
  return c;
}

// ---------- compromissos ----------
const PASSO = { semanal: [0, 7], quinzenal: [0, 14], mensal: [1, 0], bimestral: [2, 0], trimestral: [3, 0], semestral: [6, 0], anual: [12, 0] };
export const ENTRADAS = new Set(["salario", "receita"]);

// Ocorrências de um compromisso entre duas datas (inclusive). A âncora é proxima_data.
export function ocorrencias(c, de, ate) {
  if (!c || c.situacao === "cancelado") return [];
  const out = [];
  const lim = c.fim_em && c.fim_em < ate ? c.fim_em : ate;
  if (c.periodicidade === "unica") {
    if (c.proxima_data >= de && c.proxima_data <= lim) out.push(c.proxima_data);
    return out;
  }
  const [meses, dias] = PASSO[c.periodicidade] || [1, 0];
  const diaRef = Number(c.proxima_data.slice(8, 10));
  const passo = (iso, k) => (meses ? somaMeses(c.proxima_data, meses * k, diaRef) : somaDias(c.proxima_data, dias * k));
  // Nada antes da primeira data cadastrada: o que veio antes não foi registrado e não pode virar "vencido"
  let k = 0;
  for (let i = 0; i < 800; i++, k++) {
    const d = passo(null, k);
    if (d > lim) break;
    if (d >= de) out.push(d);
  }
  return out;
}

// Situação de uma ocorrência, considerando as baixas registradas
// Valor de uma ocorrência: as primeiras (até ajuste_ate) levam os centavos que sobraram da divisão
export const valorDaOcorrencia = (c, ref) => c.valor_centavos + (c.ajuste_centavos && c.ajuste_ate && ref <= c.ajuste_ate ? c.ajuste_centavos : 0);
export function situacaoOcorrencia(c, ref, baixas, hoje) {
  const b = baixas.find((x) => x.compromisso_id === c.id && x.referencia === ref);
  const v = valorDaOcorrencia(c, ref);
  if (b) return { situacao: b.situacao, baixa: b, valor: b.valor_centavos ?? v };
  const entrada = ENTRADAS.has(c.tipo);
  if (ref < hoje) return { situacao: entrada ? "atrasado" : "vencido", valor: v };
  return { situacao: "previsto", valor: v };
}

// Lista de ocorrências com situação, num intervalo
export function agenda(compromissos, baixas, de, ate, hoje) {
  const itens = [];
  for (const c of compromissos) {
    if (c.situacao !== "ativo") continue;
    for (const ref of ocorrencias(c, de, ate)) {
      const s = situacaoOcorrencia(c, ref, baixas, hoje);
      itens.push({ tipo: "compromisso", compromisso: c, data: ref, entrada: ENTRADAS.has(c.tipo), ...s });
    }
  }
  return itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

// Próximo salário: primeira ocorrência de salário ainda não recebida a partir de hoje
export function proximoSalario(compromissos, baixas, hoje) {
  const sal = compromissos.filter((c) => c.tipo === "salario" && c.situacao === "ativo");
  let melhor = null;
  for (const c of sal) {
    for (const ref of ocorrencias(c, hoje, somaDias(hoje, 70))) {
      const s = situacaoOcorrencia(c, ref, baixas, hoje);
      if (s.situacao === "recebido" || s.situacao === "ignorado") continue;
      if (!melhor || ref < melhor.data) melhor = { compromisso: c, data: ref, valor: s.valor };
      break;
    }
  }
  return melhor;
}
// Salários de datas passadas ainda não recebidos
export function salariosAtrasados(compromissos, baixas, hoje) {
  return agenda(compromissos.filter((c) => c.tipo === "salario"), baixas, somaDias(hoje, -45), somaDias(hoje, -1), hoje)
    .filter((o) => o.situacao === "atrasado");
}

// ---------- cartões ----------
// Datas do ciclo k (0 = fatura aberta) de um cartão: fechamento e vencimento
export function cicloCartao(cartao, hoje, k = 0) {
  const fDia = cartao.fechamento_dia || (cartao.vencimento_dia ? Math.max(1, ((cartao.vencimento_dia + 23) % 31) || 28) : 28);
  const vDia = cartao.vencimento_dia || Math.min(28, fDia + 7);
  const f0 = proximoDia(hoje, fDia);
  const fechamento = k ? somaMeses(f0, k, fDia) : f0;
  const vencimento = proximoDia(somaDias(fechamento, 1), vDia);
  const anterior = k ? somaMeses(f0, k - 1, fDia) : null;
  return { fechamento, vencimento, inicio: anterior ? somaDias(anterior, 1) : null };
}

// Faturas previstas dos próximos n ciclos de um cartão:
// ciclo 0 = saldo devedor atual informado pelo banco + itens futuros até o fechamento;
// demais = parcelas futuras e gastos planejados no cartão que caem em cada ciclo.
export function faturasPrevistas(cartao, lancamentos, compromissos, baixas, hoje, n = 6) {
  const out = [];
  const futuros = lancamentos.filter((l) => l.conta_id === cartao.id && l.situacao === "futuro");
  const planejados = compromissos.filter((c) => c.conta_id === cartao.id && !ENTRADAS.has(c.tipo) && c.situacao === "ativo");
  let ini = hoje;
  for (let k = 0; k < n; k++) {
    const { fechamento, vencimento } = cicloCartao(cartao, hoje, k);
    const itens = [];
    if (k === 0) {
      const devedor = Math.max(0, -(cartao.saldo_centavos ?? 0));
      if (devedor) itens.push({ origem: "banco", descricao: "Saldo atual da fatura (banco)", valor: devedor });
    }
    for (const l of futuros) if (l.data >= ini && l.data <= fechamento) itens.push({ origem: "parcela", descricao: l.descricao, valor: -l.valor_centavos, lancamento: l });
    for (const o of agenda(planejados, baixas, ini, fechamento, hoje)) {
      if (o.situacao === "pago" || o.situacao === "ignorado" || o.data < hoje) continue;
      itens.push({ origem: o.compromisso.origem === "simulacao" ? "simulacao" : "planejado", descricao: o.compromisso.nome, valor: o.valor, compromisso: o.compromisso, data: o.data });
    }
    out.push({ k, fechamento, vencimento, itens, total: itens.reduce((s, i) => s + i.valor, 0) });
    ini = somaDias(fechamento, 1);
  }
  return out;
}

// ---------- acertos com pessoas ----------
// Distribui pagamentos pelas parcelas (as mais antigas primeiro)
export function parcelasComSaldo(acerto, parcelas, pagamentos) {
  const ps = parcelas.filter((p) => p.acerto_id === acerto.id).sort((a, b) => a.numero - b.numero);
  let pago = pagamentos.filter((p) => p.acerto_id === acerto.id).reduce((s, p) => s + p.valor_centavos, 0);
  if (!ps.length) return [];
  return ps.map((p) => {
    const usado = Math.min(pago, p.valor_centavos); pago -= usado;
    return { ...p, pago_centavos: usado, restante_centavos: p.valor_centavos - usado };
  });
}
// Divide um valor em n partes iguais até o centavo; os centavos que sobram vão para as primeiras
export function dividirIgual(total, n) {
  const base = Math.floor(total / n), resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}
// Divide por percentuais (somando 100) com arredondamento consistente (maior resto)
export function dividirPercentual(total, percentuais) {
  const brutos = percentuais.map((p) => (total * p) / 100);
  const base = brutos.map(Math.floor);
  let falta = total - base.reduce((s, v) => s + v, 0);
  const ordem = brutos.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]);
  for (let j = 0; j < ordem.length && falta > 0; j++, falta--) base[ordem[j][1]]++;
  return base;
}
// Parcelas de um acerto: n parcelas mensais a partir da primeira data
export function gerarParcelas(total, n, primeira) {
  const valores = dividirIgual(total, n);
  const dia = Number(primeira.slice(8, 10));
  return valores.map((v, i) => ({ numero: i + 1, vencimento: somaMeses(primeira, i, dia), valor_centavos: v }));
}

// ---------- totais do Início ----------
// Monta saldo, compromissos até o horizonte, reservas, disponível e valores a receber, com a composição de cada um.
export function resumoInicio(d, hoje) {
  const contas = d.contas.filter((c) => !c.arquivada);
  const dinheiro = contas.filter((c) => c.tipo !== "cartao");
  const consideradas = dinheiro.filter((c) => c.incluir_no_calculo);
  const saldo = consideradas.reduce((s, c) => s + Number(c.saldo_centavos), 0);

  const sal = proximoSalario(d.compromissos, d.baixas, hoje);
  const fimMes = `${hoje.slice(0, 7)}-${String(diasNoMes(...partes(hoje).slice(0, 2))).padStart(2, "0")}`;
  const horizonte = sal ? sal.data : fimMes;

  const compItens = [];
  // 1. faturas de cartão com vencimento até o horizonte
  for (const c of contas.filter((x) => x.tipo === "cartao")) {
    for (const f of faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, hoje, 3)) {
      if (f.vencimento <= horizonte && f.total > 0) compItens.push({ grupo: "Faturas", descricao: `${c.nome} · vence ${f.vencimento}`, data: f.vencimento, valor: f.total, cartao: c, fatura: f });
    }
  }
  // 2. compromissos pagos por conta (não cartão) até o horizonte, inclusive vencidos sem pagamento
  const porConta = d.compromissos.filter((c) => !ENTRADAS.has(c.tipo) && !(contas.find((x) => x.id === c.conta_id)?.tipo === "cartao"));
  for (const o of agenda(porConta, d.baixas, somaDias(hoje, -45), horizonte, hoje)) {
    if (o.situacao === "previsto" || o.situacao === "vencido") {
      compItens.push({ grupo: o.compromisso.tipo === "assinatura" ? "Assinaturas" : o.compromisso.origem === "simulacao" ? "Simulações incluídas" : "Gastos fixos e programados", descricao: o.compromisso.nome, data: o.data, valor: o.valor, situacao: o.situacao, compromisso: o.compromisso });
    }
  }
  // 3. parcelas que eu devo a pessoas até o horizonte
  for (const a of d.acertos.filter((x) => x.direcao === "eu_devo" && x.situacao === "aberto")) {
    const pess = d.pessoas.find((p) => p.id === a.pessoa_id);
    const ps = parcelasComSaldo(a, d.parcelas, d.pagamentos);
    if (ps.length) {
      for (const p of ps) if (p.restante_centavos > 0 && p.vencimento <= horizonte) compItens.push({ grupo: "Acertos com pessoas", descricao: `${pess?.nome ?? "Pessoa"} · ${a.descricao} (${p.numero}/${ps.length})`, data: p.vencimento, valor: p.restante_centavos, situacao: p.vencimento < hoje ? "vencido" : "previsto", acerto: a });
    } else {
      const r = a.valor_total_centavos - d.pagamentos.filter((p) => p.acerto_id === a.id).reduce((s, p) => s + p.valor_centavos, 0);
      if (r > 0) compItens.push({ grupo: "Acertos com pessoas", descricao: `${pess?.nome ?? "Pessoa"} · ${a.descricao} · sem data`, data: hoje, valor: r, situacao: "sem_data", acerto: a });
    }
  }
  compItens.sort((a, b) => (a.data < b.data ? -1 : 1));
  const compromissos = compItens.reduce((s, i) => s + i.valor, 0);

  // Reservas: contam uma única vez, só quando o dinheiro está numa conta considerada no saldo
  const reservasItens = d.objetivos.filter((o) => o.situacao === "ativo" && o.valor_guardado_centavos > 0 && (o.guardado_em === "organizacional" || consideradas.some((c) => c.id === o.conta_id)))
    .map((o) => ({ descricao: o.nome, valor: o.valor_guardado_centavos, objetivo: o }));
  const reservas = reservasItens.reduce((s, i) => s + i.valor, 0);
  const disponivel = saldo - compromissos - reservas;

  // A receber: previstos (salário e receitas) e pessoas — nunca entram no disponível
  const previstos = agenda(d.compromissos.filter((c) => ENTRADAS.has(c.tipo)), d.baixas, somaDias(hoje, -45), horizonte, hoje)
    .filter((o) => o.situacao === "previsto" || o.situacao === "atrasado")
    .map((o) => ({ grupo: o.compromisso.tipo === "salario" ? "Salário" : "Outras receitas", descricao: o.compromisso.nome, data: o.data, valor: o.valor, situacao: o.situacao, compromisso: o.compromisso }));
  const pessoasItens = [];
  for (const a of d.acertos.filter((x) => x.direcao === "me_deve" && x.situacao === "aberto")) {
    const restante = a.valor_total_centavos - d.pagamentos.filter((p) => p.acerto_id === a.id).reduce((s, p) => s + p.valor_centavos, 0);
    if (restante > 0) pessoasItens.push({ grupo: "Pessoas", descricao: `${d.pessoas.find((p) => p.id === a.pessoa_id)?.nome ?? "Pessoa"} · ${a.descricao}`, valor: restante, acerto: a });
  }
  const aReceberPrevisto = previstos.reduce((s, i) => s + i.valor, 0);
  const aReceberPessoas = pessoasItens.reduce((s, i) => s + i.valor, 0);

  return {
    saldo, consideradas, foraDoCalculo: dinheiro.filter((c) => !c.incluir_no_calculo),
    horizonte, salario: sal, semSalario: !sal,
    compromissos, compItens, reservas, reservasItens, disponivel,
    aReceber: aReceberPrevisto + aReceberPessoas, aReceberPrevisto, aReceberPessoas, previstos, pessoasItens,
  };
}

// ---------- índices ----------
export function indices(d, r) {
  const cartoes = d.contas.filter((c) => c.tipo === "cartao" && !c.arquivada);
  const dividaCartoes = cartoes.reduce((s, c) => s + Math.max(0, -Number(c.saldo_centavos)), 0);
  const dividaPessoas = d.acertos.filter((a) => a.direcao === "eu_devo" && a.situacao === "aberto")
    .reduce((s, a) => s + Math.max(0, a.valor_total_centavos - d.pagamentos.filter((p) => p.acerto_id === a.id).reduce((x, p) => x + p.valor_centavos, 0)), 0);
  const investido = d.investimentos.reduce((s, i) => s + Number(i.saldo_centavos), 0);
  const divida = dividaCartoes + dividaPessoas;
  const limite = cartoes.reduce((s, c) => s + (c.limite_centavos || 0), 0);
  const usado = cartoes.reduce((s, c) => s + Math.max(0, (c.limite_centavos || 0) - (c.limite_disponivel_centavos ?? c.limite_centavos ?? 0)), 0);
  return {
    divida, dividaCartoes, dividaPessoas, investido,
    cobertura: divida ? (r.saldo + investido) / divida : null,
    usoLimite: limite ? usado / limite : null, limite, usado,
    comprometimento: r.salario && r.salario.valor ? r.compromissos / r.salario.valor : null,
  };
}

// ---------- consumo e caixa ----------
// Consumo: compras e despesas (conta e cartão), sem pagamento de fatura nem transferências próprias;
// a parte de um racha que outras pessoas vão devolver é tratada como recuperação.
export function consumoDoMes(d, mes) {
  const cotasOutros = new Map();
  for (const r of d.rachas) {
    if (!r.lancamento_id || r.pagador_pessoa_id) continue;
    const outros = d.cotas.filter((c) => c.racha_id === r.id && c.pessoa_id).reduce((s, c) => s + c.cota_centavos, 0);
    cotasOutros.set(r.lancamento_id, outros);
  }
  const ls = d.lancamentos.filter((l) => l.data.startsWith(mes) && l.natureza === "normal" && l.situacao !== "futuro");
  let entradas = 0, saidas = 0; const porCat = new Map();
  for (const l of ls) {
    let v = l.valor_centavos;
    if (v < 0 && cotasOutros.has(l.id)) v = Math.min(0, v + cotasOutros.get(l.id));
    if (v > 0) entradas += v; else saidas += -v;
    if (v < 0) porCat.set(l.categoria_id || "", (porCat.get(l.categoria_id || "") || 0) - v);
  }
  return { entradas, saidas, resultado: entradas - saidas, porCategoria: [...porCat.entries()].sort((a, b) => b[1] - a[1]) };
}
// Caixa: o que entrou e saiu das contas (inclui pagar fatura; ignora transferências entre contas próprias)
export function caixaDoMes(d, mes) {
  const contasDinheiro = new Set(d.contas.filter((c) => c.tipo !== "cartao").map((c) => c.id));
  let entradas = 0, saidas = 0, faturasPagas = 0;
  for (const l of d.lancamentos) {
    if (!l.data.startsWith(mes) || !contasDinheiro.has(l.conta_id) || l.natureza === "transferencia_propria" || l.situacao === "futuro") continue;
    if (l.valor_centavos > 0) entradas += l.valor_centavos; else saidas += -l.valor_centavos;
    if (l.natureza === "pagamento_fatura") faturasPagas += -l.valor_centavos;
  }
  return { entradas, saidas, resultado: entradas - saidas, faturasPagas };
}

// ---------- revisão ----------
export const normalizarDescricao = (s) => String(s || "").toUpperCase().replace(/[0-9]+/g, "").replace(/[*.\-_/#]+/g, " ").replace(/\s+/g, " ").trim();
// Possíveis assinaturas: mesma descrição em 3 meses diferentes nos últimos 6, com valor parecido
export function sugerirAssinaturas(d, hoje) {
  const desde = somaMeses(hoje, -6);
  const grupos = new Map();
  for (const l of d.lancamentos) {
    if (l.valor_centavos >= 0 || l.natureza !== "normal" || l.data < desde || l.situacao === "futuro" || l.total_parcelas > 1) continue;
    const k = normalizarDescricao(l.descricao_original || l.descricao) + "|" + Math.round(-l.valor_centavos / 100);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(l);
  }
  const jaTem = new Set(d.compromissos.map((c) => normalizarDescricao(c.nome)));
  const out = [];
  for (const [k, ls] of grupos) {
    const meses = new Set(ls.map((l) => mesDe(l.data)));
    if (meses.size < 3) continue;
    const ult = ls.sort((a, b) => (a.data < b.data ? 1 : -1))[0];
    const nome = normalizarDescricao(ult.descricao_original || ult.descricao);
    if (jaTem.has(nome) || d.decisoes.some((x) => x.chave === "assinatura:" + k)) continue;
    out.push({ chave: "assinatura:" + k, nome: ult.descricao, valor: -ult.valor_centavos, ultima: ult.data, conta_id: ult.conta_id, meses: meses.size, lancamentos: ls });
  }
  return out.sort((a, b) => b.meses - a.meses);
}
// Possíveis duplicidades: mesmo valor, mesma conta, até 2 dias, sendo um manual ou importado
export function sugerirDuplicidades(d) {
  const out = [];
  const ls = d.lancamentos.filter((l) => l.situacao !== "futuro");
  const porChave = new Map();
  for (const l of ls) { const k = l.conta_id + "|" + l.valor_centavos; if (!porChave.has(k)) porChave.set(k, []); porChave.get(k).push(l); }
  for (const grupo of porChave.values()) {
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      const a = grupo[i], b = grupo[j];
      if (a.origem === "pluggy" && b.origem === "pluggy") continue;
      if (Math.abs(diffDias(a.data, b.data)) > 2) continue;
      const chave = "dup:" + [a.id, b.id].sort().join(":");
      if (d.decisoes.some((x) => x.chave === chave)) continue;
      out.push({ chave, a, b });
    }
  }
  return out;
}
// Possíveis transferências entre contas próprias: valores opostos em contas diferentes, até 2 dias
export function sugerirTransferencias(d) {
  const dinheiro = new Set(d.contas.filter((c) => c.tipo !== "cartao").map((c) => c.id));
  const ls = d.lancamentos.filter((l) => dinheiro.has(l.conta_id) && l.natureza === "normal" && l.situacao === "efetivado");
  const saidas = ls.filter((l) => l.valor_centavos < 0), entradas = ls.filter((l) => l.valor_centavos > 0);
  const usados = new Set(), out = [];
  for (const s of saidas) {
    const e = entradas.find((x) => !usados.has(x.id) && x.conta_id !== s.conta_id && x.valor_centavos === -s.valor_centavos && Math.abs(diffDias(s.data, x.data)) <= 2);
    if (!e) continue;
    const chave = "transf:" + [s.id, e.id].sort().join(":");
    if (d.decisoes.some((x) => x.chave === chave)) continue;
    usados.add(e.id); out.push({ chave, saida: s, entrada: e });
  }
  return out;
}

// ---------- simulação ----------
// Compromisso equivalente a uma compra simulada: base mensal + 1 centavo nas primeiras, somando o total exato
export function compromissoDaSimulacao({ valor, parcelas, data }) {
  const base = Math.floor(valor / parcelas), resto = valor - base * parcelas;
  return { valor_centavos: base, periodicidade: parcelas > 1 ? "mensal" : "unica", proxima_data: data, fim_em: parcelas > 1 ? somaMeses(data, parcelas - 1) : null,
    ajuste_centavos: resto ? 1 : 0, ajuste_ate: resto ? somaMeses(data, resto - 1) : null };
}
// Efeito de uma compra simulada nos próximos meses: parcelas por mês de pagamento
export function simularCompra({ valor, parcelas, data, cartao }, hoje) {
  const valores = dividirIgual(valor, parcelas);
  return valores.map((v, i) => {
    let quando;
    if (cartao) {
      const dataCompra = i === 0 ? data : somaMeses(data, i);
      // a parcela entra na fatura cujo fechamento é o primeiro >= data da parcela
      const f = proximoDia(dataCompra, cartao.fechamento_dia || 28);
      quando = proximoDia(somaDias(f, 1), cartao.vencimento_dia || 5);
    } else quando = somaMeses(data, i);
    return { numero: i + 1, valor: v, data: quando };
  });
}
