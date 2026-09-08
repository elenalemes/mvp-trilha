-- ============================================================================
-- DIAGNÓSTICO · quem o banco enxerga em cada requisição do app
--
-- Cria uma função que devolve a identidade que o banco recebeu. O app chama
-- ela e mostra o resultado na tela, o que separa dois problemas parecidos:
--
--   · o app manda a identidade e a regra de acesso barra  → devolve um id
--   · o app não manda identidade nenhuma (chega como anônimo) → devolve vazio
--
-- Não altera dado. Pode rodar quantas vezes quiser.
-- ============================================================================

create or replace function public.quem_sou_eu()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

grant execute on function public.quem_sou_eu() to anon, authenticated;
