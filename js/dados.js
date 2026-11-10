import { sb, estado, falhou } from "./base.js";

// Carrega tudo de uma vez: o volume de um uso pessoal cabe com folga no aparelho.
async function todos(tabela, select = "*", ordem) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from(tabela).select(select).range(de, de + 999);
    if (ordem) q = q.order(ordem[0], { ascending: ordem[1] });
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function carregarTudo() {
  try {
    const [contas, categorias, lancamentos, conexoes, faturas, investimentos, compromissos, baixas, pessoas, acertos, parcelas, pagamentos, rachas, cotas, objetivos, simulacoes, decisoes, prefs, sinc] = await Promise.all([
      todos("contas_saldo", "*", ["criado_em", true]),
      todos("categorias", "*", ["nome", true]),
      todos("lancamentos", "*", ["data", false]),
      todos("conexoes", "*", ["criado_em", true]),
      todos("faturas", "*", ["vencimento", false]),
      todos("investimentos", "*", ["saldo_centavos", false]),
      todos("compromissos", "*", ["proxima_data", true]),
      todos("compromisso_baixas"),
      todos("pessoas", "*", ["nome", true]),
      todos("acertos", "*", ["criado_em", false]),
      todos("acerto_parcelas", "*", ["numero", true]),
      todos("acerto_pagamentos", "*", ["data", true]),
      todos("rachas", "*", ["data", false]),
      todos("racha_cotas"),
      todos("objetivos", "*", ["criado_em", true]),
      todos("simulacoes", "*", ["criado_em", false]),
      todos("revisao_decisoes"),
      sb.from("preferencias").select("*").maybeSingle(),
      sb.from("sincronizacoes").select("*").order("id", { ascending: false }).limit(1),
    ]);
    estado.d = {
      contas, categorias, lancamentos, conexoes, faturas, investimentos, compromissos, baixas, pessoas, acertos, parcelas,
      pagamentos, rachas, cotas, objetivos, simulacoes, decisoes,
      prefs: prefs.data || { tema: "escuro", avisos: { fatura: true, fatura_dias: 3, conexao: true, renovacao: true } },
      ultimaSinc: sinc.data?.[0] || null,
    };
    return true;
  } catch (e) {
    falhou(e, "Não foi possível carregar seus dados. Verifique a conexão e tente de novo.");
    return false;
  }
}

// Gravações: retornam true quando deu certo
export async function inserir(tabela, linha) {
  const { data, error } = await sb.from(tabela).insert(linha).select().single();
  return falhou(error) ? null : data;
}
export async function inserirVarios(tabela, linhas) {
  if (!linhas.length) return [];
  const { data, error } = await sb.from(tabela).insert(linhas).select();
  return falhou(error) ? null : data;
}
export async function atualizar(tabela, id, mudancas) {
  const { error } = await sb.from(tabela).update(mudancas).eq("id", id);
  return !falhou(error);
}
export async function apagar(tabela, id) {
  const { error } = await sb.from(tabela).delete().eq("id", id);
  return !falhou(error);
}
export async function decidir(chave, decisao) {
  const { error } = await sb.from("revisao_decisoes").upsert({ chave, decisao }, { onConflict: "user_id,chave" });
  return !falhou(error);
}
export async function salvarPrefs(mudancas) {
  const { error } = await sb.from("preferencias").upsert({ ...estado.d.prefs, ...mudancas, atualizado_em: new Date().toISOString() }, { onConflict: "user_id" });
  if (falhou(error)) return false;
  estado.d.prefs = { ...estado.d.prefs, ...mudancas };
  return true;
}
