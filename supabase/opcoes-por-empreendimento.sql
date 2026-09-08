-- ----------------------------------------------------------------------------
-- Sprint 2.5 · Empreendimento pode ter condições próprias
-- ----------------------------------------------------------------------------
-- Até aqui as opções eram só da incorporadora e valiam para tudo. Agora a
-- lista da incorporadora é o PADRÃO, e um empreendimento pode ter a sua.
--
-- A herança é TUDO OU NADA: se o empreendimento tem qualquer opção própria, a
-- lista dele substitui a da incorporadora inteira. Nunca mistura as duas —
-- misturar seria impossível de explicar ao corretor e pior ainda de conferir.
--
-- Nada precisa ser migrado: as linhas que já existem ficam com
-- `empreendimento_id` nulo e viram o padrão da incorporadora, que é o que
-- elas já eram na prática.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · A coluna
--
-- `incorporadora_id` continua obrigatório mesmo nas linhas de empreendimento.
-- É redundante de propósito: é ele que as regras de acesso usam, então elas
-- não mudam nem uma linha por causa desta migração.
-- ----------------------------------------------------------------------------

alter table public.opcao_pagamento
  add column if not exists empreendimento_id uuid;

comment on column public.opcao_pagamento.empreendimento_id is
  'Nulo = padrão da incorporadora, vale para todos os imóveis dela. Preenchido = condição própria daquele empreendimento, que substitui o padrão inteiro.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · O empreendimento tem que ser da mesma incorporadora
--
-- Um `references empreendimento (id)` simples deixaria passar uma opção da
-- incorporadora A apontando para um empreendimento da B. A chave composta
-- fecha isso no banco, sem trigger: só existe par (empreendimento,
-- incorporadora) que realmente existe na tabela de empreendimentos.
--
-- Com `empreendimento_id` nulo a checagem não se aplica, que é justamente o
-- comportamento desejado para as linhas de padrão.
-- ----------------------------------------------------------------------------

alter table public.opcao_pagamento
  drop constraint if exists opcao_empreendimento_da_incorporadora;

alter table public.empreendimento
  drop constraint if exists empreendimento_id_incorporadora;

alter table public.empreendimento
  add constraint empreendimento_id_incorporadora unique (id, incorporadora_id);

alter table public.opcao_pagamento
  add constraint opcao_empreendimento_da_incorporadora
  foreign key (empreendimento_id, incorporadora_id)
  references public.empreendimento (id, incorporadora_id) on delete cascade;


-- ----------------------------------------------------------------------------
-- PARTE 3 · Teto de quatro em cada nível
--
-- O unique antigo era (incorporadora, ordem) e passaria a brigar com as
-- linhas de empreendimento. Viram dois índices parciais: quatro no padrão da
-- incorporadora, e quatro em cada empreendimento.
-- ----------------------------------------------------------------------------

alter table public.opcao_pagamento drop constraint if exists opcao_ordem_unica;

create unique index if not exists opcao_padrao_ordem_unica
  on public.opcao_pagamento (incorporadora_id, ordem)
  where empreendimento_id is null;

create unique index if not exists opcao_empreendimento_ordem_unica
  on public.opcao_pagamento (empreendimento_id, ordem)
  where empreendimento_id is not null;


-- ----------------------------------------------------------------------------
-- PARTE 4 · Salvar com escopo
--
-- Sem `p_empreendimento`, salva o padrão da incorporadora. Com ele, salva as
-- condições próprias daquele empreendimento. Continua sendo substituição da
-- lista inteira, numa transação só, e continua `security invoker` para as
-- regras de acesso valerem.
--
-- O parâmetro tem valor padrão, então chamadas com dois argumentos continuam
-- funcionando — mas a versão de dois argumentos precisa sair antes, senão o
-- Postgres não sabe qual das duas chamar.
-- ----------------------------------------------------------------------------

drop function if exists public.salvar_opcoes_pagamento(uuid, jsonb);

create or replace function public.salvar_opcoes_pagamento(
  p_incorporadora  uuid,
  p_opcoes         jsonb,
  p_empreendimento uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_empreendimento is null then
    delete from public.opcao_pagamento
    where incorporadora_id = p_incorporadora and empreendimento_id is null;
  else
    delete from public.opcao_pagamento
    where empreendimento_id = p_empreendimento;
  end if;

  insert into public.opcao_pagamento
    (incorporadora_id, empreendimento_id, ordem,
     percentual_entrada, percentual_ato, prazo_meses)
  select
    p_incorporadora,
    p_empreendimento,
    t.i::smallint,
    (t.o ->> 'percentual_entrada')::numeric,
    (t.o ->> 'percentual_ato')::numeric,
    (t.o ->> 'prazo_meses')::smallint
  from jsonb_array_elements(coalesce(p_opcoes, '[]'::jsonb)) with ordinality as t(o, i);
end;
$$;

grant execute on function public.salvar_opcoes_pagamento(uuid, jsonb, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'opções que viraram padrão da incorporadora' as o_que, count(*)::text as resultado
from public.opcao_pagamento where empreendimento_id is null
union all
select 'opções próprias de empreendimento', count(*)::text
from public.opcao_pagamento where empreendimento_id is not null
union all
select 'índices de unicidade',
       coalesce(string_agg(indexname, ', ' order by indexname), 'NENHUM')
from pg_indexes
where schemaname = 'public' and tablename = 'opcao_pagamento' and indexname like '%ordem%';
