// Web Push sem bibliotecas: VAPID (RFC 8292) e criptografia aes128gcm (RFC 8291), só com WebCrypto.
const enc = new TextEncoder();
export const b64u = (buf) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const deB64u = (s) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
};
const juntar = (...partes) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0; for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt, ikm, info, bits) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bits));
}

// Par de chaves VAPID novo, exportado como JWK (fica guardado só no servidor)
export async function gerarVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return await crypto.subtle.exportKey("jwk", par.privateKey);
}
// Chave pública no formato que o navegador espera (ponto não comprimido, base64url)
export const chavePublica = (jwk) => b64u(juntar(new Uint8Array([4]), deB64u(jwk.x), deB64u(jwk.y)));

async function jwtVapid(jwk, aud, sub) {
  const chave = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cab = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const assin = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, enc.encode(`${cab}.${corpo}`));
  return `${cab}.${corpo}.${b64u(assin)}`;
}

// Cifra a mensagem para a inscrição (p256dh e auth do navegador)
export async function cifrar(texto, p256dh, auth) {
  const uaPub = deB64u(p256dh), segredo = deB64u(auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(segredo, compartilhado, juntar(enc.encode("WebPush: info\0"), uaPub, asPub), 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 96);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, juntar(enc.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return juntar(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}

// Envia; devolve o status HTTP do serviço de push (201 = entregue; 404/410 = inscrição morta)
export async function enviar(inscricao, mensagem, jwk, sub) {
  const url = new URL(inscricao.endpoint);
  const jwt = await jwtVapid(jwk, url.origin, sub);
  const corpo = await cifrar(JSON.stringify(mensagem), inscricao.p256dh, inscricao.auth);
  const r = await fetch(inscricao.endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${jwt}, k=${chavePublica(jwk)}`, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "normal" },
    body: corpo,
  });
  return { status: r.status, texto: r.ok ? "" : (await r.text()).slice(0, 200) };
}
