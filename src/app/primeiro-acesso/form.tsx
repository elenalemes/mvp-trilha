"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { definirPrimeiroAcesso } from "@/app/actions/convite";
import { Alert, Button, Input } from "@/components/ui";

/**
 * Definir a senha e entrar.
 *
 * A confirmação existe porque não há "esqueci minha senha" ainda: errar a
 * digitação aqui deixaria o corretor fora, com o convite já queimado.
 */
export default function FormPrimeiroAcesso({ token }: { token: string }) {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    setEnviando(true);
    const r = await definirPrimeiroAcesso(token, senha);
    setEnviando(false);

    if (!r.ok) {
      setErro(r.erro);
      return;
    }

    // A action já deixou a sessão pronta nos cookies.
    router.replace("/");
    router.refresh();
  };

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Crie uma senha
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Repita a senha
        </span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </label>

      {erro ? <Alert>{erro}</Alert> : null}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Criando o seu acesso…" : "Entrar na plataforma"}
      </Button>
    </form>
  );
}
