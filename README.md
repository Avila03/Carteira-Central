# Carteira Central

Aplicativo pessoal de gestão financeira (PWA para iPhone).

- Front-end estático (HTML, CSS e JavaScript sem etapa de build), publicado na Vercel.
- Dados, login e integração com o Meu Pluggy no Supabase (projeto "Financas Pessoais").
- As credenciais da Pluggy ficam apenas nos segredos das Edge Functions do Supabase, nunca neste repositório.

A chave `sb_publishable_...` em `app.js` é pública por natureza; a proteção dos dados é feita por login e Row Level Security.
