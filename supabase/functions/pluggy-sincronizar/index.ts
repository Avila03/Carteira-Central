// Sincronização dos dados já coletados pelo Meu Pluggy para as tabelas do app.
// Não pede nova coleta ao banco: o Meu Pluggy coleta sozinho a cada 24 horas.
// Chamada apenas pelo banco de dados (agendamento diário ou botão do app), com o segredo interno.
// Regras: valores em centavos; datas no fuso de São Paulo; edições do dono (descrição, categoria,
// observações) nunca são sobrescritas; falhas preservam os dados já recebidos.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLUGGY = "https://api.pluggy.ai";
const FUSO = "America/Sao_Paulo";

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${init.method ?? "GET"} ${path.split("?")[0]}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const upsert = (tabela: string, linhas: unknown[], conflito: string) =>
  linhas.length
    ? db(`${tabela}?on_conflict=${conflito}`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(linhas),
      })
    : Promise.resolve([]);

const centavos = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v * 100) : null);
const diaSP = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso)) : null;
// Datas de vencimento/fechamento chegam como meia-noite UTC: usar a data literal.
const dataLiteral = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null);
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function pluggy(path: string, apiKey: string) {
  const r = await fetch(path.startsWith("http") ? path : `${PLUGGY}${path}`, {
    headers: { "X-API-KEY": apiKey, accept: "application/json" },
  });
  const b: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`pluggy ${path.split("?")[0]}: ${r.status} ${b?.message ?? ""}`);
  return b;
}

// /v2/transactions usa paginação por cursor ({ results, next }).
async function todasTransacoes(accountId: string, apiKey: string, desde: string | null) {
  const base = `/v2/transactions?accountId=${accountId}${desde ? `&dateFrom=${desde}` : ""}`;
  const vistos = new Set<string>();
  const lista: any[] = [];
  let url: string | null = base;
  let paginas = 0;
  while (url && paginas < 60) {
    const b: any = await pluggy(url, apiKey);
    paginas++;
    let novos = 0;
    for (const t of b?.results ?? []) if (!vistos.has(t.id)) { vistos.add(t.id); lista.push(t); novos++; }
    const n = b?.next;
    if (!n || !novos) break;
    url = typeof n === "string"
      ? (n.startsWith("http") || n.startsWith("/") ? n : `${base}&cursor=${encodeURIComponent(n)}`)
      : null;
  }
  return { lista, paginas };
}

Deno.serve(async (req: Request) => {
  const seg = await db("app_segredos?nome=eq.gatilho_interno&select=valor");
  const esperado = seg?.[0]?.valor ?? "";
  if (!esperado || !iguais(req.headers.get("x-gatilho") ?? "", esperado)) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }
  const { gatilho = "manual" } = await req.json().catch(() => ({}));
  const [sinc] = await db("sincronizacoes", {
    method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ gatilho }),
  });
  const resumo: any = { conexoes: [] };
  let tudoOk = true;

  try {
    const dono = (await db("dono?select=user_id"))?.[0]?.user_id;
    if (!dono) throw new Error("Nenhum dono cadastrado.");

    const a = await fetch(`${PLUGGY}/auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: Deno.env.get("PLUGGY_CLIENT_ID"), clientSecret: Deno.env.get("PLUGGY_CLIENT_SECRET") }),
    });
    const apiKey = (await a.json().catch(() => ({})))?.apiKey;
    if (!apiKey) throw new Error(`Falha na autenticação com a Pluggy (${a.status}).`);

    const categorias = await db(`categorias?user_id=eq.${dono}&select=id,nome,tipo`);
    const conexoes = await db("conexoes?ativa=eq.true&select=*");
    const agora = new Date().toISOString();
    const hoje = hojeSP();

    for (const cx of conexoes) {
      const r: any = { banco: cx.banco, contas: 0, lancamentos: 0, faturas: 0, investimentos: 0 };
      try {
        // 1. Situação da conexão
        const item = await pluggy(`/items/${cx.pluggy_item_id}`, apiKey);
        const consentimentoVencido = item.consentExpiresAt && new Date(item.consentExpiresAt) < new Date();
        await db(`conexoes?id=eq.${cx.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: consentimentoVencido ? "CONSENTIMENTO_EXPIRADO" : item.status,
            status_execucao: item.executionStatus,
            erro: item.error?.message ?? item.error?.code ?? null,
            dados_atualizados_em: item.lastUpdatedAt,
            proxima_coleta_em: item.nextAutoSyncAt,
            consentimento_expira_em: item.consentExpiresAt,
          }),
        });

        // 2. Contas e cartões
        const contasP = (await pluggy(`/accounts?itemId=${cx.pluggy_item_id}`, apiKey))?.results ?? [];
        if (!contasP.length && consentimentoVencido) throw new Error("Autorização do Meu Pluggy expirada: renove no Dashboard.");
        const existentes = await db(`contas?conexao_id=eq.${cx.id}&select=id,pluggy_account_id,nome,incluir_no_calculo`);
        const linhasConta = contasP.map((c: any) => {
          const cartao = c.type === "CREDIT";
          const linha: any = {
            user_id: dono, conexao_id: cx.id, banco: cx.banco, origem: "pluggy",
            pluggy_account_id: c.id,
            nome_banco: c.marketingName || c.name,
            final_numero: typeof c.number === "string" ? c.number.replace(/\D/g, "").slice(-4) || null : null,
            tipo: cartao ? "cartao" : (c.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "corrente"),
            saldo_informado_centavos: cartao ? -(centavos(c.balance) ?? 0) : centavos(c.balance),
            saldo_informado_em: item.lastUpdatedAt ?? agora,
            bandeira: c.creditData?.brand ?? null,
            nivel: c.creditData?.level ?? null,
            limite_centavos: centavos(c.creditData?.creditLimit),
            limite_disponivel_centavos: centavos(c.creditData?.availableCreditLimit),
            vencimento_dia: c.creditData?.balanceDueDate ? Number(dataLiteral(c.creditData.balanceDueDate)!.slice(8, 10)) : null,
            dados_em: item.lastUpdatedAt ?? agora,
          };
          // Nome e "incluir no cálculo" são definidos na primeira vez; depois valem as escolhas do dono
          const ex = existentes.find((e: any) => e.pluggy_account_id === c.id);
          const nomes: Record<string, string> = { inter: "Inter", itau: "Itaú", mercadopago: "Mercado Pago", neon: "Neon", nubank: "Nubank", bb: "Banco do Brasil", outro: "Banco" };
          linha.nome = ex?.nome ?? `${nomes[cx.banco]} ${cartao ? "cartão" : "conta"}`;
          linha.incluir_no_calculo = ex ? ex.incluir_no_calculo : !cartao;
          return linha;
        });
        const contasDb = await upsert("contas", linhasConta, "pluggy_account_id");
        r.contas = contasDb.length;

        for (const conta of contasDb) {
          const p = contasP.find((x: any) => x.id === conta.pluggy_account_id);
          const cartao = p.type === "CREDIT";

          // 3. Faturas
          const faturaPorBill = new Map<string, string>();
          if (cartao) {
            const bills = (await pluggy(`/bills?accountId=${p.id}`, apiKey))?.results ?? [];
            const fat = await upsert("faturas", bills.map((b: any) => ({
              user_id: dono, conta_id: conta.id, pluggy_bill_id: b.id, origem: "pluggy",
              vencimento: dataLiteral(b.dueDate), fechamento: dataLiteral(b.billClosingDate),
              total_centavos: centavos(b.totalAmount) ?? 0, minimo_centavos: centavos(b.minimumPaymentAmount),
              encargos: b.financeCharges ?? null, pagamentos: b.payments ?? null, atualizado_em: agora,
            })), "pluggy_bill_id");
            for (const f of fat) faturaPorBill.set(f.pluggy_bill_id, f.id);
            r.faturas += fat.length;
            // Fechamento: dia da fatura mais recente com fechamento informado
            const comFech = fat.filter((f: any) => f.fechamento).sort((x: any, y: any) => (x.vencimento < y.vencimento ? 1 : -1))[0];
            if (comFech) await db(`contas?id=eq.${conta.id}`, { method: "PATCH", body: JSON.stringify({ fechamento_dia: Number(comFech.fechamento.slice(8, 10)) }) });
          }

          // 4. Lançamentos: carga completa na primeira vez, depois os últimos 45 dias
          const jaTem = await db(`lancamentos?conta_id=eq.${conta.id}&origem=eq.pluggy&select=id&limit=1`);
          const desde = jaTem.length ? new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10) : null;
          const { lista, paginas } = await todasTransacoes(p.id, apiKey, desde);
          r.paginas = (r.paginas ?? 0) + paginas;

          const ids = lista.map((t: any) => t.id);
          const atuais: any[] = [];
          for (let i = 0; i < ids.length; i += 150) {
            atuais.push(...(await db(`lancamentos?pluggy_transaction_id=in.(${ids.slice(i, i + 150).join(",")})&select=pluggy_transaction_id,descricao,categoria_id,natureza,descricao_editada,categoria_editada,natureza_editada`)));
          }
          const porId = new Map(atuais.map((x) => [x.pluggy_transaction_id, x]));

          const linhas = lista.map((t: any) => {
            const md = t.creditCardMetadata ?? {};
            const valorAbs = Math.abs(centavos(t.amount) ?? 0);
            if (!valorAbs) return null;
            // Sinal pelo tipo: DEBIT = saída, CREDIT = entrada (vale para conta e cartão)
            const valor = t.type === "CREDIT" ? valorAbs : -valorAbs;
            const data = diaSP(t.date)!;
            const tipoCat = valor > 0 ? "receita" : "despesa";
            const atual = porId.get(t.id);
            const descricaoBanco = (t.description || t.descriptionRaw || "Sem descrição").trim();
            // Pagamento de fatura: entrada no cartão ou saída da conta. Não é consumo nem receita.
            const natBanco = ehPagamentoFatura(t, cartao, valor) ? "pagamento_fatura" : "normal";
            const natureza = atual?.natureza_editada ? atual.natureza : natBanco;
            const sugerida = natureza === "pagamento_fatura" ? null
              : categorias.find((k: any) => k.tipo === tipoCat && sugerirCategoria(t.category, tipoCat) === k.nome)?.id ?? null;
            return {
              natureza,
              user_id: dono, conta_id: conta.id, origem: "pluggy", pluggy_transaction_id: t.id,
              data, valor_centavos: valor,
              descricao_original: descricaoBanco,
              descricao: atual?.descricao_editada ? atual.descricao : descricaoBanco,
              categoria_id: atual?.categoria_editada ? atual.categoria_id
                : (natureza === "pagamento_fatura" ? null : (atual?.categoria_id ?? sugerida)),
              categoria_banco: t.category ?? null,
              // Parcela com data posterior a hoje é compromisso futuro, mesmo quando o banco a marca como pendente
              situacao: data > hoje ? "futuro" : (t.status === "PENDING" ? "pendente" : "efetivado"),
              pluggy_bill_id: md.billId ?? null,
              fatura_id: md.billId ? faturaPorBill.get(md.billId) ?? null : null,
              parcela: md.installmentNumber ?? null,
              total_parcelas: md.totalInstallments ?? null,
              data_compra: md.purchaseDate ? diaSP(md.purchaseDate) : null,
              sincronizado_em: agora,
            };
          }).filter(Boolean);
          for (let i = 0; i < linhas.length; i += 500) await upsert("lancamentos", linhas.slice(i, i + 500), "pluggy_transaction_id");
          r.lancamentos += linhas.length;

          // Pendentes que sumiram (viraram lançamento definitivo com outro id) saem da lista
          const corte = desde ?? "1900-01-01";
          await db(`lancamentos?conta_id=eq.${conta.id}&origem=eq.pluggy&situacao=eq.pendente&data=gte.${corte}&or=(sincronizado_em.is.null,sincronizado_em.lt.${encodeURIComponent(agora)})`, { method: "DELETE" });
        }

        // 5. Investimentos
        const invs = (await pluggy(`/investments?itemId=${cx.pluggy_item_id}`, apiKey))?.results ?? [];
        await upsert("investimentos", invs.map((i: any) => ({
          user_id: dono, conexao_id: cx.id, pluggy_investment_id: i.id,
          nome: i.name || i.type || "Investimento", tipo: i.type ?? null, subtipo: i.subtype ?? null,
          saldo_centavos: centavos(i.balance) ?? 0, data_referencia: i.date ? diaSP(i.date) : null,
          vencimento: i.dueDate ? dataLiteral(i.dueDate) : null, dados_em: item.lastUpdatedAt ?? agora,
        })), "pluggy_investment_id");
        r.investimentos = invs.length;

        r.ok = true;
        await db(`conexoes?id=eq.${cx.id}`, { method: "PATCH", body: JSON.stringify({ consultado_em: agora, consulta_ok: true, consulta_detalhe: r }) });
      } catch (e) {
        tudoOk = false;
        r.ok = false; r.erro = (e as Error).message;
        // Dados anteriores ficam intactos; só registra a falha
        await db(`conexoes?id=eq.${cx.id}`, { method: "PATCH", body: JSON.stringify({ consultado_em: agora, consulta_ok: false, consulta_detalhe: r }) }).catch(() => {});
      }
      resumo.conexoes.push(r);
    }
  } catch (e) {
    tudoOk = false;
    resumo.erro = (e as Error).message;
  }

  await db(`sincronizacoes?id=eq.${sinc.id}`, {
    method: "PATCH", body: JSON.stringify({ concluida_em: new Date().toISOString(), ok: tudoOk, resumo }),
  }).catch(() => {});
  return new Response(JSON.stringify({ ok: tudoOk }), { status: 200 });
});

// Os bancos nem sempre categorizam o pagamento de fatura como "Credit card payment"
// (Inter manda "Shopping", Neon manda "Transfers"); a descrição completa a identificação.
function ehPagamentoFatura(t: any, cartao: boolean, valor: number): boolean {
  const cat = String(t.category ?? "").toLowerCase();
  const d = String(t.description ?? t.descriptionRaw ?? "").toLowerCase();
  if (cartao) {
    if (valor <= 0) return false;
    return cat === "credit card payment" || /pagamento\s*(de\s*)?fatura|pagamento\s*on\s*-?line|pagamento\s*recebido|pgto\s*fatura/.test(d);
  }
  if (valor >= 0) return false;
  return cat === "credit card payment" || /pagamento\s*(de\s*)?fatura|pgto\s*fatura|fatura\s*(do\s*)?cart[aã]o/.test(d);
}

// Sugestão inicial de categoria a partir da categoria da Pluggy (o dono pode corrigir; a correção prevalece)
function sugerirCategoria(cat: string | null | undefined, tipo: string): string | null {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (tipo === "receita") {
    if (/salary|salário|payroll/.test(c)) return "Salário";
    if (/interest|yield|rendiment|investment/.test(c)) return "Rendimentos";
    if (/refund|reembols|cashback/.test(c)) return "Reembolso";
    return null;
  }
  const regras: [RegExp, string][] = [
    [/groceries|supermarket|supermercado/, "Mercado"],
    [/food|restaurant|eating|delivery|alimenta/, "Alimentação"],
    [/rent|housing|moradia|aluguel|condom/, "Moradia"],
    [/transport|gas station|fuel|parking|taxi|ride|mobility|combust/, "Transporte"],
    [/health|pharmacy|drugstore|medical|dentist|saúde|farm/, "Saúde"],
    [/streaming|subscription|digital services|assinatura/, "Assinaturas"],
    [/leisure|entertainment|travel|lazer|viagem|ticket/, "Lazer"],
    [/education|course|school|educa/, "Educação"],
    [/tax|fee|tarifa|imposto|iof/, "Impostos e taxas"],
    [/telecom|electricity|water|utilities|internet|phone|energia/, "Contas e serviços"],
    [/shopping|clothing|electronics|online shopping|compras/, "Compras"],
  ];
  for (const [re, nome] of regras) if (re.test(c)) return nome;
  return null;
}
