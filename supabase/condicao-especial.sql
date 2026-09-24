-- ----------------------------------------------------------------------------
-- Sprint 4.6 · Condição especial e comissão dividida entre corretores
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `negociacao-pela-trilha.sql`.
--
-- Quando a Trilha abre a negociação pelo painel, ela pode fugir das opções
-- cadastradas. DECIDIDO COM A ELENA (23/set):
--
--   * Na CONDIÇÃO ESPECIAL a Trilha define entrada, ato e prazo, o valor do
--     imóvel (desconto só nesta venda — o cadastro da unidade não muda) e o
--     percentual total de comissão. A conta continua a mesma de sempre
--     (`calcularCondicao`); só as entradas mudam.
--   * A incorporadora NÃO aprova: a condição fica marcada como especial, à
--     vista dela também. O motivo é opcional.
--   * A COMISSÃO pode ser dividida entre vários corretores cadastrados, em
--     PONTOS DO VALOR FINAL DO IMÓVEL (ex.: 3,6% + 2,4% de 6%). O que os
--     corretores não levam fica com a Trilha.
--   * Um corretor é o PRINCIPAL: continua sendo o `parceiro_id` da proposta e
--     do negócio, e por isso faz as tarefas do corretor, vê os documentos do
--     comprador e recebe os avisos — exatamente como hoje. Os outros só
--     ACOMPANHAM: leem a proposta, o negócio e o checklist, e veem a própria
--     comissão.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · A marca da condição especial
-- ----------------------------------------------------------------------------

alter table public.proposta
  add column if not exists condicao_especial boolean not null default false,
  add column if not exists motivo_condicao   text,
  add column if not exists valor_tabela      numeric(14,2);

comment on column public.proposta.condicao_especial is
  'Condição definida à mão pela Trilha, fora das opções cadastradas.';
comment on column public.proposta.valor_tabela is
  'Valor da unidade no cadastro no dia. Difere de valor_imovel quando houve desconto na condição especial.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · Os corretores da proposta, e a parte de cada um
--
-- Os números ficam congelados aqui, como o resto da proposta. `percentual` é
-- em pontos do valor final (6 = 6% do valor final do imóvel).
--
-- Só existe linha quando a comissão é dividida. Proposta com um corretor só
-- continua como sempre foi, sem linha aqui.
-- ----------------------------------------------------------------------------

create table if not exists public.proposta_corretor (
  proposta_id   uuid not null references public.proposta (id) on delete cascade,
  parceiro_id   uuid not null references public.parceiro (id) on delete restrict,
  principal     boolean not null default false,
  percentual    numeric(5,2) not null check (percentual > 0),
  valor_total   numeric(14,2) not null,
  valor_mensal  numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  primary key (proposta_id, parceiro_id)
);

comment on table public.proposta_corretor is
  'Divisão da comissão entre corretores. O principal é o parceiro_id da proposta.';

create unique index if not exists proposta_corretor_um_principal
  on public.proposta_corretor (proposta_id) where principal;


-- ----------------------------------------------------------------------------
-- PARTE 3 · Os corretores que acompanham
--
-- Uma função só responde "este corretor está neste negócio?". `security
-- definer` para as policies não dependerem umas das outras.
-- ----------------------------------------------------------------------------

create or replace function public.corretor_da_proposta(p_proposta uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposta_corretor pc
    where pc.proposta_id = p_proposta and pc.parceiro_id = public.meu_parceiro_id()
  );
$$;

create or replace function public.corretor_do_negocio(p_negocio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.negocio n
    join public.proposta_corretor pc on pc.proposta_id = n.proposta_id
    where n.id = p_negocio and pc.parceiro_id = public.meu_parceiro_id()
  );
$$;

revoke all on function public.corretor_da_proposta(uuid) from public;
revoke all on function public.corretor_do_negocio(uuid)  from public;
grant execute on function public.corretor_da_proposta(uuid) to authenticated;
grant execute on function public.corretor_do_negocio(uuid)  to authenticated;

-- Leitura para quem acompanha. Escrita não: as policies de escrita continuam
-- olhando só o `parceiro_id` (o principal).
drop policy if exists proposta_corretor_acompanha on public.proposta;
create policy proposta_corretor_acompanha on public.proposta
  for select to authenticated
  using (public.corretor_da_proposta(id));

drop policy if exists negocio_corretor_acompanha on public.negocio;
create policy negocio_corretor_acompanha on public.negocio
  for select to authenticated
  using (public.corretor_da_proposta(proposta_id));

drop policy if exists checklist_corretor_acompanha on public.checklist_item;
create policy checklist_corretor_acompanha on public.checklist_item
  for select to authenticated
  using (public.corretor_do_negocio(negocio_id));

-- A tabela da divisão: a Trilha vê tudo; cada corretor vê SÓ a própria parte.
alter table public.proposta_corretor enable row level security;
grant select on public.proposta_corretor to authenticated;
grant all    on public.proposta_corretor to service_role;

drop policy if exists proposta_corretor_admin on public.proposta_corretor;
create policy proposta_corretor_admin on public.proposta_corretor
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists proposta_corretor_propria on public.proposta_corretor;
create policy proposta_corretor_propria on public.proposta_corretor
  for select to authenticated
  using (parceiro_id = public.meu_parceiro_id());


-- ----------------------------------------------------------------------------
-- PARTE 4 · O que a incorporadora vê
--
-- A mesma view, com a marca de condição especial e o motivo. A divisão entre
-- corretores ela não vê: para ela a comissão é um número só, como sempre.
-- ----------------------------------------------------------------------------

drop view if exists public.proposta_da_incorporadora;

create view public.proposta_da_incorporadora
with (security_invoker = false) as
select
  p.id, p.codigo, p.status, p.imovel_id, p.empreendimento_id, p.incorporadora_id,
  i.identificacao as unidade,
  e.nome as empreendimento,
  coalesce(pa.nome, 'Venda direta Trilha') as parceiro,
  pa.creci as parceiro_creci,
  case when p.status = 'aceita' then c.nome end as comprador_nome,
  p.valor_imovel, p.prazo_meses, p.percentual_ato, p.percentual_entrada, p.percentual_comissao,
  p.valor_base, p.valor_ato, p.valor_parcela, p.valor_entrada, p.valor_saldo, p.condicao,
  p.condicao_especial, p.motivo_condicao, p.valor_tabela,
  p.decidida_em, p.created_at
from public.proposta p
  join public.imovel          i  on i.id  = p.imovel_id
  join public.empreendimento  e  on e.id  = p.empreendimento_id
  left join public.parceiro   pa on pa.id = p.parceiro_id
  join public.comprador       c  on c.id  = p.comprador_id
where p.incorporadora_id = public.minha_incorporadora_id();

comment on view public.proposta_da_incorporadora is
  'O que a incorporadora enxerga das propostas das unidades dela. Sem CPF, e-mail ou telefone; o nome só depois de aceita.';

grant select on public.proposta_da_incorporadora to authenticated;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'colunas da condição especial' as item,
       string_agg(column_name, ', ' order by column_name) as situacao
from information_schema.columns
where table_schema = 'public' and table_name = 'proposta'
  and column_name in ('condicao_especial', 'motivo_condicao', 'valor_tabela')
union all
select 'tabela proposta_corretor',
       coalesce((select 'existe' from information_schema.tables
                 where table_schema = 'public' and table_name = 'proposta_corretor'), 'NÃO EXISTE')
union all
select 'policies de quem acompanha',
       string_agg(policyname, ' | ' order by policyname)
from pg_policies
where policyname in ('proposta_corretor_acompanha', 'negocio_corretor_acompanha', 'checklist_corretor_acompanha');
