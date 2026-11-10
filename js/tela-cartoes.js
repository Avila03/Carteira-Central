import { nomeNoCartao, carimbo } from "./marca.js";
import { estado, icone, dinheiro, dataBR, dataCurta, dataHoraBR, esc, hoje, titulo, secao, lista, linha, selo, BANCOS, logoBanco, registrar, conta, categoria, abrirFolha } from "./base.js";
import { faturasPrevistas, cicloCartao, somaDias } from "./calculos.js";
import { linhaLancamento } from "./tela-mais.js";

const BANDEIRA = { VISA: "VISA", MASTERCARD: "Mastercard", ELO: "elo", AMEX: "AMEX", HIPERCARD: "Hipercard" };
// Nome mostrado no cartão: o do banco, a não ser que venha vazio ou genérico ("Sem nome")
const nomeCartao = (c) => (c.nome_banco && !/^sem nome$/i.test(c.nome_banco.trim()) ? c.nome_banco : c.nome);
// Cartão compacto para a grade: cada um no seu quadrado
export function quadrado(c, f) {
  const b = BANCOS[c.banco] || BANCOS.outro;
  const usado = c.limite_centavos ? Math.min(100, ((c.limite_centavos - (c.limite_disponivel_centavos ?? c.limite_centavos)) / c.limite_centavos) * 100) : 0;
  const bandeira = BANDEIRA[String(c.bandeira || "").toUpperCase()] || c.bandeira || "";
  return `<a class="cc-plastico quadrado" href="#/cartoes/${c.id}" style="background:linear-gradient(150deg, ${b.cor} 0%, ${b.cor2} 100%)" aria-label="${esc(nomeCartao(c))}, fatura ${dinheiro(f.total)}, vence ${dataCurta(f.vencimento)}">
    <div class="q-topo">${logoBanco(c.banco, { redondo: true, tam: 30 })}<span class="q-bandeira">${esc(bandeira)}</span></div>
    <strong class="q-nome">${esc(nomeCartao(c))}</strong>
    <div class="cc-uso" aria-hidden="true"><i style="width:${usado}%"></i></div>
    <span class="q-titular" aria-hidden="true">${esc(nomeNoCartao())}</span>
    <div class="q-base"><span>Vence ${dataCurta(f.vencimento)}</span><strong>${dinheiro(f.total)}</strong></div>
  </a>`;
}
export function plastico(c, f, { aberto = false } = {}) {
  const b = BANCOS[c.banco] || BANCOS.outro;
  return `<a class="cc-plastico" href="#/cartoes/${c.id}" style="background:linear-gradient(135deg, ${b.cor} 0%, ${b.cor2} 92%)" aria-label="${esc(c.nome)}, fatura ${dinheiro(f.total)}">
    <div class="cc-plastico-topo">${logoBanco(c.banco, { redondo: true, tam: 34 })}<strong>${esc(nomeCartao(c))}</strong><small>${esc(c.nivel || "")}</small></div>
    <div class="cc-plastico-meio"><span class="cc-chip-ouro" aria-hidden="true"></span><span class="cc-final">${c.final_numero ? "•••• " + esc(c.final_numero) : ""}</span></div>
    <span class="cc-titular" aria-hidden="true">${esc(nomeNoCartao())}</span>
    <div class="cc-plastico-base"><div><span>Fatura aberta · vence ${dataCurta(f.vencimento)}</span><strong>${dinheiro(f.total)}</strong></div><span class="cc-bandeira">${esc(BANDEIRA[String(c.bandeira || "").toUpperCase()] || c.bandeira || "")}</span></div>
  </a>`;
}

// Fatura dada como paga: algum pagamento de fatura perto do vencimento (12 dias antes a 7 depois) com valor até 3% do total
function faturaPaga(f) {
  if (!f.total_centavos || f.total_centavos <= 0) return false;
  const ini = somaDias(f.vencimento, -12), fim = somaDias(f.vencimento, 7);
  return estado.d.lancamentos.some((l) => l.natureza === "pagamento_fatura" && l.data >= ini && l.data <= fim && Math.abs(Math.abs(l.valor_centavos) - f.total_centavos) <= f.total_centavos * 0.03);
}
export function telaCartoes(id) {
  const d = estado.d, h = hoje();
  const cartoes = d.contas.filter((c) => c.tipo === "cartao" && !c.arquivada);
  if (!cartoes.length) return `${titulo("Contas e crédito", "Meus cartões")}${lista([], "Nenhum cartão. Os cartões chegam pela conexão com o Meu Pluggy.")}`;
  const fats = new Map(cartoes.map((c) => [c.id, faturasPrevistas(c, d.lancamentos, d.compromissos, d.baixas, h, 6)]));
  const sel = cartoes.find((c) => c.id === id);
  const total = cartoes.reduce((s, c) => s + Math.max(0, -c.saldo_centavos), 0);
  const limite = cartoes.reduce((s, c) => s + (c.limite_centavos || 0), 0);
  const livre = cartoes.reduce((s, c) => s + (c.limite_disponivel_centavos ?? 0), 0);

  if (!sel) {
    return `${titulo("Contas e crédito", "Meus cartões")}
    <div class="cc-cartoes-grade">${cartoes.map((c) => quadrado(c, fats.get(c.id)[0])).join("")}</div>
    <div class="cc-grade2">
      <div class="cc-stat"><span>Devo nos cartões</span><strong class="cc-num">${dinheiro(total)}</strong></div>
      <div class="cc-stat cc-available"><span>Limite livre</span><strong class="cc-num">${dinheiro(livre)}</strong><small class="cc-small">de ${dinheiro(limite)}</small></div>
    </div>
    ${secao("Parcelas futuras", "<span>já previstas nas faturas</span>")}
    ${lista(cartoes.flatMap((c) => fats.get(c.id).slice(1).filter((f) => f.total > 0).map((f) => linha({ esquerda: logoBanco(c.banco), titulo: `${esc(c.nome)}`, sub: `Fatura de ${dataBR(f.vencimento)} · ${f.itens.length} item(ns)`, valor: dinheiro(f.total), valorSub: "previsto", acao: "ir", attrs: `data-rota="cartoes/${c.id}"` }))), "Nenhuma parcela futura conhecida.")}
    <p class="cc-info"><strong>Compra e pagamento</strong>A compra no cartão conta como consumo; o pagamento da fatura é só a saída da conta para quitar o cartão e não conta como gasto de novo.</p>`;
  }

  const f = fats.get(sel.id);
  const ciclo = cicloCartao(sel, h, 0);
  const desdeFechamento = d.faturas.filter((x) => x.conta_id === sel.id && x.fechamento).sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1))[0]?.fechamento;
  const compras = d.lancamentos.filter((l) => l.conta_id === sel.id && l.situacao !== "futuro" && (!desdeFechamento || l.data > desdeFechamento)).slice(0, 40);
  const anteriores = d.faturas.filter((x) => x.conta_id === sel.id).sort((a, b) => (a.vencimento < b.vencimento ? 1 : -1));
  const usado = Math.max(0, (sel.limite_centavos || 0) - (sel.limite_disponivel_centavos ?? 0));
  const outros = cartoes.filter((c) => c.id !== sel.id);
  const futuras = f.slice(1).filter((x) => x.total > 0);

  return `${titulo("Cartão", sel.nome, "cartoes")}
  <div class="cc-duas"><div>
  <div class="cc-carteira">${plastico(sel, f[0])}</div>
  <div class="cc-grade2">
    <div class="cc-stat"><span>Fecha</span><strong class="cc-num">${dataBR(ciclo.fechamento)}</strong><small class="cc-small">dia ${sel.fechamento_dia ?? "—"} · deduzido das faturas</small></div>
    <div class="cc-stat"><span>Vence</span><strong class="cc-num">${dataBR(f[0].vencimento)}</strong><small class="cc-small">dia ${sel.vencimento_dia ?? "—"}</small></div>
  </div>
  <div class="cc-stat" style="margin-bottom:12px"><span>Limite</span><strong class="cc-num">${dinheiro(usado)} usados de ${dinheiro(sel.limite_centavos)}</strong>
    <div class="cc-progresso" aria-hidden="true"><i style="width:${sel.limite_centavos ? Math.min(100, (usado / sel.limite_centavos) * 100) : 0}%"></i></div>
    <small class="cc-small">Livre ${dinheiro(sel.limite_disponivel_centavos)} · dados do banco de ${dataHoraBR(sel.dados_em)}</small></div>
  ${secao("Fatura aberta", `<span>${dinheiro(f[0].total)}</span>`)}
  ${lista(f[0].itens.map((i) => linha({ titulo: esc(i.descricao), sub: i.origem === "banco" ? "informado pelo banco" : i.origem === "parcela" ? "parcela já lançada" : i.origem === "simulacao" ? "simulação incluída" : "gasto planejado", valor: dinheiro(i.valor) })), "Fatura zerada.")}
  ${secao("Próximas faturas", "<span>previsão</span>")}
  ${lista(futuras.map((x) => linha({ titulo: `Vence ${dataBR(x.vencimento)}`, sub: x.itens.map((i) => esc(i.descricao)).join(" · "), valor: dinheiro(x.total), valorSub: "previsto" })), "Nenhuma parcela ou gasto planejado para as próximas faturas.")}
  <div class="cc-acoes-linha"><button type="button" class="cc-secundario" data-acao="ir" data-rota="planejar?aba=simular&cartao=${sel.id}">${icone("calculator", 18)}Simular compra</button>
  <button type="button" class="cc-secundario" data-acao="novo-compromisso" data-tipo="futura" data-conta="${sel.id}">${icone("plus", 18)}Planejar gasto</button></div>
  </div><div>
  ${secao("Compras desde o último fechamento")}
  ${lista(compras.map(linhaLancamento), "Nenhuma compra neste ciclo.")}
  ${secao("Faturas anteriores")}
  ${lista(anteriores.map((x) => linha({ titulo: `Venceu ${dataBR(x.vencimento)}` + (faturaPaga(x) ? carimbo("Paga") : ""), sub: `${x.fechamento ? `fechou ${dataBR(x.fechamento)}` : "fechamento não informado"}${x.minimo_centavos ? ` · mínimo ${dinheiro(x.minimo_centavos)}` : ""}`, valor: dinheiro(x.total_centavos), acao: "ver-fatura", attrs: `data-id="${x.id}"` })), "Nenhuma fatura recebida do banco.")}
  ${outros.length ? secao("Outros cartões") + `<div class="cc-cartoes-grade">${outros.map((c) => quadrado(c, fats.get(c.id)[0])).join("")}</div>` : ""}
  </div></div>`;
}

registrar({
  "ver-fatura": (el) => {
    const d = estado.d;
    const f = d.faturas.find((x) => x.id === el.dataset.id);
    if (!f) return;
    const ls = d.lancamentos.filter((l) => l.fatura_id === f.id).sort((a, b) => (a.data < b.data ? -1 : 1));
    const compras = ls.filter((l) => l.natureza === "normal");
    const soma = -compras.reduce((s, l) => s + l.valor_centavos, 0);
    abrirFolha(`Fatura de ${dataBR(f.vencimento)}`, `
      <div class="cc-hero"><span class="cc-hero-label">Total informado pelo banco</span><strong class="cc-amount">${dinheiro(f.total_centavos)}</strong>
      <span class="cc-small">${esc(conta(f.conta_id)?.nome || "")} · ${f.fechamento ? `fechou ${dataBR(f.fechamento)}` : "fechamento não informado"}</span></div>
      <p class="cc-small" style="margin-bottom:10px">Compras, estornos e encargos ligados a esta fatura: ${dinheiro(soma)}.${soma !== f.total_centavos ? " A diferença costuma ser o pagamento ou o saldo da fatura anterior, que o banco lança nesta." : ""}</p>
      ${lista(ls.map(linhaLancamento), "Nenhum lançamento ligado.")}`);
  },
});
