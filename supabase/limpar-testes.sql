-- ----------------------------------------------------------------------------
-- LIMPEZA DE DADOS DE TESTE — apaga o fluxo comercial, mantém o estoque
-- ----------------------------------------------------------------------------
-- ⚠️  ISTO APAGA DADOS DE VERDADE E NÃO TEM DESFAZER.
--
-- Produção e desenvolvimento usam o MESMO Supabase: o que sai daqui sai do
-- mvp-trilha-olive.vercel.app também. Rodar só enquanto o sistema for um
-- laboratório — depois do primeiro negócio real, este arquivo não existe mais.
--
-- O QUE SAI:
--   · negócios e todo o checklist deles
--   · propostas
--   · compradores
--   · parceiros imobiliários e os LOGINS deles
--
-- O QUE FICA:
--   · incorporadoras, com o login e o responsável
--   · empreendimentos, imóveis e o que foi importado
--   · condições de pagamento
--   · a conta admin da Trilha
--
-- Os imóveis que estavam presos em negociação voltam a ficar disponíveis, e a
-- numeração das propostas recomeça em PRP-0001.
--
-- OS ARQUIVOS DO FECHAMENTO NÃO SAEM POR AQUI. Os registros deles caem junto
-- com as tarefas, mas o conteúdo mora no Storage, e o Supabase não deixa
-- apagar arquivo por SQL. Depois de rodar este script, esvazie o bucket à mão:
--   Storage → fechamento → selecionar tudo → Delete
-- Sem isso eles continuam ocupando o 1 GB do plano gratuito, sem que nenhuma
-- tela os mostre.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ----------------------------------------------------------------------------


-- ------------------------------------------------- antes: o que vai sumir
-- Confira estes números ANTES de rodar o resto. Se algum estiver muito maior
-- do que você esperava, pare aqui.

select 'negócios'    as tabela, count(*)::text as quantidade from public.negocio
union all select 'tarefas de fechamento', count(*)::text from public.checklist_item
union all select 'propostas',             count(*)::text from public.proposta
union all select 'compradores',           count(*)::text from public.comprador
union all select 'parceiros',             count(*)::text from public.parceiro
union all select 'logins de parceiro',    count(*)::text from public.conta where tipo = 'parceiro'
union all select 'arquivos no bucket (apagar à mão depois)', count(*)::text from storage.objects where bucket_id = 'fechamento'
union all select 'imóveis presos',        count(*)::text from public.imovel
                                          where status in ('em_negociacao', 'reservado', 'em_trilha');


-- ------------------------------------------------------------ a limpeza
-- A ordem importa: as chaves estrangeiras são `restrict` de propósito, então
-- cada tabela só sai depois de quem aponta para ela.

begin;

-- 1. O fechamento. `checklist_item` cai por cascade junto com o negócio, mas
--    apagar explícito deixa o script legível e não depende de lembrar disso.
delete from public.checklist_item;
delete from public.negocio;

-- 2. As propostas, com os números congelados.
delete from public.proposta;

-- 3. Os compradores. É aqui que moram os CPFs que você quer reaproveitar.
delete from public.comprador;

-- 4. Os parceiros. `conta_id` era `on delete set null`, então a ficha sai e o
--    login fica órfão — por isso os dois passos seguintes.
delete from public.parceiro;

-- 5. Os logins de parceiro, no Auth e na tabela conta. SÓ os de parceiro: o
--    admin da Trilha e o acesso da incorporadora continuam valendo.
delete from auth.users where id in (select id from public.conta where tipo = 'parceiro');
delete from public.conta where tipo = 'parceiro';

-- 6. Os imóveis voltam para a prateleira. `indisponivel` não é tocado: se você
--    tirou uma unidade do estoque de propósito, ela continua fora.
update public.imovel
   set status = 'disponivel'
 where status in ('em_negociacao', 'reservado', 'em_trilha');

-- 7. A numeração recomeça, para a próxima proposta ser a PRP-0001.
alter sequence public.proposta_codigo_seq restart with 1;

commit;


-- ---------------------------------------------------------- depois: sobrou?
-- Tudo zero nas cinco primeiras linhas, e o estoque intacto nas últimas.

select 'negócios'    as tabela, count(*)::text as quantidade from public.negocio
union all select 'tarefas de fechamento', count(*)::text from public.checklist_item
union all select 'propostas',             count(*)::text from public.proposta
union all select 'compradores',           count(*)::text from public.comprador
union all select 'parceiros',             count(*)::text from public.parceiro
union all select 'logins de parceiro',    count(*)::text from public.conta where tipo = 'parceiro'

union all select '— mantidos —',          ''
union all select 'incorporadoras',        count(*)::text from public.incorporadora
union all select 'empreendimentos',       count(*)::text from public.empreendimento
union all select 'imóveis disponíveis',   count(*)::text from public.imovel where status = 'disponivel'
union all select 'condições de pagamento', count(*)::text from public.opcao_pagamento
union all select 'contas que ficaram',    string_agg(tipo::text || ': ' || email, ' | ')
                                          from public.conta;
