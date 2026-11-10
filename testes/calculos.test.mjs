import * as C from "../js/calculos.js";
let falhas = 0;
const eq = (nome, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) falhas++; console.log((ok ? "ok   " : "FALHA") + " " + nome + (ok ? "" : `\n      obtido ${JSON.stringify(a)}\n      esperado ${JSON.stringify(b)}`)); };
const H = "2026-11-10";

// Datas
eq("31/01 + 1 mês vira 28/02", C.somaMeses("2026-01-31", 1), "2026-02-28");
eq("31/01 + 2 meses volta a 31/03", C.somaMeses("2026-01-31", 2, 31), "2026-03-31");
eq("próximo dia 5 a partir de 10/11", C.proximoDia(H, 5), "2026-12-05");

// Racha R$ 300 entre 3 (exemplo do pedido): R$ 100 cada, R$ 200 a receber
eq("racha igual 300/3", C.dividirIgual(30000, 3), [10000, 10000, 10000]);
eq("racha igual 100/3 até o centavo", C.dividirIgual(10000, 3), [3334, 3333, 3333]);
eq("racha por % 50/25/25 de 99,99 (maior resto)", C.dividirPercentual(9999, [50, 25, 25]), [4999, 2500, 2500]);
eq("soma do racha por % fecha no total", C.dividirPercentual(10001, [33.33, 33.33, 33.34]).reduce((a, b) => a + b), 10001);

// Compra parcelada: 10× de R$ 1.234,56
const ps = C.gerarParcelas(123456, 10, "2026-11-15");
eq("parcelas somam o total", ps.reduce((s, p) => s + p.valor_centavos, 0), 123456);
eq("primeira e última parcela", [ps[0].valor_centavos, ps[9].valor_centavos, ps[9].vencimento], [12346, 12345, "2027-08-15"]);

// Ciclo do cartão (Itaú: fecha 29, vence 05)
const itau = { id: "itau", tipo: "cartao", fechamento_dia: 29, vencimento_dia: 5, saldo_centavos: -33436 };
eq("ciclo aberto do Itaú", C.cicloCartao(itau, H, 0), { fechamento: "2026-11-29", vencimento: "2026-12-05", inicio: null });
eq("ciclo seguinte do Itaú", [C.cicloCartao(itau, H, 1).fechamento, C.cicloCartao(itau, H, 1).vencimento], ["2026-12-29", "2027-01-05"]);

// Fatura prevista: saldo do banco + parcela futura + gasto planejado no cartão (cada um uma vez)
const lanc = [{ id: "p2", conta_id: "itau", situacao: "futuro", data: "2026-12-10", valor_centavos: -5000, descricao: "Parcela 2/3" }];
const comp = [{ id: "g1", tipo: "futura", nome: "Presente", valor_centavos: 20000, periodicidade: "unica", proxima_data: "2026-11-20", conta_id: "itau", situacao: "ativo", origem: "manual" }];
const fp = C.faturasPrevistas(itau, lanc, comp, [], H, 3);
eq("fatura aberta = banco + planejado", [fp[0].vencimento, fp[0].total], ["2026-12-05", 33436 + 20000]);
eq("parcela futura vai para a fatura de janeiro", [fp[1].vencimento, fp[1].total], ["2027-01-05", 5000]);

// Salário vinculado à previsão: recebido sai da previsão; o próximo vira o horizonte
const sal = { id: "s", tipo: "salario", nome: "Salário", valor_centavos: 500000, periodicidade: "mensal", proxima_data: "2026-11-05", situacao: "ativo" };
eq("salário de 05/11 sem baixa = atrasado", C.salariosAtrasados([sal], [], H).map((o) => o.data), ["2026-11-05"]);
const baixas = [{ compromisso_id: "s", referencia: "2026-11-05", situacao: "recebido", valor_centavos: 512000 }];
eq("com baixa não está atrasado", C.salariosAtrasados([sal], baixas, H).length, 0);
eq("próximo salário 05/12", C.proximoSalario([sal], baixas, H)?.data, "2026-12-05");

// Início: disponível = saldo − compromissos até o salário − reservas; quem me deve fica fora
const conta = { id: "c1", tipo: "corrente", incluir_no_calculo: true, saldo_centavos: 300000, arquivada: false };
const fora = { id: "c2", tipo: "poupanca", incluir_no_calculo: false, saldo_centavos: 999900, arquivada: false };
const luz = { id: "l", tipo: "fixo", nome: "Luz", valor_centavos: 15000, periodicidade: "mensal", proxima_data: "2026-11-20", situacao: "ativo", conta_id: "c1", origem: "manual" };
const d = { contas: [conta, fora, itau], lancamentos: lanc, compromissos: [sal, luz, ...comp], baixas,
  acertos: [{ id: "a1", pessoa_id: "ana", direcao: "me_deve", situacao: "aberto", valor_total_centavos: 20000, descricao: "Racha: janta" },
            { id: "a2", pessoa_id: "joao", direcao: "eu_devo", situacao: "aberto", valor_total_centavos: 30000, descricao: "Notebook" }],
  parcelas: [{ acerto_id: "a2", numero: 1, vencimento: "2026-11-25", valor_centavos: 15000 }, { acerto_id: "a2", numero: 2, vencimento: "2026-12-25", valor_centavos: 15000 }],
  pagamentos: [{ acerto_id: "a1", valor_centavos: 5000 }], pessoas: [{ id: "ana", nome: "Ana" }, { id: "joao", nome: "João" }],
  objetivos: [{ situacao: "ativo", valor_guardado_centavos: 40000, guardado_em: "organizacional", nome: "IPVA" }], investimentos: [], rachas: [], cotas: [], decisoes: [] };
const r = C.resumoInicio(d, H);
eq("saldo ignora conta fora do cálculo", r.saldo, 300000);
eq("horizonte = próximo salário", r.horizonte, "2026-12-05");
eq("compromissos: fatura Itaú 534,36 + luz 150 + parcela João 150", r.compromissos, 53436 + 15000 + 15000);
eq("reserva descontada uma vez", r.reservas, 40000);
eq("disponível", r.disponivel, 300000 - (53436 + 15000 + 15000) - 40000);
eq("racha com recebimento parcial: Ana ainda deve 150 (fora do disponível)", r.aReceberPessoas, 15000);
eq("salário previsto em 05/12 fica em 'a receber', separado", r.aReceberPrevisto, 500000);

// Pagamento de fatura e transferência própria não contam como consumo
const d2 = { ...d, contas: [conta, { id: "c3", tipo: "corrente" }, itau], rachas: [{ id: "r", lancamento_id: "x3", pagador_pessoa_id: null }], cotas: [{ racha_id: "r", pessoa_id: "ana", cota_centavos: 20000 }, { racha_id: "r", pessoa_id: null, cota_centavos: 10000 }],
  lancamentos: [
    { id: "x1", conta_id: "itau", data: "2026-10-03", valor_centavos: -10000, natureza: "normal", situacao: "efetivado", categoria_id: "k" },
    { id: "x2", conta_id: "c1", data: "2026-10-05", valor_centavos: -33893, natureza: "pagamento_fatura", situacao: "efetivado" },
    { id: "x3", conta_id: "c1", data: "2026-10-08", valor_centavos: -30000, natureza: "normal", situacao: "efetivado", categoria_id: "k" },
    { id: "x4", conta_id: "c1", data: "2026-10-09", valor_centavos: -5000, natureza: "transferencia_propria", situacao: "efetivado" },
    { id: "x5", conta_id: "c3", data: "2026-10-09", valor_centavos: 5000, natureza: "transferencia_propria", situacao: "efetivado" }] };
const c = C.consumoDoMes(d2, "2026-10");
eq("consumo: compra no cartão 100 + minha cota da janta 100", c.saidas, 20000);
const cx = C.caixaDoMes(d2, "2026-10");
eq("caixa: pagamento da fatura 338,93 + janta 300 saem da conta", [cx.saidas, cx.faturasPagas], [33893 + 30000, 33893]);

// Repetição de importação: mesma lançamento duas vezes vira sugestão de duplicidade
const d3 = { ...d, decisoes: [], lancamentos: [
  { id: "m", conta_id: "c1", data: "2026-10-10", valor_centavos: -4990, origem: "manual", situacao: "efetivado", natureza: "normal" },
  { id: "p", conta_id: "c1", data: "2026-10-11", valor_centavos: -4990, origem: "pluggy", situacao: "efetivado", natureza: "normal" }] };
eq("duplicidade manual × banco sugerida", C.sugerirDuplicidades(d3).length, 1);
eq("transferência própria sugerida", C.sugerirTransferencias({ ...d2, decisoes: [], lancamentos: [
  { id: "t1", conta_id: "c1", data: "2026-10-09", valor_centavos: -5000, natureza: "normal", situacao: "efetivado" },
  { id: "t2", conta_id: "c3", data: "2026-10-10", valor_centavos: 5000, natureza: "normal", situacao: "efetivado" }] }).length, 1);

// Simulação 3× no cartão Itaú comprando em 20/11: parcelas em dez, jan, fev
eq("simulação parcelada no cartão", C.simularCompra({ valor: 30000, parcelas: 3, data: "2026-11-20", cartao: itau }, H).map((p) => p.data), ["2026-12-05", "2027-01-05", "2027-02-05"]);
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTodos os testes passaram.");

// Simulação incluída não perde centavos
{
  const { compromissoDaSimulacao, ocorrencias, valorDaOcorrencia } = await import("../js/calculos.js");
  for (const [valor, n] of [[10000, 3], [10001, 4], [99999, 12], [5000, 1]]) {
    const c = { ...compromissoDaSimulacao({ valor, parcelas: n, data: "2026-12-10" }), situacao: "ativo" };
    const datas = ocorrencias(c, "2026-01-01", "2030-01-01");
    const soma = datas.reduce((s, d) => s + valorDaOcorrencia(c, d), 0);
    if (datas.length !== n || soma !== valor) { console.error("FALHOU simulação", valor, n, datas.length, soma); process.exitCode = 1; } else console.log("ok    simulação", valor, "em", n, "=", soma);
  }
}
