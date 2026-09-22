-- ----------------------------------------------------------------------------
-- Sprint 3.3 · De onde veio o parceiro
-- ----------------------------------------------------------------------------
-- Um corretor sem cadastro que envia proposta pelo simulador vira parceiro na
-- hora — PENDENTE, sem login. Só que na lista ele ficaria idêntico a um
-- parceiro que a incorporadora cadastrou e depois desligou: os dois aparecem
-- como "Inativo, sem acesso criado".
--
-- São situações opostas. Um está esperando alguém da Trilha aprovar; o outro
-- já foi aprovado e saiu. Se a lista não separa os dois, ninguém aprova
-- ninguém — é o tipo de fila que morre por ser invisível.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'parceiro_origem') then
    create type public.parceiro_origem as enum (
      'cadastro',   -- a Trilha ou a incorporadora cadastrou
      'proposta'    -- nasceu de uma proposta do simulador, aguardando aprovação
    );
  end if;
end $$;

alter table public.parceiro
  add column if not exists origem public.parceiro_origem not null default 'cadastro';

comment on column public.parceiro.origem is
  'Como este parceiro entrou. ''proposta'' + ativo=false + conta_id nulo = fila de aprovação.';

-- A fila de aprovação é uma consulta frequente e sempre curta.
create index if not exists parceiro_pendente_idx
  on public.parceiro (incorporadora_id)
  where origem = 'proposta' and not ativo;

-- O e-mail é o que o corretor digita para se identificar no simulador, então é
-- por ele que se procura se já existe cadastro.
create index if not exists parceiro_email_idx on public.parceiro (lower(email));


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'origens possíveis' as item,
       string_agg(e.enumlabel::text, ' | ' order by e.enumsortorder) as situacao
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'parceiro_origem'

union all

select 'coluna na tabela parceiro',
       coalesce(string_agg(column_name || ' (' || data_type || ')', ', '), 'NÃO EXISTE')
from information_schema.columns
where table_schema = 'public' and table_name = 'parceiro' and column_name = 'origem'

union all

select 'parceiros por origem',
       coalesce(string_agg(origem || ': ' || total, ' | '), 'nenhum parceiro cadastrado')
from (
  select origem::text as origem, count(*)::text as total
  from public.parceiro group by origem order by origem
) t;
