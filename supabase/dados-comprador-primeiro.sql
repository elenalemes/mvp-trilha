-- ----------------------------------------------------------------------------
-- Sprint 4.1d · "Dados do comprador" é a primeira tarefa da etapa
-- ----------------------------------------------------------------------------
-- Rode DEPOIS de `conjuge-uniao-e-anexos.sql`.
--
-- A "Ficha de qualificação" passa a se chamar "Dados do comprador" e abre em
-- linha, na própria tela do fechamento — sem página separada. E vem PRIMEIRO
-- na etapa: é por ela que o corretor começa, e é ela que diz se há cônjuge
-- (o que divide os anexos dos documentos seguintes em dois grupos).
--
-- Vale para a receita e para todos os negócios, abertos ou não: é nome e
-- ordem de exibição, não regra.
--
-- ATENÇÃO para quem mantém as migrações: `ficha-qualificacao-2.sql` e
-- `conjuge-uniao-e-anexos.sql` procuram a tarefa pelo título antigo. Rodar
-- de novo depois desta não quebra nada — só não encontra a tarefa.
--
-- Rodar inteiro no SQL Editor do Supabase.
-- ----------------------------------------------------------------------------

update public.checklist_modelo
   set titulo = 'Dados do comprador', ordem = 0
 where etapa = 'Documentação do comprador' and titulo = 'Ficha de qualificação';

update public.checklist_item
   set titulo = 'Dados do comprador', ordem = 0
 where etapa = 'Documentação do comprador' and titulo = 'Ficha de qualificação';

-- Conferência: a primeira linha de cada lista deve ser "Dados do comprador".
select 'receita' as onde, ordem, titulo, tipo::text
from public.checklist_modelo
where etapa = 'Documentação do comprador'
order by ordem
limit 3;
