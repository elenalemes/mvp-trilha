"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removerParceiro } from "@/app/actions/parceiros";
import { Alert, Button } from "@/components/ui";

/**
 * Remoção em dois passos, na própria tela.
 *
 * Sem `confirm()` do navegador de propósito: ele não diz o que vai acontecer
 * com o login, e some sozinho num toque errado no celular. Aqui a segunda
 * tela explica as duas consequências antes de a pessoa confirmar.
 *
 * Desativar é o caminho recomendado e está dito na tela — remover só faz
 * sentido para cadastro criado por engano.
 */
export function RemoverParceiro({
  id,
  nome,
  voltarPara,
}: {
  id: string;
  nome: string;
  voltarPara: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const remover = () =>
    iniciar(async () => {
      setErro(null);
      const resultado = await removerParceiro(id);
      if (resultado.erro) {
        setErro(resultado.erro);
        setConfirmando(false);
        return;
      }
      router.push(voltarPara);
      router.refresh();
    });

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/50 p-6">
      <h2 className="text-xl font-semibold text-red-800">Remover parceiro</h2>

      {confirmando ? (
        <>
          <p className="mt-2 text-[15px] text-red-800">
            Remover <strong>{nome}</strong> apaga o cadastro e o login dele. Ele perde o acesso na
            hora e isso não tem volta.
          </p>
          <p className="mt-2 text-sm text-red-700">
            Se a ideia é só tirar o acesso por enquanto, cancele e desmarque{" "}
            <strong>&ldquo;Parceiro ativo&rdquo;</strong> no formulário acima — o cadastro fica
            guardado e o acesso para de funcionar do mesmo jeito.
          </p>

          {erro ? (
            <div className="mt-4">
              <Alert>{erro}</Alert>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={remover}
              disabled={pendente}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
            >
              {pendente ? "Removendo…" : `Sim, remover ${nome}`}
            </button>
            <Button type="button" variant="ghost" disabled={pendente} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[15px] text-red-800">
            Apaga o cadastro e o login. Para apenas suspender o acesso, desmarque
            &ldquo;Parceiro ativo&rdquo; no formulário acima.
          </p>

          {erro ? (
            <div className="mt-4">
              <Alert>{erro}</Alert>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="mt-4 inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-red-700 transition-colors hover:bg-red-50"
          >
            Remover parceiro
          </button>
        </>
      )}
    </section>
  );
}
