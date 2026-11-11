// Anexos: links e fotos ligados a qualquer coisa cadastrada (lançamento, conta, compromisso, acerto, racha, pessoa, objetivo).
// Fotos ficam num armazenamento privado do Supabase; só o dono consegue abrir (link temporário de 1 hora).
import { sb, estado, icone, esc, avisar, confirmarDuplo, registrar } from "./base.js";

const BALDE = "anexos";
let pendentes = []; // anexos de um item que ainda não foi salvo
const urlCache = new Map();

export const anexosDe = (tipo, id) => (id ? estado.d.anexos.filter((a) => a.alvo_tipo === tipo && a.alvo_id === id) : []);

// Bloco para colocar dentro de um formulário (ou de uma tela de detalhe)
export function campoAnexos(tipo, id) {
  if (!id) pendentes = [];
  return `<div class="cc-anexos" data-anexo-tipo="${tipo}" data-anexo-id="${id || ""}">
    <p class="cc-anexos-titulo">${icone("link2", 15)}Anexos</p>
    <div class="cc-anexos-lista">${listaHTML(tipo, id)}</div>
    <div class="cc-anexos-botoes">
      <button type="button" class="cc-secundario" data-acao="anexo-link">${icone("link2", 16)}Link</button>
      <label class="cc-secundario cc-anexo-foto">${icone("upload", 16)}Foto<input type="file" accept="image/*" data-anexo-arquivo hidden></label>
    </div>
  </div>`;
}
function listaHTML(tipo, id) {
  const itens = id ? anexosDe(tipo, id) : pendentes;
  if (!itens.length) return `<p class="cc-small">Nenhum anexo. Adicione um link (comprovante, contrato, site) ou uma foto.</p>`;
  return itens.map((a, i) => a.tipo === "link"
    ? `<div class="cc-anexo"><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${icone("external-link", 15)}<span>${esc(a.nome || new URL(a.url).hostname)}</span></a><button type="button" class="cc-icon-button" data-acao="anexo-apagar" data-id="${a.id || ""}" data-i="${i}" aria-label="Remover anexo">${icone("x", 16)}</button></div>`
    : `<div class="cc-anexo foto"><button type="button" class="cc-anexo-mini" data-acao="anexo-ver" data-caminho="${esc(a.caminho || "")}" data-i="${i}" aria-label="Ver foto">${a.previa ? `<img src="${a.previa}" alt="">` : `<img data-caminho="${esc(a.caminho)}" alt="">`}</button><span>${esc(a.nome || "Foto")}</span><button type="button" class="cc-icon-button" data-acao="anexo-apagar" data-id="${a.id || ""}" data-i="${i}" aria-label="Remover foto">${icone("x", 16)}</button></div>`).join("");
}
function redesenhar(bloco) {
  bloco.querySelector(".cc-anexos-lista").innerHTML = listaHTML(bloco.dataset.anexoTipo, bloco.dataset.anexoId || null);
  carregarMiniaturas(bloco);
}
async function urlAssinada(caminho) {
  const c = urlCache.get(caminho);
  if (c && c.ate > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(BALDE).createSignedUrl(caminho, 3600);
  if (error) return null;
  urlCache.set(caminho, { url: data.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
export async function carregarMiniaturas(raiz = document) {
  for (const img of raiz.querySelectorAll("img[data-caminho]")) { const u = await urlAssinada(img.dataset.caminho); if (u) img.src = u; }
}

// Reduz a foto para no máximo 1600px (JPEG), para economizar espaço e dados
async function reduzir(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
async function enviarFoto(blob) {
  const caminho = `${estado.sessao.user.id}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BALDE).upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
  if (error) { avisar("Não consegui enviar a foto."); return null; }
  return caminho;
}
async function gravar(tipo, id, anexo) {
  const { data, error } = await sb.from("anexos").insert({ alvo_tipo: tipo, alvo_id: id, tipo: anexo.tipo, url: anexo.url || null, caminho: anexo.caminho || null, nome: anexo.nome || null }).select().single();
  if (error) { avisar("Não consegui salvar o anexo."); return null; }
  estado.d.anexos.push(data);
  return data;
}
// Depois de salvar um item novo: grava os anexos que estavam esperando
export async function salvarAnexosPendentes(tipo, id) {
  const lista = pendentes; pendentes = [];
  for (const a of lista) await gravar(tipo, id, a);
}

// Link: campos abrem dentro do próprio bloco (sem trocar de tela e sem formulário dentro de formulário)
function pedirLink(bloco) {
  const box = bloco.querySelector(".cc-anexo-novo");
  if (box) { box.remove(); return; }
  bloco.querySelector(".cc-anexos-botoes").insertAdjacentHTML("beforebegin", `<div class="cc-anexo-novo">
    <input type="url" inputmode="url" autocapitalize="none" placeholder="https://" data-anexo-url aria-label="Endereço do link">
    <input maxlength="120" placeholder="Nome (opcional): comprovante, contrato" data-anexo-nome aria-label="Nome do link">
    <p class="cc-erro" role="alert" hidden></p>
    <button type="button" class="cc-primary" data-acao="anexo-link-ok" style="margin:0">Adicionar link</button></div>`);
  bloco.querySelector("[data-anexo-url]").focus();
}
async function confirmarLink(bloco) {
  const box = bloco.querySelector(".cc-anexo-novo"), err = box.querySelector(".cc-erro");
  let url = box.querySelector("[data-anexo-url]").value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  try { if (!url || new URL(url).protocol !== "https:") throw 0; } catch { err.textContent = "Use um endereço que comece com https://"; err.hidden = false; return; }
  const a = { tipo: "link", url, nome: box.querySelector("[data-anexo-nome]").value.trim() || null };
  if (bloco.dataset.anexoId) { if (!(await gravar(bloco.dataset.anexoTipo, bloco.dataset.anexoId, a))) return; } else pendentes.push(a);
  box.remove(); redesenhar(bloco); avisar("Link anexado.");
}
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest?.(".cc-anexo-novo")) { e.preventDefault(); confirmarLink(e.target.closest(".cc-anexos")); } });

registrar({
  "anexo-link": (el) => pedirLink(el.closest(".cc-anexos")),
  "anexo-link-ok": (el) => confirmarLink(el.closest(".cc-anexos")),
  "anexo-ver": async (el) => {
    const a = el.dataset.caminho ? { caminho: el.dataset.caminho } : pendentes[Number(el.dataset.i)];
    const u = a.previa || (await urlAssinada(a.caminho));
    if (!u) return avisar("Não consegui abrir a foto.");
    const v = document.createElement("div");
    v.className = "cc-anexo-tela"; v.setAttribute("role", "dialog"); v.setAttribute("aria-label", "Foto anexada");
    v.innerHTML = `<img src="${u}" alt="Foto anexada"><button type="button" class="cc-icon-button" aria-label="Fechar">${icone("x")}</button>`;
    v.addEventListener("click", () => v.remove());
    document.body.appendChild(v);
  },
  "anexo-apagar": async (el) => {
    const bloco = el.closest(".cc-anexos");
    if (!el.dataset.id) { pendentes.splice(Number(el.dataset.i), 1); return redesenhar(bloco); }
    if (!confirmarDuplo(el, "Remover?")) return;
    const a = estado.d.anexos.find((x) => x.id === el.dataset.id);
    const { error } = await sb.from("anexos").delete().eq("id", a.id);
    if (error) return avisar("Não consegui remover.");
    if (a.caminho) await sb.storage.from(BALDE).remove([a.caminho]);
    estado.d.anexos = estado.d.anexos.filter((x) => x.id !== a.id);
    redesenhar(bloco); avisar("Anexo removido.");
  },
});
// Foto escolhida (câmera ou fototeca)
document.addEventListener("change", async (e) => {
  const inp = e.target;
  if (!inp.matches?.("[data-anexo-arquivo]") || !inp.files?.[0]) return;
  const bloco = inp.closest(".cc-anexos");
  const arquivo = inp.files[0]; inp.value = "";
  avisar("Preparando a foto…");
  const blob = await reduzir(arquivo).catch(() => null);
  if (!blob) return avisar("Não consegui ler essa imagem.");
  const caminho = await enviarFoto(blob);
  if (!caminho) return;
  const a = { tipo: "foto", caminho, nome: (arquivo.name || "Foto").replace(/\.[a-z0-9]+$/i, "").slice(0, 120) };
  if (bloco.dataset.anexoId) { if (!(await gravar(bloco.dataset.anexoTipo, bloco.dataset.anexoId, a))) return; }
  else pendentes.push({ ...a, previa: URL.createObjectURL(blob) });
  redesenhar(bloco); avisar("Foto anexada.");
});

document.addEventListener("folha-aberta", (e) => carregarMiniaturas(e.detail));
