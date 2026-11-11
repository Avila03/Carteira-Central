// Recorte de js/calculos.js (só o que as notificações usam). Mantenha igual ao original.
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
