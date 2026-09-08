-- ----------------------------------------------------------------------------
-- Sprint 2.4 · A incorporadora edita as próprias opções
-- ----------------------------------------------------------------------------
-- Na 2.1 a incorporadora só lia as opções dela: quem cadastrava era a Trilha,
-- no acordo comercial. Agora ela também edita, pelo perfil.
--
-- O recorte continua o mesmo — `minha_incorporadora_id()` — então ela não
-- alcança as opções de ninguém. A policy do admin, que é separada, segue
-- valendo em paralelo: as duas são avaliadas com "ou".
--
-- Só troca a policy. Nenhuma tabela, coluna ou dado muda.
-- ----------------------------------------------------------------------------

drop policy if exists opcao_pagamento_propria on public.opcao_pagamento;

create policy opcao_pagamento_propria on public.opcao_pagamento
  for all to authenticated
  using (incorporadora_id = public.minha_incorporadora_id())
  with check (incorporadora_id = public.minha_incorporadora_id());


-- ---------------------------------------------------------------- conferência

select polname as policy,
       case polcmd
         when 'r' then 'somente leitura'
         when '*' then 'leitura e escrita'
         else polcmd::text
       end as permite
from pg_policy
where polrelid = 'public.opcao_pagamento'::regclass
order by polname;
