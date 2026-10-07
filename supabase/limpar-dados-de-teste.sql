-- ============================================================================
-- LIMPAR DADOS DE TESTE · versão de 7/out/2026 (substitui `limpar-testes.sql`)
-- ============================================================================
-- APAGA, SEM VOLTA (o banco não tem backup):
--   propostas, negócios, trilhas, tarefas e arquivos do fechamento, fichas,
--   parcelas, repasses e lotes de repasse, compradores, corretores (parceiros)
--   e os LOGINS dos corretores, avisos do Asaas, o registro das rotinas e a
--   central de avisos (sino e mensagens de WhatsApp).
--
-- MANTÉM:
--   incorporadoras (e proprietários PF) com seus logins, empreendimentos,
--   imóveis, condições de pagamento, importações, contas de admin da Trilha
--   e as regras do financeiro (`config_financeiro`).
--
-- Os imóveis que estavam presos por causa das propostas/negócios apagados
-- voltam para "disponível". Imóvel reservado ou indisponível por outro motivo
-- não é tocado.
--
-- COMO USAR:
--   PASSO 1 — rode só o bloco "CONFERIR ANTES" e veja os números.
--   PASSO 2 — rode o bloco "APAGAR". Ou tudo é apagado, ou nada (transação).
--   PASSO 3 — os arquivos do bucket `fechamento` não saem por SQL: apague
--             pelo painel do Supabase (Storage → fechamento → selecionar tudo).
--
-- Fora do banco, nada muda: as cobranças e clientes de teste continuam no
-- sandbox do Asaas (não fazem mal; o painel ignora o que não reconhece).
-- ============================================================================


-- ============================================================================
-- PASSO 1 · CONFERIR ANTES (só lê)
-- ============================================================================

select 'VAI SER APAGADO →' as tabela, '' as quantidade
union all select 'propostas',               count(*)::text from public.proposta
union all select 'negócios / trilhas',      count(*)::text from public.negocio
union all select 'parcelas',                count(*)::text from public.parcela
union all select 'repasses',                count(*)::text from public.repasse
union all select 'lotes de repasse (Pix)',  count(*)::text from public.repasse_lote
union all select 'compradores',             count(*)::text from public.comprador
union all select 'corretores (parceiros)',  count(*)::text from public.parceiro
union all select 'logins de corretor',      count(*)::text from public.conta where tipo = 'parceiro'
union all select 'avisos do Asaas',         count(*)::text from public.asaas_evento
union all select 'imóveis que voltam a disponível',
                 count(*)::text from public.imovel
                  where status in ('em_negociacao', 'reservado', 'em_trilha')
                    and (id in (select imovel_id from public.proposta) or id in (select imovel_id from public.negocio))
union all select 'arquivos no bucket (apagar à mão depois)',
                 count(*)::text from storage.objects where bucket_id = 'fechamento'
union all select '', ''
union all select 'VAI FICAR →', ''
union all select 'incorporadoras / proprietários', count(*)::text from public.incorporadora
union all select 'empreendimentos',         count(*)::text from public.empreendimento
union all select 'imóveis',                 count(*)::text from public.imovel
union all select 'logins que ficam',        string_agg(tipo::text || ': ' || coalesce(email, nome), ' | ')
                                            from public.conta where tipo <> 'parceiro';


-- ============================================================================
-- PASSO 2 · APAGAR (rode este bloco inteiro de uma vez)
-- ============================================================================

begin;

-- Imóveis presos pelos testes voltam para a prateleira — antes de apagar as
-- propostas, porque é por elas que se sabe quais são.
update public.imovel
   set status = 'disponivel'
 where status in ('em_negociacao', 'reservado', 'em_trilha')
   and (id in (select imovel_id from public.proposta) or id in (select imovel_id from public.negocio));

-- Dinheiro: repasses e lotes (os lotes travam corretor e incorporadora).
delete from public.repasse;
delete from public.repasse_lote;

-- Negócio leva junto: tarefas, arquivos, fichas e parcelas (cascata).
delete from public.negocio;

-- Proposta leva junto a divisão de comissão entre corretores.
delete from public.proposta;

delete from public.comprador;

-- Corretores e os logins deles.
delete from auth.users where id in (select id from public.conta where tipo = 'parceiro');
delete from public.conta where tipo = 'parceiro';
delete from public.parceiro;

-- Registros técnicos dos testes.
delete from public.asaas_evento;
delete from public.rotina_execucao;

-- Central de avisos (só existe depois do `avisos-1-central.sql`).
do $$
begin
  if to_regclass('public.mensagem') is not null then delete from public.mensagem; end if;
  if to_regclass('public.aviso')    is not null then delete from public.aviso;    end if;
end $$;

-- Os códigos de proposta recomeçam do PRP-0001.
alter sequence if exists public.proposta_codigo_seq restart with 1;

commit;


-- ============================================================================
-- CONFERIR DEPOIS
-- ============================================================================

select 'propostas' as tabela, count(*)::text as quantidade from public.proposta
union all select 'negócios / trilhas',     count(*)::text from public.negocio
union all select 'parcelas',               count(*)::text from public.parcela
union all select 'repasses',               count(*)::text from public.repasse
union all select 'compradores',            count(*)::text from public.comprador
union all select 'corretores',             count(*)::text from public.parceiro
union all select '— ficaram —',            ''
union all select 'incorporadoras',         count(*)::text from public.incorporadora
union all select 'empreendimentos',        count(*)::text from public.empreendimento
union all select 'imóveis disponíveis',    count(*)::text from public.imovel where status = 'disponivel'
union all select 'condições de pagamento', count(*)::text from public.opcao_pagamento
union all select 'logins',                 string_agg(tipo::text || ': ' || coalesce(email, nome), ' | ') from public.conta;
