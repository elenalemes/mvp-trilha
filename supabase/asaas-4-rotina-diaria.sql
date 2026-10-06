-- ----------------------------------------------------------------------------
-- Asaas · Parte 4 · A rotina diária de cobrança
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `asaas-3-avisos-de-pagamento.sql`. Rodar inteiro no SQL
-- Editor. Não mexe em dado nenhum: cria a lista do que cobrar, o registro de
-- cada execução e o telefone que recebe os alertas.
--
-- A ROTINA RODA TODO DIA (6h), NÃO SÓ NO DIA 1. Ela cobra toda parcela que:
--
--   * é de trilha em andamento E liberada (`cobranca_automatica`);
--   * está em aberto, nunca foi cobrada e tem a divisão feita;
--   * já está no mês de cobrança — do dia de geração (1) do mês do vencimento
--     em diante;
--   * ainda não venceu (o Asaas não aceita vencimento no passado).
--
-- Na prática, tudo sai no dia 1. Mas se o dia 1 falhar, o dia 2 encontra a
-- parcela ainda sem cobrança e gera — sem duplicar, porque a parcela cobrada
-- deixa de aparecer na lista, e o Asaas é consultado antes de criar.
--
-- Parcela que VENCEU sem cobrança não é cobrada sozinha: vira alerta para a
-- Trilha decidir (gerar com outra data, receber por fora, etc.).
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · Para onde vão os alertas
-- ----------------------------------------------------------------------------

alter table public.config_financeiro
  add column if not exists telefone_alerta text;

comment on column public.config_financeiro.telefone_alerta is
  'WhatsApp de quem recebe os alertas das rotinas (falha de cobrança, parcela vencida sem cobrança, chave Pix com problema). Só números, com DDD.';


-- ----------------------------------------------------------------------------
-- PARTE 2 · O registro de cada execução
--
-- Toda vez que a rotina roda, fica uma linha com o que fez. É onde se olha
-- primeiro quando alguém pergunta "a cobrança do mês saiu?".
-- ----------------------------------------------------------------------------

create table if not exists public.rotina_execucao (
  id            uuid primary key default gen_random_uuid(),
  rotina        text not null check (rotina in ('cobranca', 'repasse')),
  data_ref      date not null,
  iniciou_em    timestamptz not null default now(),
  terminou_em   timestamptz,
  resumo        jsonb,
  erro          text
);

create index if not exists rotina_execucao_recente on public.rotina_execucao (iniciou_em desc);

comment on table public.rotina_execucao is
  'Uma linha por execução das rotinas automáticas (cobrança do dia 1, repasse do dia 14), com o resumo do que foi feito.';

alter table public.rotina_execucao enable row level security;
grant select on public.rotina_execucao to authenticated;
grant all on public.rotina_execucao to service_role;

drop policy if exists rotina_execucao_admin on public.rotina_execucao;
create policy rotina_execucao_admin on public.rotina_execucao
  for select to authenticated
  using (public.eh_admin_trilha());


-- ----------------------------------------------------------------------------
-- PARTE 3 · O que cobrar hoje
-- ----------------------------------------------------------------------------

create or replace function public.parcelas_para_cobrar(p_hoje date, p_limite integer default 200)
returns table (parcela_id uuid, negocio_id uuid, numero integer, vencimento date)
language sql stable security definer set search_path = public as $$
  select p.id, p.negocio_id, p.numero, p.vencimento
    from public.parcela p
    join public.negocio n on n.id = p.negocio_id
   where n.status = 'em_jornada'
     and n.cobranca_automatica
     and p.status = 'aberta'
     and p.asaas_cobranca_id is null
     and p.valor_vendedor is not null
     and p.vencimento >= p_hoje
     and p_hoje >= make_date(extract(year from p.vencimento)::int,
                             extract(month from p.vencimento)::int,
                             (select dia_geracao from public.config_financeiro))
   order by p.vencimento, p.negocio_id, p.numero
   limit p_limite;
$$;

-- Venceu e nunca foi cobrada: não se cobra sozinha, vira alerta.
create or replace function public.parcelas_vencidas_sem_cobranca(p_hoje date)
returns table (parcela_id uuid, negocio_id uuid, numero integer, vencimento date, unidade text)
language sql stable security definer set search_path = public as $$
  select p.id, p.negocio_id, p.numero, p.vencimento, i.identificacao
    from public.parcela p
    join public.negocio n on n.id = p.negocio_id
    join public.imovel  i on i.id = n.imovel_id
   where n.status = 'em_jornada'
     and n.cobranca_automatica
     and p.status = 'aberta'
     and p.asaas_cobranca_id is null
     and p.vencimento < p_hoje
   order by p.vencimento;
$$;

revoke all on function public.parcelas_para_cobrar(date, integer)        from public, anon, authenticated;
revoke all on function public.parcelas_vencidas_sem_cobranca(date)       from public, anon, authenticated;
grant execute on function public.parcelas_para_cobrar(date, integer)     to service_role;
grant execute on function public.parcelas_vencidas_sem_cobranca(date)    to service_role;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'rotina de cobrança' as item,
       format('cobrança %s · alertas para %s',
              case when cobranca_ligada then 'LIGADA' else 'desligada (ligue para testar)' end,
              coalesce(telefone_alerta, 'NINGUÉM — preencha telefone_alerta')) as situacao
  from public.config_financeiro

union all

select 'parcelas que seriam cobradas hoje',
       count(*)::text
  from public.parcelas_para_cobrar((now() at time zone 'America/Sao_Paulo')::date);
