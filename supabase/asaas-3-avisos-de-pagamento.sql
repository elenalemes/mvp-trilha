-- ----------------------------------------------------------------------------
-- Asaas · Parte 3 · Os avisos de pagamento
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `asaas-1-parcelas-e-repasses.sql`. Rodar inteiro no SQL
-- Editor. Só cria uma função: não mexe em nenhum dado.
--
-- O Asaas avisa o sistema (webhook) quando uma cobrança muda: paga, vencida,
-- apagada, estornada. A rota `/api/asaas/webhook` confere o token secreto e
-- entrega o aviso INTEIRO para esta função, que faz tudo numa transação só:
--
--   1. grava o aviso em `asaas_evento` — se o id já existe, é repetição: o
--      Asaas entrega "pelo menos uma vez", então repetir é normal e não pode
--      dar baixa duas vezes;
--   2. acha a parcela pela cobrança (e, de reserva, pela referência externa,
--      que é o id da parcela);
--   3. aplica o efeito:
--
--      PAYMENT_RECEIVED / CONFIRMED   parcela vira PAGA, com a data e o valor
--                                     que de fato entrou (com multa e juros).
--                                     Os repasses dela ficam prontos sozinhos
--                                     (gatilho da Parte 1).
--      PAYMENT_OVERDUE e outros       só atualiza a situação do Asaas.
--      PAYMENT_DELETED                a cobrança some da parcela, que pode ser
--                                     gerada de novo.
--      PAYMENT_RESTORED               a cobrança volta para a parcela.
--      REFUNDED / CHARGEBACK / …      ALERTA na parcela. Se nenhum repasse
--                                     dela saiu ainda, a parcela volta a
--                                     ficar em aberto; se já saiu, só alerta —
--                                     dinheiro que já foi se resolve olhando.
--
-- Erro no processamento não perde o aviso: ele fica gravado com o motivo, e a
-- rota responde 200 do mesmo jeito (senão o Asaas reenviaria em loop e, depois
-- de 15 falhas, pausaria a fila inteira).
-- ----------------------------------------------------------------------------

create or replace function public.asaas_processar_evento(p_evento jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id        text := p_evento ->> 'id';
  v_tipo      text := p_evento ->> 'event';
  v_pay       jsonb := p_evento -> 'payment';
  v_parcela   public.parcela%rowtype;
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

  -- Avisos que não são de cobrança (transferências, na Parte 5) ficam só
  -- gravados por enquanto.
  if v_pay is null then
    update public.asaas_evento set processado_em = now() where id = v_id;
    return 'ignorado';
  end if;

  begin
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
      -- Cobrança que não é do MVP (ex.: do sistema antigo, na mesma conta do
      -- Asaas). Normal: grava e segue.
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
             -- Meio-dia de São Paulo: a data não "volta um dia" no fuso.
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
         where parcela_id = v_parcela.id and status in ('enviado', 'concluido')
      ) into v_saiu;

      if not v_saiu and v_tipo in ('PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE')
         and v_parcela.status = 'paga' then
        -- Volta a ficar em aberto: o gatilho devolve os repasses para "aguardando".
        update public.parcela
           set status = 'aberta', pago_em = null, pago_por = null, valor_pago = null
         where id = v_parcela.id;
      end if;

      update public.parcela
         set asaas_status  = v_pay ->> 'status',
             cobranca_erro = case when v_saiu
               then format('ATENÇÃO: %s no Asaas e o repasse desta parcela JÁ SAIU. Conferir com o financeiro.', v_tipo)
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

revoke all on function public.asaas_processar_evento(jsonb) from public, anon, authenticated;
grant execute on function public.asaas_processar_evento(jsonb) to service_role;

comment on function public.asaas_processar_evento(jsonb) is
  'Processa um aviso (webhook) do Asaas: grava, deduplica pelo id e dá baixa na parcela. Só o servidor chama.';

-- Conferência
select 'função de avisos' as item,
       case when exists (select 1 from pg_proc where proname = 'asaas_processar_evento')
            then 'instalada' else 'NÃO INSTALADA' end as situacao;
