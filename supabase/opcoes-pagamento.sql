-- ----------------------------------------------------------------------------
-- Sprint 2.1 · Opções de pagamento
-- ----------------------------------------------------------------------------
-- As condições de entrada parcelada são acordadas no comercial entre a Trilha
-- e a incorporadora, e valem para TODOS os imóveis dela. Por isso a regra mora
-- na incorporadora, não no imóvel: cadastrar formato de pagamento unidade por
-- unidade não escala.
--
-- Aqui não existe dinheiro — só percentual e prazo. Os números aparecem na
-- ficha de cada imóvel, porque dependem do valor daquele imóvel.
--
-- Três campos são livres. Todo o resto é consequência e não se digita:
--   pago durante a Trilha = entrada - ato
--   saldo a financiar     = 100% - entrada
--
-- Rodar inteiro no SQL Editor do Supabase. Sem `rollback` no meio: script que
-- altera o banco não se mistura com simulação.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · A tabela
-- ----------------------------------------------------------------------------

create table if not exists public.opcao_pagamento (
  id                 uuid primary key default gen_random_uuid(),
  incorporadora_id   uuid not null references public.incorporadora (id) on delete cascade,

  -- Numera o card na tela ("Opção 1", "Opção 2"…). É também o que limita a
  -- quatro: não existe ordem 5, e o unique lá embaixo impede repetir.
  ordem              smallint not null check (ordem between 1 and 4),

  -- Percentuais sobre o valor do imóvel reajustado pelo prazo desta opção.
  percentual_entrada numeric(5, 2) not null
    check (percentual_entrada > 0 and percentual_entrada <= 100),

  -- Ato: parte da entrada paga no fechamento, para reduzir a parcela.
  percentual_ato     numeric(5, 2) not null default 0
    check (percentual_ato >= 0),

  -- "Tempo de Trilha": em quantos meses a entrada é parcelada.
  prazo_meses        smallint not null check (prazo_meses between 12 and 36),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- O ato sai de dentro da entrada. Se passar dela, o que se paga durante a
  -- Trilha ficaria negativo.
  constraint ato_cabe_na_entrada check (percentual_ato <= percentual_entrada),

  constraint opcao_ordem_unica unique (incorporadora_id, ordem)
);

drop trigger if exists opcao_pagamento_touch on public.opcao_pagamento;
create trigger opcao_pagamento_touch before update on public.opcao_pagamento
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 2 · Salvar as opções de uma vez só
--
-- A tela edita as quatro opções juntas, então salvar é "substituir a lista".
-- Fazer isso em duas chamadas (apagar e depois inserir) deixaria a
-- incorporadora sem nenhuma opção se a segunda falhasse. Dentro de uma função
-- as duas coisas acontecem na mesma transação: ou vale tudo, ou nada muda.
--
-- `security invoker` de propósito: a função roda com a permissão de quem
-- chamou, então as regras de acesso da Parte 3 continuam valendo. Uma
-- incorporadora não consegue usá-la para mexer nas opções de outra.
--
-- Mandar uma quinta opção estoura o check de `ordem` e desfaz tudo.
-- ----------------------------------------------------------------------------

create or replace function public.salvar_opcoes_pagamento(
  p_incorporadora uuid,
  p_opcoes        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.opcao_pagamento where incorporadora_id = p_incorporadora;

  insert into public.opcao_pagamento
    (incorporadora_id, ordem, percentual_entrada, percentual_ato, prazo_meses)
  select
    p_incorporadora,
    t.i::smallint,
    (t.o ->> 'percentual_entrada')::numeric,
    (t.o ->> 'percentual_ato')::numeric,
    (t.o ->> 'prazo_meses')::smallint
  from jsonb_array_elements(coalesce(p_opcoes, '[]'::jsonb)) with ordinality as t(o, i);
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 3 · Acesso
--
-- Admin da Trilha cadastra e edita. A incorporadora, por enquanto, só lê as
-- suas — a tela de edição dela é a fatia 2.4, e a policy vira `for all` lá.
-- ----------------------------------------------------------------------------

alter table public.opcao_pagamento enable row level security;

drop policy if exists opcao_pagamento_admin on public.opcao_pagamento;
create policy opcao_pagamento_admin on public.opcao_pagamento
  for all to authenticated
  using (public.eh_admin_trilha()) with check (public.eh_admin_trilha());

drop policy if exists opcao_pagamento_propria on public.opcao_pagamento;
create policy opcao_pagamento_propria on public.opcao_pagamento
  for select to authenticated
  using (incorporadora_id = public.minha_incorporadora_id());

-- Permissão vem antes da policy: sem isto o Postgres barra na porta com
-- "42501 permission denied" e nem chega a avaliar as regras acima.
grant select, insert, update, delete on public.opcao_pagamento to authenticated;
grant all    on public.opcao_pagamento to service_role;
grant execute on function public.salvar_opcoes_pagamento(uuid, jsonb) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'tabela criada' as o_que,
       string_agg(column_name, ', ' order by ordinal_position) as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'opcao_pagamento'
union all
select 'travas',
       string_agg(conname, ', ' order by conname)
from pg_constraint
where conrelid = 'public.opcao_pagamento'::regclass and contype in ('c', 'u')
union all
select 'opções cadastradas', coalesce(count(*)::text, '0')
from public.opcao_pagamento;
