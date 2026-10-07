-- ============================================================================
-- ASAAS · PARTE 6a · o ATO entra na trilha
-- ============================================================================
-- Rode DEPOIS das partes 1 a 5.
--
-- O ato (a entrada paga no fechamento) passa a ser a PARCELA 0 da trilha:
--
--   - cobrado por Pix no Asaas, como as outras, com multa e juros iguais;
--   - 100% do vendedor: o repasse do ato é todo dele, nos dias 14 e 15;
--     comissão e gestão continuam saindo só das parcelas mensais;
--   - vencimento PRÓPRIO e editável (`negocio.ato_vencimento`): no dia do
--     fechamento ou no próximo dia 10, conforme o caso. Mudar a data do ato
--     não mexe nas parcelas, e vice-versa.
--
-- Por padrão, o ato vence no dia em que a trilha começou.
--
-- As trilhas que já existem ganham o ato agora (só as que têm ato > 0 e
-- ainda não têm a parcela 0).
--
-- Pode rodar mais de uma vez sem estragar nada.
-- ============================================================================

begin;

alter table public.negocio add column if not exists ato_vencimento date;


-- ----------------------------------------------------------------------------
-- 1 · A divisão: parcela 0 vai inteira para o vendedor
-- ----------------------------------------------------------------------------

create or replace function public.ratear_parcela(p_parcela uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_parcela        public.parcela%rowtype;
  v_negocio        public.negocio%rowtype;
  v_proposta       public.proposta%rowtype;
  v_prazo          integer;
  v_gestao         bigint;
  v_com_mensal     bigint;
  v_com_total      bigint;
  v_com_parcela    bigint;
  v_corretores     bigint := 0;
  v_vendedor       bigint;
  v_valor          bigint;
  r                record;
begin
  select * into v_parcela from public.parcela where id = p_parcela;
  if not found or v_parcela.valor_vendedor is not null then
    return;
  end if;

  select * into v_negocio  from public.negocio  where id = v_parcela.negocio_id;
  select * into v_proposta from public.proposta where id = v_negocio.proposta_id;

  -- O ATO (parcela 0) vai inteiro para o vendedor: comissão e gestão saem só
  -- das parcelas mensais.
  if v_parcela.numero = 0 then
    insert into public.repasse (parcela_id, negocio_id, beneficiario, valor)
    values (v_parcela.id, v_negocio.id, 'vendedor', v_parcela.valor)
    on conflict do nothing;

    update public.parcela
       set valor_vendedor = valor, valor_corretores = 0, valor_trilha = 0
     where id = v_parcela.id;

    if v_parcela.status = 'paga' then
      update public.repasse set status = 'pronto'
       where parcela_id = v_parcela.id and status = 'aguardando_pagamento';
    end if;
    return;
  end if;

  -- Tudo em centavos, como em lib/pagamento.ts.
  v_prazo      := v_proposta.prazo_meses;
  v_valor      := round(v_parcela.valor * 100);
  v_gestao     := round(coalesce((v_proposta.condicao ->> 'gestao')::numeric, 0) * 100);
  v_com_mensal := round(coalesce((v_proposta.condicao ->> 'comissaoMensal')::numeric, 0) * 100);
  v_com_total  := round(coalesce((v_proposta.condicao ->> 'comissaoTotal')::numeric, 0) * 100);

  -- A sobra da divisão da comissão vai na primeira parcela.
  v_com_parcela := v_com_mensal
    + case when v_parcela.numero = 1 then v_com_total - v_com_mensal * v_prazo else 0 end;

  v_vendedor := v_valor - v_gestao - v_com_parcela;

  if v_vendedor < 0 or v_com_parcela < 0 then
    raise warning 'parcela % (negócio %): divisão não fecha (vendedor %, comissão %). Ficou sem divisão.',
      v_parcela.numero, v_negocio.id, v_vendedor, v_com_parcela;
    return;
  end if;

  -- Corretores: pela divisão congelada da proposta, se houver.
  if exists (select 1 from public.proposta_corretor where proposta_id = v_proposta.id) then
    for r in
      select parceiro_id,
             round(valor_mensal * 100)::bigint
               + case when v_parcela.numero = 1
                      then round(valor_total * 100)::bigint - round(valor_mensal * 100)::bigint * v_prazo
                      else 0 end as centavos
        from public.proposta_corretor
       where proposta_id = v_proposta.id
    loop
      insert into public.repasse (parcela_id, negocio_id, beneficiario, parceiro_id, valor)
      values (v_parcela.id, v_negocio.id, 'corretor', r.parceiro_id, r.centavos / 100.0)
      on conflict do nothing;
      v_corretores := v_corretores + r.centavos;
    end loop;

  -- Um corretor só, sem divisão: leva a comissão inteira.
  elsif v_proposta.parceiro_id is not null and v_com_parcela > 0 then
    insert into public.repasse (parcela_id, negocio_id, beneficiario, parceiro_id, valor)
    values (v_parcela.id, v_negocio.id, 'corretor', v_proposta.parceiro_id, v_com_parcela / 100.0)
    on conflict do nothing;
    v_corretores := v_com_parcela;
  end if;
  -- Venda direta: não entra em nenhum dos dois; a comissão fica com a Trilha.

  if v_corretores > v_com_parcela then
    -- Corretores somando mais que a comissão: não manda nada.
    delete from public.repasse where parcela_id = v_parcela.id;
    raise warning 'parcela % (negócio %): corretores (%) passam da comissão (%). Ficou sem divisão.',
      v_parcela.numero, v_negocio.id, v_corretores, v_com_parcela;
    return;
  end if;

  insert into public.repasse (parcela_id, negocio_id, beneficiario, valor)
  values (v_parcela.id, v_negocio.id, 'vendedor', v_vendedor / 100.0)
  on conflict do nothing;

  update public.parcela
     set valor_vendedor   = v_vendedor / 100.0,
         valor_corretores = v_corretores / 100.0,
         valor_trilha     = (v_valor - v_vendedor - v_corretores) / 100.0
   where id = v_parcela.id;

  -- Parcela que já estava paga (trilhas anteriores a esta migração): os
  -- repasses nascem prontos.
  if v_parcela.status = 'paga' then
    update public.repasse set status = 'pronto'
     where parcela_id = v_parcela.id and status = 'aguardando_pagamento';
  end if;
end;
$$;

revoke all on function public.ratear_parcela(uuid) from public;


-- ----------------------------------------------------------------------------
-- 2 · Criar o ato de uma trilha (idempotente)
-- ----------------------------------------------------------------------------

create or replace function public.gerar_ato(p_negocio uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update public.negocio n
     set ato_vencimento = (n.jornada_inicio at time zone 'America/Sao_Paulo')::date
   where n.id = p_negocio and n.ato_vencimento is null and n.jornada_inicio is not null;

  insert into public.parcela (negocio_id, numero, vencimento, valor)
  select n.id, 0, n.ato_vencimento, p.valor_ato
    from public.negocio n
    join public.proposta p on p.id = n.proposta_id
   where n.id = p_negocio
     and n.ato_vencimento is not null
     and coalesce(p.valor_ato, 0) > 0
  on conflict (negocio_id, numero) do nothing
  returning id into v_id;

  if v_id is not null then
    perform public.ratear_parcela(v_id);
  end if;
end;
$$;

revoke all on function public.gerar_ato(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3 · Gerar as parcelas agora inclui o ato
-- ----------------------------------------------------------------------------

create or replace function public.gerar_parcelas(p_negocio uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_primeiro date;
  v_id       uuid;
begin
  select coalesce(n.primeiro_vencimento, public.primeiro_vencimento_padrao(n.jornada_inicio))
    into v_primeiro
    from public.negocio n
   where n.id = p_negocio and n.jornada_inicio is not null;

  if v_primeiro is null then
    return;
  end if;

  update public.negocio
     set primeiro_vencimento = v_primeiro
   where id = p_negocio and primeiro_vencimento is null;

  insert into public.parcela (negocio_id, numero, vencimento, valor)
  select n.id,
         g.n,
         public.vencimento_da_parcela(v_primeiro, g.n),
         case when g.n = 1
              then coalesce((p.condicao ->> 'primeiraParcela')::numeric, p.valor_parcela)
              else p.valor_parcela end
    from public.negocio n
    join public.proposta p on p.id = n.proposta_id
   cross join generate_series(1, p.prazo_meses) as g(n)
   where n.id = p_negocio
  on conflict (negocio_id, numero) do nothing;

  perform public.gerar_ato(p_negocio);

  for v_id in select id from public.parcela where negocio_id = p_negocio loop
    perform public.ratear_parcela(v_id);
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4 · A data da 1ª parcela não mexe mais no ato
-- ----------------------------------------------------------------------------

create or replace function public.definir_primeiro_vencimento(p_negocio uuid, p_data date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha define o vencimento das parcelas.' using errcode = '42501';
  end if;

  if p_data is null then
    raise exception 'Informe a data do primeiro vencimento.' using errcode = '22023';
  end if;

  if exists (select 1 from public.parcela
              where negocio_id = p_negocio and numero >= 1
                and (asaas_cobranca_id is not null or status = 'paga')) then
    raise exception 'Há parcela já cobrada ou paga nesta trilha: as datas não podem mais mudar.'
      using errcode = '22023';
  end if;

  update public.negocio set primeiro_vencimento = p_data where id = p_negocio;

  update public.parcela
     set vencimento = public.vencimento_da_parcela(p_data, numero)
   where negocio_id = p_negocio and numero >= 1;
end;
$$;

revoke all on function public.definir_primeiro_vencimento(uuid, date) from public;
grant execute on function public.definir_primeiro_vencimento(uuid, date) to authenticated;


-- ----------------------------------------------------------------------------
-- 5 · A data do ato
-- ----------------------------------------------------------------------------

create or replace function public.definir_vencimento_ato(p_negocio uuid, p_data date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin_trilha() then
    raise exception 'Só a Trilha define o vencimento do ato.' using errcode = '42501';
  end if;

  if p_data is null then
    raise exception 'Informe a data do ato.' using errcode = '22023';
  end if;

  if exists (select 1 from public.parcela
              where negocio_id = p_negocio and numero = 0
                and (asaas_cobranca_id is not null or status = 'paga')) then
    raise exception 'O ato já foi cobrado ou pago: a data não pode mais mudar.' using errcode = '22023';
  end if;

  update public.negocio set ato_vencimento = p_data where id = p_negocio;
  update public.parcela set vencimento = p_data where negocio_id = p_negocio and numero = 0;
end;
$$;

revoke all on function public.definir_vencimento_ato(uuid, date) from public;
grant execute on function public.definir_vencimento_ato(uuid, date) to authenticated;


-- ----------------------------------------------------------------------------
-- 6 · As trilhas que já existem ganham o ato
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select id from public.negocio
            where jornada_inicio is not null and status <> 'cancelado'
  loop
    perform public.gerar_ato(r.id);
  end loop;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================
select i.identificacao as unidade,
       to_char(p.vencimento, 'DD/MM/YYYY') as vence,
       p.valor as ato,
       p.valor_vendedor as para_o_vendedor,
       (select count(*) from public.repasse r where r.parcela_id = p.id) as repasses
  from public.parcela p
  join public.negocio n on n.id = p.negocio_id
  join public.imovel  i on i.id = n.imovel_id
 where p.numero = 0
 order by p.created_at desc;
