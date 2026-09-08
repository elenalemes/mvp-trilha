-- OBSOLETO — não rode este arquivo. Pode apagar.
--
-- Esta foi uma primeira versão da migração de comissão, escrita antes de a
-- Elena confirmar as regras. Falta nela a correção da permissão de edição da
-- incorporadora e o parâmetro `p_comissao` na função de salvar.
--
-- O que vale é:  supabase/comissao-parceiros.sql  (no plural)
--
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Sprint 2.6 · Percentual de comissão do parceiro imobiliário
-- ----------------------------------------------------------------------------
-- A comissão paga a imobiliárias, corretores e parceiros sai de dentro da
-- entrada, e por isso muda quanto a incorporadora recebe na Trilha. Sem ela,
-- os números que a incorporadora vê não são os dela — são os do comprador.
--
-- REGRAS (confirmadas com a Elena em 4/set):
--
--   * incide sobre o VALOR AJUSTADO do imóvel, não sobre a entrada.
--     Num imóvel de R$ 500.000 em 24 meses: 6% de R$ 552.910,98 = R$ 33.174,66.
--   * é paga ao parceiro parcelada ao longo do tempo de Trilha.
--   * quando a opção tem ato, o ato vai inteiro para a incorporadora — a
--     comissão sai só das parcelas.
--   * o saldo financiado no fim NÃO tem desconto de comissão: ela é toda
--     quitada durante a Trilha.
--
-- Um percentual por incorporadora, negociado no acordo comercial. Por isso é
-- coluna no cadastro dela, e não tabela nova.
-- ----------------------------------------------------------------------------

alter table public.incorporadora
  add column if not exists percentual_comissao numeric(5, 2) not null default 6;

alter table public.incorporadora
  drop constraint if exists incorporadora_comissao_valida;

alter table public.incorporadora
  add constraint incorporadora_comissao_valida
  check (percentual_comissao >= 0 and percentual_comissao <= 100);

comment on column public.incorporadora.percentual_comissao is
  'Comissão do parceiro imobiliário, em % do valor ajustado do imóvel. Sai de dentro da entrada, parcelada pelo tempo de Trilha. Padrão da Trilha: 6%.';


-- ---------------------------------------------------------------- conferência

select nome, percentual_comissao
from public.incorporadora
order by nome;
