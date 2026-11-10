# Carteira Central

Aplicativo pessoal de gestão financeira (PWA para iPhone).

- Front-end estático (HTML, CSS e JavaScript sem etapa de build), publicado na Vercel.
- Dados, login e integração com o Meu Pluggy no Supabase (projeto "Financas Pessoais").
- As credenciais da Pluggy ficam apenas nos segredos das Edge Functions do Supabase, nunca neste repositório.

A chave `sb_publishable_...` em `app.js` é pública por natureza; a proteção dos dados é feita por login e Row Level Security.

## Estrutura

- `index.html`, `css/` (tokens e componentes do kit de identidade + `app.css`), `assets/` (vetores e ícones do kit).
- `js/app.js` rotas, casca e navegação · `js/base.js` utilidades e componentes · `js/dados.js` leitura e gravação.
- `js/calculos.js` regras financeiras puras (disponível, faturas previstas, acertos, consumo e caixa).
- `js/tela-*.js` telas: Início, Cartões, Planejar e Mais (Contas, Acertos, Assinaturas, Lançamentos, Revisão, Relatórios, Conexões, Configurações).
- `supabase/functions/pluggy-sincronizar` sincronização diária com o Meu Pluggy.

## Testes

`node testes/calculos.test.mjs` roda os casos de compra parcelada, pagamento de fatura, transferência própria, salário vinculado, racha com recebimento parcial e importação repetida.
