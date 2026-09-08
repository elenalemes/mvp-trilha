-- ----------------------------------------------------------------------------
-- Valor reajustado do imóvel
-- ----------------------------------------------------------------------------
-- Na Trilha o imóvel sofre reajuste de 0,42% ao mês, compostos, ao longo dos
-- 24 meses padrão da jornada. O valor no fim do caminho não é digitado: é
-- consequência do valor de hoje.
--
-- Por isso é uma COLUNA GERADA. O banco recalcula sozinho a cada gravação de
-- `valor`, e ninguém consegue escrever um número divergente nela — nem o
-- painel, nem a importação de estoque, nem um insert manual.
--
-- Espelho em código: `src/lib/trilha.ts`. Se a taxa ou o prazo mudarem,
-- mudam nos dois lugares.
--
-- Rodar inteiro no SQL Editor do Supabase. Não tem rollback aqui de
-- propósito: script que altera o banco não se mistura com simulação.
-- ----------------------------------------------------------------------------

alter table public.imovel
  add column if not exists valor_reajustado numeric(14, 2)
  generated always as (round(valor * power(1.0042::numeric, 24), 2)) stored;

comment on column public.imovel.valor_reajustado is
  'Valor ao fim da jornada: 0,42% a.m. compostos por 24 meses. Coluna gerada — não escrever nela. Espelha src/lib/trilha.ts.';


-- ---------------------------------------------------------------- conferência

-- 1. A conta bate com o exemplo combinado? Tem que dar 552910.98.
select round(500000::numeric * power(1.0042::numeric, 24), 2) as exemplo_500_mil;

-- 2. Como ficaram os imóveis já cadastrados.
select identificacao, valor, valor_reajustado
from public.imovel
order by identificacao;
