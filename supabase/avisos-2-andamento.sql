-- ============================================================================
-- AVISOS · PARTE B · o andamento do fechamento
-- ============================================================================
-- Rode DEPOIS do `avisos-1-central.sql`.
--
-- 1. Três marcas no negócio, para cada aviso de andamento sair UMA vez só:
--      nivel_avisado         último nível do checklist que já foi avisado
--      aviso_assinatura_em   quando saiu o "confira seu e-mail" do contrato
--      aviso_trilha_em       quando saiu o "chaves liberadas, a trilha começou"
--    Os negócios que já existem recebem as marcas do ponto em que estão — sem
--    isso, todos receberiam de uma vez os avisos de etapas já passadas.
--
-- 2. Uma pasta PRIVADA no Storage, `documentos`, para a minuta do contrato.
--    Ela não fica pública porque traz dados da Trilha e do representante
--    (CPF, RG). Quem abre é só quem tem o link do negócio ou está logado.
--
-- Pode rodar mais de uma vez sem estragar nada.
-- ============================================================================

begin;

alter table public.negocio
  add column if not exists nivel_avisado       int not null default 1,
  add column if not exists aviso_assinatura_em timestamptz,
  add column if not exists aviso_trilha_em     timestamptz;

-- O ponto em que cada negócio está HOJE: o menor nível com tarefa aberta.
-- Tudo fechado (ou já em trilha) = 99, nada mais a avisar.
with nivel as (
  select n.id,
         coalesce(
           (select min(i.etapa_ordem) from public.checklist_item i
             where i.negocio_id = n.id and i.status not in ('concluido', 'nao_se_aplica')),
           99) as atual
    from public.negocio n
)
update public.negocio n
   set nivel_avisado = greatest(n.nivel_avisado, nivel.atual)
  from nivel
 where nivel.id = n.id
   and n.nivel_avisado < nivel.atual;

update public.negocio n
   set aviso_assinatura_em = now()
 where aviso_assinatura_em is null
   and exists (select 1 from public.checklist_item i
                where i.negocio_id = n.id
                  and i.titulo ilike 'enviar para assinatura%'
                  and i.status = 'concluido');

update public.negocio
   set aviso_trilha_em = coalesce(jornada_inicio, now())
 where aviso_trilha_em is null
   and status not in ('em_fechamento', 'cancelado');

-- A pasta da minuta. Sem policy nenhuma: só a chave de servidor lê, e ela só
-- entrega o arquivo depois de conferir o link (rota /minuta).
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

commit;


-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================
select 'negócios por nível já avisado' as item,
       coalesce(string_agg(format('nível %s: %s', nivel_avisado, qtd), ' | ' order by nivel_avisado), 'nenhum negócio') as situacao
  from (select nivel_avisado, count(*) qtd from public.negocio group by 1) x
union all
select 'pasta documentos',
       coalesce((select case when public then 'PÚBLICA (errado)' else 'privada, ok' end
                   from storage.buckets where id = 'documentos'), 'NÃO EXISTE');
