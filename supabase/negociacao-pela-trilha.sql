-- ----------------------------------------------------------------------------
-- Sprint 4.5 · A Trilha inicia a negociação por dentro do sistema
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `documentos-conjuge-opcionais.sql`.
--
-- Até aqui todo negócio nascia de uma proposta enviada pelo simulador, e toda
-- proposta tinha um corretor. Agora a Trilha também abre negociação pelo
-- painel — o corretor ligou em vez de usar o simulador, ou o comprador chegou
-- direto pela IA do WhatsApp.
--
-- DECIDIDO COM A ELENA (23/set):
--
--   * A Trilha escolhe um parceiro já cadastrado da incorporadora OU marca
--     VENDA DIRETA, sem corretor. Por isso `parceiro_id` deixa de ser
--     obrigatório na proposta e no negócio.
--   * Na venda direta a comissão FICA COM A TRILHA. Os números congelados não
--     mudam: a parcela do comprador e o que a incorporadora recebe são os
--     mesmos; só muda quem recebe a parte da comissão. Por isso nenhuma conta
--     muda aqui — venda direta é `parceiro_id` nulo, e mais nada.
--   * Iniciar pela Trilha JÁ ABRE O NEGÓCIO. A proposta nasce e é aceita na
--     mesma ação, pela mesma função `aceitar_proposta` de sempre — que trava a
--     unidade, invalida as concorrentes e gera o checklist.
--
-- As tarefas do checklist que são do corretor continuam marcadas como dele
-- (`ator = 'parceiro'`): é essa marca que esconde os documentos do comprador
-- da incorporadora. Sem corretor, quem as faz é a Trilha, que já pode mexer em
-- tudo; a tela só troca o nome exibido.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O corretor passa a ser opcional
-- ----------------------------------------------------------------------------

alter table public.proposta alter column parceiro_id drop not null;
alter table public.negocio  alter column parceiro_id drop not null;

comment on column public.proposta.parceiro_id is
  'Quem vendeu. Nulo = venda direta da Trilha (a comissão fica com a Trilha).';
comment on column public.negocio.parceiro_id is
  'Quem vendeu. Nulo = venda direta da Trilha.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · De onde a proposta veio
-- ----------------------------------------------------------------------------

alter table public.proposta
  add column if not exists origem text not null default 'simulador'
    check (origem in ('simulador', 'trilha')),
  add column if not exists criada_por uuid references public.conta (id) on delete set null;

comment on column public.proposta.origem is
  'simulador = enviada por corretor na página pública; trilha = aberta pela Trilha no painel.';


-- ----------------------------------------------------------------------------
-- PARTE 3 · O que a incorporadora vê
--
-- A view juntava o parceiro com `join`, que some com a linha quando não há
-- parceiro: a incorporadora deixaria de ver a proposta de uma venda direta.
-- Agora é `left join`, e o nome vira "Venda direta Trilha".
-- ----------------------------------------------------------------------------

create or replace view public.proposta_da_incorporadora
with (security_invoker = false) as
select
  p.id,
  p.codigo,
  p.status,
  p.imovel_id,
  p.empreendimento_id,
  p.incorporadora_id,
  i.identificacao      as unidade,
  e.nome               as empreendimento,
  coalesce(pa.nome, 'Venda direta Trilha') as parceiro,
  pa.creci             as parceiro_creci,

  -- Só o nome, e só depois de aceita.
  case when p.status = 'aceita' then c.nome end as comprador_nome,

  p.valor_imovel,
  p.prazo_meses,
  p.percentual_ato,
  p.percentual_entrada,
  p.percentual_comissao,
  p.valor_base,
  p.valor_ato,
  p.valor_parcela,
  p.valor_entrada,
  p.valor_saldo,
  p.condicao,

  p.decidida_em,
  p.created_at
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

select 'corretor opcional na proposta' as item,
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'proposta' and column_name = 'parceiro_id') as situacao
union all
select 'corretor opcional no negócio',
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'negocio' and column_name = 'parceiro_id')
union all
select 'coluna origem',
       coalesce((select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'proposta' and column_name = 'origem'), 'NÃO EXISTE')
union all
select 'view da incorporadora com venda direta',
       case when pg_get_viewdef('public.proposta_da_incorporadora'::regclass) ilike '%left join%'
            then 'ok' else 'AINDA COM JOIN' end;
