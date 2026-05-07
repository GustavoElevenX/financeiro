-- Reset completo das tabelas publicas do Analista Financeiro.
-- Execute este arquivo no Supabase SQL Editor antes de executar supabase/schema.sql.
-- Atencao: isto apaga os dados financeiros salvos no banco deste projeto.

drop table if exists ai_insights cascade;
drop table if exists scenarios cascade;
drop table if exists card_purchases cascade;
drop table if exists credit_cards cascade;
drop table if exists recurring_items cascade;
drop table if exists debts cascade;
drop table if exists planned_items cascade;
drop table if exists day_reviews cascade;
drop table if exists financial_months cascade;
drop table if exists transactions cascade;
drop table if exists app_settings cascade;
drop table if exists income_sources cascade;
drop table if exists projects cascade;
drop table if exists categories cascade;
drop table if exists accounts cascade;
drop table if exists family_members cascade;
drop table if exists classification_rules cascade;
drop table if exists profiles cascade;
