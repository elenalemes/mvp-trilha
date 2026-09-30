-- ----------------------------------------------------------------------------
-- Sprint 6.4 · As parcelas da jornada
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `negocio-vira-trilha.sql`.
--
-- O negócio virou trilha; agora o comprador paga a entrada em N meses, e é
-- isso que a Trilha acompanha durante dois anos. Até aqui o sistema sabia
-- QUANTO era a parcela (congelada na proposta) mas não sabia NADA sobre o que
-- já entrou — quem recebe é o Asaas, e não há integração.
--
-- DECIDIDO COM O MATHEUS (30/set):
--
--   * As parcelas viram TABELA, geradas quando a jornada começa, com
--     vencimento e valor congelados linha a linha. A Trilha marca paga; o
--     painel passa a dizer "em dia" ou "2 em atraso" em vez de mostrar um
--     calendário mudo.
--
--   * É aqui que o Asaas vai plugar. Quando a integração existir, ela só troca
--     QUEM marca — a tabela não muda. Por isso o valor e o vencimento são
--     colunas e não conta feita na hora: no dia em que o Asaas devolver uma
--     cobrança com outro valor, a diferença precisa ser visível, não
--     recalculada por cima.
--
--   * Marcar é SÓ DA TRILHA. A incorporadora e o corretor leem — é a liquidez
--     dela e a comissão dele —, mas quem concilia dinheiro é quem opera.
--
-- O ATO não vira parcela: ele é pago no fechamento, antes da jornada começar,
-- e já está congelado em `proposta.valor_ato`. O SALDO também não: é o
-- financiamento do 25º mês, que não é parcela de nada.
--
-- Rodar inteiro no SQL Editor do Supabase. É aditivo — não apaga nada.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · A tabela
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'parcela_status') then
    create type public.parcela_status as enum ('aberta', 'paga');
  end if;
end $$;

create table if not exists public.parcela (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   uuid not null references public.negocio (id) on delete cascade,

  /** 1 a prazo_meses. A primeira vence um mês depois da entrega das chaves. */
  numero       integer not null,
  vencimento   date not null,
  valor        numeric(14,2) not null,

  status       public.parcela_status not null default 'aberta',
  pago_em      timestamptz,
  pago_por     uuid references public.conta (id) on delete set null,
  observacao   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.parcela is
  'As parcelas da entrada, uma por mês da jornada. Valor e vencimento congelados na geração.';

-- Paga e a data andam juntas, nas duas direções: sem isto, desmarcar deixaria
-- uma data de pagamento pendurada numa parcela em aberto.
alter table public.parcela drop constraint if exists parcela_pago_em;
alter table public.parcela add constraint parcela_pago_em check (
  (status = 'paga') = (pago_em is not null)
);

create unique index if not exists parcela_unica on public.parcela (negocio_id, numero);
create index if not exists parcela_vencimento_idx
  on public.parcela (vencimento) where status = 'aberta';

drop trigger if exists parcela_touch on public.parcela;
create trigger parcela_touch before update on public.parcela
  for each row execute function public.touch_updated_at();


-- ----------------------------------------------------------------------------
-- PARTE 2 · Gerar as parcelas de um negócio
--
-- `on conflict do nothing` de propósito: reabrir uma tarefa devolve o negócio
-- para o fechamento e concluí-la de novo chama isto outra vez. As parcelas que
-- já existem — e o que já foi marcado como pago nelas — ficam intactas.
-- ----------------------------------------------------------------------------

create or replace function public.gerar_parcelas(p_negocio uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.parcela (negocio_id, numero, vencimento, valor)
  select n.id,
         g.n,
         (((n.jornada_inicio at time zone 'America/Sao_Paulo')::date
           + (g.n * interval '1 month'))::date),
         p.valor_parcela
    from public.negocio n
    join public.proposta p on p.id = n.proposta_id
   cross join generate_series(1, p.prazo_meses) as g(n)
   where n.id = p_negocio
     and n.jornada_inicio is not null
  on conflict (negocio_id, numero) do nothing;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 3 · A passagem passa a gerar as parcelas
--
-- Mesma função da 6.3, com uma linha a mais. Refeita inteira porque
-- `create or replace` substitui o corpo todo.
-- ----------------------------------------------------------------------------

create or replace function public.negocio_seque_o_checklist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_falta   boolean;
  v_status  public.negocio_status;
begin
  select status into v_status from public.negocio where id = new.negocio_id;

  if v_status not in ('em_fechamento', 'em_jornada') then
    return null;
  end if;

  select exists (
    select 1 from public.checklist_item i
    where i.negocio_id = new.negocio_id
      and i.status not in ('concluido', 'nao_se_aplica')
  ) into v_falta;

  if not v_falta and v_status = 'em_fechamento' then
    update public.negocio
       set status = 'em_jornada',
           jornada_inicio = coalesce(jornada_inicio, now())
     where id = new.negocio_id;

    -- Depois do update: a geração lê `jornada_inicio` da linha já gravada.
    perform public.gerar_parcelas(new.negocio_id);

  elsif v_falta and v_status = 'em_jornada' then
    update public.negocio
       set status = 'em_fechamento'
     where id = new.negocio_id;
  end if;

  return null;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 4 · Quem lê e quem marca
--
-- Ler é dos três: para a incorporadora isto é o cronograma de liquidez dela,
-- para o corretor é de onde sai a comissão mensal. Marcar é só da Trilha.
-- ----------------------------------------------------------------------------

alter table public.parcela enable row level security;

grant select, insert, update, delete on public.parcela to authenticated;
grant all on public.parcela to service_role;

drop policy if exists parcela_admin on public.parcela;
create policy parcela_admin on public.parcela
  for all to authenticated
  using (public.eh_admin_trilha())
  with check (public.eh_admin_trilha());

drop policy if exists parcela_incorporadora on public.parcela;
create policy parcela_incorporadora on public.parcela
  for select to authenticated
  using (exists (
    select 1 from public.negocio n
    where n.id = parcela.negocio_id
      and n.incorporadora_id = public.minha_incorporadora_id()
  ));

drop policy if exists parcela_parceiro on public.parcela;
create policy parcela_parceiro on public.parcela
  for select to authenticated
  using (exists (
    select 1 from public.negocio n
    where n.id = parcela.negocio_id
      and n.parceiro_id = public.meu_parceiro_id()
  ));


-- ----------------------------------------------------------------------------
-- PARTE 5 · As trilhas que já começaram antes desta migração
-- ----------------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.negocio
    where jornada_inicio is not null
      and status in ('em_jornada', 'em_quitacao', 'quitado')
  loop
    perform public.gerar_parcelas(v_id);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'tabela parcela' as item,
       coalesce(string_agg(column_name, ', ' order by ordinal_position), 'NÃO EXISTE') as situacao
from information_schema.columns
where table_schema = 'public' and table_name = 'parcela'

union all

select 'policies da parcela',
       coalesce(string_agg(polname, ' | ' order by polname), 'NENHUMA')
from pg_policy where polrelid = 'public.parcela'::regclass

union all

select 'parcelas geradas',
       coalesce(
         string_agg(linha, ' | '),
         'NENHUMA — nenhum negócio em jornada ainda'
       )
from (
  select n.id::text || ': ' || count(p.id)::text || ' parcelas de ' ||
         to_char(max(p.valor), 'FM999G999D00') as linha
  from public.negocio n
  join public.parcela p on p.negocio_id = n.id
  group by n.id
) t;
