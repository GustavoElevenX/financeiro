# Analista Financeiro Pessoal e Familiar com IA

Plataforma web em React, TypeScript, Vite, Tailwind CSS, Recharts, Dexie/IndexedDB, Supabase e DeepSeek.

## Rodar localmente

```bash
npm install
npm run dev
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEEPSEEK_API_KEY=
VITE_DEEPSEEK_MODEL=deepseek-chat
```

Sem essas chaves, a aplicação funciona em modo local-first com dados de demonstração e IA demonstrativa.

## Banco de dados

O contrato SQL principal está em `supabase/schema.sql`.

## Funcionalidades do MVP

- Dashboard executivo com renda atual, renda necessária, gap, saldo livre, saldo reservado, cartão, reserva e score.
- Onboarding inicial.
- Contas e caixinhas.
- Lançamento rápido com parser.
- Importação de extrato colado com tela de revisão.
- Transações com competência mensal.
- Módulos de renda, despesas, cartão, metas, reserva, bebê, casa, carro e investimentos.
- Fechamento por dias revisados e regularização de mês incompleto.
- Simulador de decisões.
- IA financeira com DeepSeek quando configurado.
- Persistência local-first via Dexie/IndexedDB.
