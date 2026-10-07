-- ----------------------------------------------------------------------------
-- Asaas · Parte 5 · Os repasses
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `asaas-4-rotina-diaria.sql`. Rodar inteiro no SQL Editor.
-- Não move dinheiro: cria os lotes, a busca da chave Pix e o processamento dos
-- avisos de transferência. Quem pede a transferência ao Asaas é o servidor, e
-- só com `config_financeiro.repasse_ligado` (que segue DESLIGADO).
--
-- DECIDIDO COM O MATHEUS (6/out):
--
--   * UM PIX POR PESSOA POR JANELA. Os repasses prontos de uma mesma pessoa
--     (o vendedor, ou cada corretor) viram um LOTE, com a soma. O painel
--     mostra de quais parcelas a soma é feita.
--   * A aprovação é humana, no Asaas, com SMS — ligada na conta real.
--
-- O LOTE ANDA ASSIM:
--
--   preparado → enviando → enviado → concluido
--                    ↘ falhou     (o Asaas recusou: chave, saldo… — corrigir e tentar de novo)
--                    ↘ verificar  (caiu no meio: NINGUÉM sabe se a transferência
--                                  foi criada. Uma pessoa confere no Asaas antes
--                                  de qualquer nova tentativa)
--
-- A REGRA DE OURO: PAGAR DUAS VEZES É PIOR DO QUE ATRASAR. Por isso o
-- "enviando" é uma trava: só sai de "preparado" (ou "falhou") para "enviando"
-- quem conseguir a troca numa escrita só — duas execuções ao mesmo tempo não
-- mandam o mesmo lote. E nada sai de "verificar" sozinho.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- PARTE 1 · O lote
-- ----------------------------------------------------------------------------

create table if not exists public.repasse_lote (
  id                      uuid primary key default gen_random_uuid(),
  data_ref                date not null,

  beneficiario            public.repasse_beneficiario not null,
  -- Um dos dois, conforme o beneficiário. O vendedor é a incorporadora (ou o
  -- proprietário PF, que mora na mesma tabela).
  incorporadora_id        uuid references public.incorporadora (id) on delete restrict,
  parceiro_id             uuid references public.parceiro (id) on delete restrict,

  valor                   numeric(14,2) not null check (valor > 0),
  status                  text not null default 'preparado'
                          check (status in ('preparado', 'enviando', 'enviado', 'concluido', 'falhou', 'verificar')),

  -- Copiados no envio: a chave que foi usada fica registrada.
  nome_beneficiario       text,
  chave_pix               text,
  chave_pix_tipo          text,

  asaas_transferencia_id  text,
  asaas_status            text,
  erro                    text,
  tentativas              integer not null default 0,
  -- Tentativas anteriores (id da transferência, erro, quando), para auditoria.
  historico               jsonb not null default '[]'::jsonb,

  created_at              timestamptz not null default now(),
  enviado_em              timestamptz,
  concluido_em            timestamptz,
  updated_at              timestamptz not null default now(),

  constraint repasse_lote_quem check (
    (beneficiario = 'vendedor' and incorporadora_id is not null and parceiro_id is null)
    or (beneficiario = 'corretor' and parceiro_id is not null and incorporadora_id is null)
  )
);

comment on table public.repasse_lote is
  'Um Pix por pessoa por janela de repasse: soma dos repasses prontos daquele beneficiário.';

create unique index if not exists repasse_lote_transferencia_unica
  on public.repasse_lote (asaas_transferencia_id) where asaas_transferencia_id is not null;
create index if not exists repasse_lote_status_idx on public.repasse_lote (status, data_ref desc);

drop trigger if exists repasse_lote_touch on public.repasse_lote;
create trigger repasse_lote_touch before update on public.repasse_lote
  for each row execute function public.touch_updated_at();

alter table public.repasse
  add column if not exists lote_id uuid references public.repasse_lote (id) on delete set null;

create index if not exists repasse_lote_idx on public.repasse (lote_id);


-- ----------------------------------------------------------------------------
-- PARTE 2 · Montar os lotes da janela
--
-- Pega todo repasse PRONTO, sem lote, de trilha que não foi cancelada, e
-- agrupa por pessoa. Repasse de valor zero (pode acontecer na venda direta)
-- não vira Pix: é dado como concluído na hora.
-- Devolve os ids dos lotes criados. Rodar duas vezes no mesmo dia não cria
-- lote repetido: o repasse que entrou num lote deixa de estar "sem lote".
-- ----------------------------------------------------------------------------

create or replace function public.montar_lotes_repasse(p_data date)
returns setof uuid
language plpgsql security definer set search_path = public as $$
declare
  g        record;
  v_lote   uuid;
begin
  update public.repasse r
     set status = 'concluido', concluido_em = now()
   where r.status = 'pronto' and r.lote_id is null and r.valor = 0;

  for g in
    select r.beneficiario,
           case when r.beneficiario = 'vendedor' then n.incorporadora_id end as incorporadora_id,
           r.parceiro_id,
           sum(r.valor) as total,
           array_agg(r.id) as ids
      from public.repasse r
      join public.negocio n on n.id = r.negocio_id
     where r.status = 'pronto'
       and r.lote_id is null
       and r.valor > 0
       and n.status <> 'cancelado'
     group by 1, 2, 3
  loop
    insert into public.repasse_lote (data_ref, beneficiario, incorporadora_id, parceiro_id, valor)
    values (p_data, g.beneficiario, g.incorporadora_id, g.parceiro_id, g.total)
    returning id into v_lote;

    update public.repasse set lote_id = v_lote where id = any (g.ids);

    return next v_lote;
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 3 · De quem é a chave Pix do lote
--
-- Corretor: a chave do cadastro dele.
-- Vendedor incorporadora: a chave do cadastro da incorporadora.
-- Vendedor proprietário PF: a chave da ficha que ele preencheu no fechamento
--   (é a mais recente e por negócio); sem ficha, a do cadastro.
-- Sempre a chave ATUAL: se a pessoa trocou de chave, vale a nova.
-- ----------------------------------------------------------------------------

create or replace function public.chave_pix_do_lote(p_lote uuid)
returns table (nome text, documento text, chave text, tipo text)
language plpgsql stable security definer set search_path = public as $$
declare
  l public.repasse_lote%rowtype;
begin
  select * into l from public.repasse_lote where id = p_lote;
  if not found then return; end if;

  if l.beneficiario = 'corretor' then
    return query
      select pa.nome, pa.documento, nullif(trim(pa.chave_pix), ''), pa.chave_pix_tipo::text
        from public.parceiro pa where pa.id = l.parceiro_id;
    return;
  end if;

  return query
    select coalesce(case when i.tipo = 'proprietario_pf' then i.resp_nome end, i.nome),
           coalesce(i.cnpj, i.resp_cpf),
           coalesce(nullif(trim(fv.chave_pix), ''), nullif(trim(i.chave_pix), '')),
           case when nullif(trim(fv.chave_pix), '') is not null then null  -- a ficha não guarda o tipo
                else i.chave_pix_tipo::text end
      from public.incorporadora i
      left join lateral (
        select f.chave_pix
          from public.repasse r
          join public.ficha_vendedor f on f.negocio_id = r.negocio_id
         where r.lote_id = l.id and i.tipo = 'proprietario_pf'
         order by f.updated_at desc
         limit 1
      ) fv on true
     where i.id = l.incorporadora_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 4 · Os avisos do Asaas, agora também de transferência
--
-- Mesma função da Parte 3, refeita inteira (`create or replace` troca o corpo
-- todo). A parte de cobrança é IDÊNTICA; entra o bloco de transferência:
--
--   TRANSFER_DONE                  lote e repasses CONCLUÍDOS
--   TRANSFER_FAILED / CANCELLED    lote e repasses com problema, com o motivo
--   outros (pendente, no banco…)   só atualiza a situação do Asaas
-- ----------------------------------------------------------------------------

create or replace function public.asaas_processar_evento(p_evento jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id        text := p_evento ->> 'id';
  v_tipo      text := p_evento ->> 'event';
  v_pay       jsonb := p_evento -> 'payment';
  v_tra       jsonb := p_evento -> 'transfer';
  v_parcela   public.parcela%rowtype;
  v_lote      public.repasse_lote%rowtype;
  v_data_pag  date;
  v_saiu      boolean;
  v_resultado text;
begin
  if v_id is null or v_tipo is null then
    return 'invalido';
  end if;

  insert into public.asaas_evento (id, evento, payload)
  values (v_id, v_tipo, p_evento)
  on conflict (id) do nothing;

  if not found then
    return 'repetido';
  end if;

  begin
    -- ========================================================= transferências
    if v_tra is not null then
      select * into v_lote
        from public.repasse_lote
       where asaas_transferencia_id = v_tra ->> 'id'
       limit 1;

      if v_lote.id is null then
        update public.asaas_evento set processado_em = now(), erro = 'transferência sem lote no MVP'
         where id = v_id;
        return 'sem_lote';
      end if;

      if v_tipo = 'TRANSFER_DONE' then
        update public.repasse_lote
           set status = 'concluido', concluido_em = now(), asaas_status = v_tra ->> 'status', erro = null
         where id = v_lote.id;
        update public.repasse
           set status = 'concluido', concluido_em = now(), erro = null
         where lote_id = v_lote.id;
        v_resultado := 'transferencia_concluida';

      elsif v_tipo in ('TRANSFER_FAILED', 'TRANSFER_CANCELLED') then
        update public.repasse_lote
           set status = 'falhou',
               asaas_status = v_tra ->> 'status',
               erro = coalesce(nullif(v_tra ->> 'failReason', ''),
                               case when v_tipo = 'TRANSFER_CANCELLED'
                                    then 'Transferência cancelada no Asaas (não aprovada?).'
                                    else 'O banco recusou a transferência.' end)
         where id = v_lote.id;
        update public.repasse
           set status = 'falhou', erro = 'ver o lote'
         where lote_id = v_lote.id and status <> 'concluido';
        v_resultado := 'transferencia_falhou';

      else
        update public.repasse_lote set asaas_status = v_tra ->> 'status' where id = v_lote.id;
        v_resultado := 'transferencia_situacao';
      end if;

      update public.asaas_evento set processado_em = now() where id = v_id;
      return v_resultado;
    end if;

    -- ============================================================== cobranças
    if v_pay is null then
      update public.asaas_evento set processado_em = now() where id = v_id;
      return 'ignorado';
    end if;

    select * into v_parcela
      from public.parcela
     where asaas_cobranca_id = v_pay ->> 'id'
     limit 1;

    if not found and (v_pay ->> 'externalReference') ~ '^[0-9a-f-]{36}$' then
      select * into v_parcela
        from public.parcela
       where id = (v_pay ->> 'externalReference')::uuid;
    end if;

    if v_parcela.id is null then
      update public.asaas_evento set processado_em = now(), erro = 'cobrança sem parcela no MVP'
       where id = v_id;
      return 'sem_parcela';
    end if;

    v_data_pag := coalesce(
      nullif(v_pay ->> 'clientPaymentDate', '')::date,
      nullif(v_pay ->> 'paymentDate', '')::date,
      (now() at time zone 'America/Sao_Paulo')::date
    );

    if v_tipo in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
      update public.parcela
         set status       = 'paga',
             pago_em      = coalesce(pago_em, (v_data_pag::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'),
             valor_pago   = nullif(v_pay ->> 'value', '')::numeric,
             asaas_status = v_pay ->> 'status',
             cobranca_erro = null
       where id = v_parcela.id;
      v_resultado := 'baixa';

    elsif v_tipo = 'PAYMENT_DELETED' then
      if v_parcela.status = 'aberta' then
        update public.parcela
           set asaas_cobranca_id = null,
               asaas_link        = null,
               asaas_status      = 'DELETED',
               cobranca_erro     = 'A cobrança foi apagada no Asaas. Pode gerar de novo.'
         where id = v_parcela.id;
      else
        update public.parcela
           set asaas_status  = 'DELETED',
               cobranca_erro = 'ATENÇÃO: cobrança apagada no Asaas, mas a parcela consta como paga. Conferir.'
         where id = v_parcela.id;
      end if;
      v_resultado := 'apagada';

    elsif v_tipo = 'PAYMENT_RESTORED' then
      update public.parcela
         set asaas_cobranca_id = coalesce(asaas_cobranca_id, v_pay ->> 'id'),
             asaas_link        = coalesce(asaas_link, v_pay ->> 'invoiceUrl'),
             asaas_status      = v_pay ->> 'status',
             cobranca_erro     = null
       where id = v_parcela.id;
      v_resultado := 'restaurada';

    elsif v_tipo in ('PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
                     'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_REFUND_IN_PROGRESS') then
      select exists (
        select 1 from public.repasse
         where parcela_id = v_parcela.id
           and (status in ('enviado', 'concluido') or lote_id is not null)
      ) into v_saiu;

      if not v_saiu and v_tipo in ('PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE')
         and v_parcela.status = 'paga' then
        update public.parcela
           set status = 'aberta', pago_em = null, pago_por = null, valor_pago = null
         where id = v_parcela.id;
      end if;

      update public.parcela
         set asaas_status  = v_pay ->> 'status',
             cobranca_erro = case when v_saiu
               then format('ATENÇÃO: %s no Asaas e o repasse desta parcela JÁ SAIU (ou está saindo). Conferir com o financeiro.', v_tipo)
               else format('ATENÇÃO: %s no Asaas. Conferir.', v_tipo) end
       where id = v_parcela.id;
      v_resultado := 'alerta';

    else
      update public.parcela set asaas_status = v_pay ->> 'status' where id = v_parcela.id;
      v_resultado := 'situacao';
    end if;

    update public.asaas_evento set processado_em = now() where id = v_id;
    return v_resultado;

  exception when others then
    update public.asaas_evento set erro = sqlerrm where id = v_id;
    return 'erro';
  end;
end;
$$;


-- ----------------------------------------------------------------------------
-- PARTE 5 · Quem vê e quem chama
-- ----------------------------------------------------------------------------

alter table public.repasse_lote enable row level security;
grant select on public.repasse_lote to authenticated;
grant all on public.repasse_lote to service_role;

drop policy if exists repasse_lote_admin on public.repasse_lote;
create policy repasse_lote_admin on public.repasse_lote
  for select to authenticated
  using (public.eh_admin_trilha());

drop policy if exists repasse_lote_incorporadora on public.repasse_lote;
create policy repasse_lote_incorporadora on public.repasse_lote
  for select to authenticated
  using (beneficiario = 'vendedor' and incorporadora_id = public.minha_incorporadora_id());

drop policy if exists repasse_lote_parceiro on public.repasse_lote;
create policy repasse_lote_parceiro on public.repasse_lote
  for select to authenticated
  using (parceiro_id = public.meu_parceiro_id());

revoke all on function public.montar_lotes_repasse(date)     from public, anon, authenticated;
revoke all on function public.chave_pix_do_lote(uuid)        from public, anon, authenticated;
revoke all on function public.asaas_processar_evento(jsonb)  from public, anon, authenticated;
grant execute on function public.montar_lotes_repasse(date)    to service_role;
grant execute on function public.chave_pix_do_lote(uuid)       to service_role;
grant execute on function public.asaas_processar_evento(jsonb) to service_role;


-- ----------------------------------------------------------------------------
-- Conferência
-- ----------------------------------------------------------------------------

select 'repasses' as item,
       format('repasse %s · prontos para a próxima janela: %s (R$ %s)',
              case when (select repasse_ligado from public.config_financeiro) then 'LIGADO' else 'desligado' end,
              count(*), coalesce(to_char(sum(valor), 'FM999G999G990D00'), '0'))
  from public.repasse where status = 'pronto' and lote_id is null

union all

select 'pessoas sem chave Pix com repasse pronto',
       coalesce(string_agg(distinct coalesce(pa.nome, i.nome), ', '), 'nenhuma')
  from public.repasse r
  join public.negocio n on n.id = r.negocio_id
  left join public.parceiro pa on pa.id = r.parceiro_id
  left join public.incorporadora i on i.id = n.incorporadora_id and r.beneficiario = 'vendedor'
 where r.status = 'pronto'
   and ((r.beneficiario = 'corretor' and nullif(trim(pa.chave_pix), '') is null)
     or (r.beneficiario = 'vendedor' and nullif(trim(i.chave_pix), '') is null
         and not exists (select 1 from public.ficha_vendedor f where f.negocio_id = r.negocio_id
                          and nullif(trim(f.chave_pix), '') is not null)));
