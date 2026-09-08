-- ============================================================================
-- Permitir que a incorporadora edite a propria ficha
--
-- Ate agora ela so podia LER os proprios dados (policy incorporadora_propria).
-- Esta policy adiciona a permissao de ATUALIZAR, com dois cuidados:
--
--   using       -> so alcanca a linha cujo conta_id e o dela
--   with check  -> a linha depois da alteracao TAMBEM precisa ter o conta_id
--                  dela, o que a impede de transferir a ficha para outra conta
--
-- Rode este arquivo inteiro. Nao altera nenhum dado.
-- ============================================================================

drop policy if exists incorporadora_atualiza_propria on public.incorporadora;

create policy incorporadora_atualiza_propria on public.incorporadora
  for update to authenticated
  using (conta_id = auth.uid())
  with check (conta_id = auth.uid());
