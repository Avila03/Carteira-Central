// Notificações no iPhone (Web Push) da Carteira Central.
// - Agendamento diário (9h de São Paulo), com o segredo interno: resumo da manhã e faturas que fecharam.
//   Só envia quando há algo a dizer; cada aviso é enviado uma única vez.
// - Chamadas do app (usuário logado): obter a chave pública e enviar um teste.
// As chaves VAPID são geradas aqui na primeira vez e ficam só no banco (app_segredos).
import { gerarVapid, chavePublica, enviar } from "./webpush.js";
import { agenda, parcelasComSaldo, somaDias, hojeISO } from "./calculos.js";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${path.split("?")[0]}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const segredo = async (nome: string) => (await db(`app_segredos?nome=eq.${nome}&select=valor`))?.[0]?.valor ?? null;
function iguais(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

async function chaves() {
  let v = await segredo("vapid_jwk");
  if (!v) {
    const jwk = await gerarVapid();
    await db("app_segredos?on_conflict=nome", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ nome: "vapid_jwk", valor: JSON.stringify(jwk) }) });
    v = await segredo("vapid_jwk");
  }
  return JSON.parse(v);
}

const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

async function dados(uid: string) {
  const q = (t: string, sel = "*") => db(`${t}?user_id=eq.${uid}&select=${sel}&limit=5000`);
  const [contas, lancamentos, faturas, compromissos, baixas, pessoas, acertos, parcelas, pagamentos, prefs] = await Promise.all([
    db(`contas?user_id=eq.${uid}&select=id,nome,banco,tipo,arquivada&limit=500`), db(`lancamentos?user_id=eq.${uid}&natureza=eq.pagamento_fatura&select=id,conta_id,data,valor_centavos,natureza&order=data.desc&limit=500`), q("faturas"), q("compromissos"), q("compromisso_baixas"),
    q("pessoas", "id,nome"), q("acertos"), q("acerto_parcelas"), q("acerto_pagamentos"), q("preferencias"),
  ]);
  return { contas, lancamentos, faturas, compromissos, baixas, pessoas, acertos, parcelas, pagamentos, prefs: prefs?.[0] || {} };
}
const nomeConta = (d: any, id: string) => (d.contas.find((c: any) => c.id === id)?.nome || "Cartão").replace(/ cartão$/i, "");
function faturaPaga(d: any, f: any) {
  const ini = somaDias(f.vencimento, -12), fim = somaDias(f.vencimento, 7);
  return d.lancamentos.some((l: any) => l.natureza === "pagamento_fatura" && l.data >= ini && l.data <= fim && Math.abs(Math.abs(l.valor_centavos) - f.total_centavos) <= f.total_centavos * 0.03);
}

// Resumo da manhã: o que vence ou entra hoje e amanhã
function resumoManha(d: any, hoje: string) {
  const amanha = somaDias(hoje, 1);
  const quando = (x: string) => (x === hoje ? "hoje" : "amanhã");
  const pagar: string[] = [], receber: string[] = [];
  for (const f of d.faturas) if (f.vencimento >= hoje && f.vencimento <= amanha && f.total_centavos > 0 && !faturaPaga(d, f)) pagar.push(`Fatura ${nomeConta(d, f.conta_id)} ${brl(f.total_centavos)} (${quando(f.vencimento)})`);
  const cartoes = new Set(d.contas.filter((c: any) => c.tipo === "cartao").map((c: any) => c.id));
  for (const o of agenda(d.compromissos, d.baixas, hoje, amanha, hoje)) {
    if (o.situacao !== "previsto") continue;
    if (!o.entrada && cartoes.has(o.compromisso.conta_id)) continue; // já entra na fatura
    (o.entrada ? receber : pagar).push(`${o.compromisso.nome} ${brl(o.valor)} (${quando(o.data)})`);
  }
  for (const a of d.acertos.filter((x: any) => x.situacao === "aberto")) {
    const p = d.pessoas.find((x: any) => x.id === a.pessoa_id)?.nome || "Pessoa";
    for (const pc of parcelasComSaldo(a, d.parcelas, d.pagamentos)) if (pc.restante_centavos > 0 && pc.vencimento >= hoje && pc.vencimento <= amanha)
      (a.direcao === "eu_devo" ? pagar : receber).push(`${a.direcao === "eu_devo" ? "Pagar a" : "Receber de"} ${p} ${brl(pc.restante_centavos)} (${quando(pc.vencimento)})`);
  }
  if (!pagar.length && !receber.length) return null;
  const n = pagar.length + receber.length;
  const corpo = [pagar.length ? `A pagar: ${pagar.join("; ")}` : "", receber.length ? `A receber: ${receber.join("; ")}` : ""].filter(Boolean).join("\n");
  return { chave: `resumo:${hoje}`, titulo: `Bom dia · ${n} ${n === 1 ? "item" : "itens"} hoje e amanhã`, corpo, url: "/#/inicio" };
}
// Faturas que fecharam nos últimos 5 dias e ainda não foram avisadas
function faturasFechadas(d: any, hoje: string, jaEnviadas: Set<string>) {
  const fs = d.faturas.filter((f: any) => f.fechamento && f.fechamento >= somaDias(hoje, -5) && f.fechamento <= hoje && !jaEnviadas.has(`fechou:${f.id}`));
  return fs.map((f: any) => ({ chave: `fechou:${f.id}`, titulo: `Fatura ${nomeConta(d, f.conta_id)} fechou`, corpo: `${brl(f.total_centavos)} · vence ${dm(f.vencimento)}`, url: `/#/cartoes/${f.conta_id}` }));
}

async function enviarParaTodos(uid: string, msg: any, jwk: any, sub: string) {
  const ins = await db(`push_inscricoes?user_id=eq.${uid}&select=*`);
  let ok = 0;
  for (const i of ins) {
    const r = await enviar(i, { titulo: msg.titulo, corpo: msg.corpo, url: msg.url, tag: msg.chave }, jwk, sub).catch((e) => ({ status: 0, texto: String(e) }));
    if (r.status >= 200 && r.status < 300) { ok++; if (i.falhas) await db(`push_inscricoes?id=eq.${i.id}`, { method: "PATCH", body: JSON.stringify({ falhas: 0 }) }); }
    else if (r.status === 404 || r.status === 410) await db(`push_inscricoes?id=eq.${i.id}`, { method: "DELETE" });
    else { console.error("push", r.status, r.texto); await db(`push_inscricoes?id=eq.${i.id}`, { method: "PATCH", body: JSON.stringify({ falhas: (i.falhas || 0) + 1 }) }); }
  }
  return { inscricoes: ins.length, entregues: ok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const corpo = await req.json().catch(() => ({}));
    const jwk = await chaves();
    const sub = (await segredo("vapid_sub")) || "https://carteiracentral.vercel.app";

    // 1) Agendamento diário (banco de dados, segredo interno)
    const gat = req.headers.get("x-gatilho");
    if (gat) {
      const esperado = (await segredo("gatilho_interno")) ?? "";
      if (!esperado || !iguais(gat, esperado)) return json({ erro: "nao autorizado" }, 401);
      const uid = (await db("dono?select=user_id"))?.[0]?.user_id;
      if (!uid) return json({ erro: "sem dono" }, 400);
      const d = await dados(uid);
      const av = d.prefs.avisos || {};
      const hoje = hojeISO();
      const enviadas = new Set((await db(`notificacoes_enviadas?user_id=eq.${uid}&enviada_em=gte.${somaDias(hoje, -40)}&select=chave`)).map((x: any) => x.chave));
      const msgs = [
        ...(av.push_resumo ? [resumoManha(d, hoje)].filter((m) => m && !enviadas.has(m.chave)) : []),
        ...(av.push_fatura ? faturasFechadas(d, hoje, enviadas) : []),
      ];
      const res = [];
      for (const m of msgs) {
        const r = await enviarParaTodos(uid, m, jwk, sub);
        if (r.entregues) await db("notificacoes_enviadas?on_conflict=user_id,chave", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ user_id: uid, chave: m.chave, titulo: m.titulo, corpo: m.corpo }) });
        res.push({ chave: m.chave, ...r });
      }
      return json({ ok: true, enviadas: res });
    }

    // 2) Chamadas do app: usuário logado
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = await fetch(`${URL_BASE}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
    if (!u.ok) return json({ erro: "nao autorizado" }, 401);
    const uid = (await u.json()).id;
    if (corpo.acao === "chave") {
      if (corpo.origem && /^https:\/\/[a-z0-9.-]+$/i.test(corpo.origem) && !(await segredo("vapid_sub")))
        await db("app_segredos?on_conflict=nome", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ nome: "vapid_sub", valor: corpo.origem }) });
      return json({ chave: chavePublica(jwk) });
    }
    if (corpo.acao === "teste") {
      const r = await enviarParaTodos(uid, { chave: "teste", titulo: "Carteira Central", corpo: "Notificações ligadas. Os avisos chegam às 9h, só quando houver algo.", url: "/#/configuracoes" }, jwk, sub);
      return json(r);
    }
    if (corpo.acao === "previa") {
      const d = await dados(uid); const hoje = hojeISO();
      return json({ resumo: resumoManha(d, hoje), faturas: faturasFechadas(d, hoje, new Set()) });
    }
    return json({ erro: "acao desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: String(e).slice(0, 300) }, 500);
  }
});
