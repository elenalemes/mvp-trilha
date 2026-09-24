import { TelaDeEntrada } from "@/components/publico";
import LoginForm from "./login-form";

/** Só caminhos internos: "/x", nunca "//outro-site" nem URL completa. */
function caminhoSeguro(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string }>;
}) {
  const { voltar } = await searchParams;
  return (
    <TelaDeEntrada>
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entrar no painel</h1>
        <p className="text-sm text-muted-foreground">Use o e-mail e a senha do seu acesso.</p>
      </div>
      <LoginForm voltar={caminhoSeguro(voltar)} />
    </TelaDeEntrada>
  );
}
