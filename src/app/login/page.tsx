import { TelaDeEntrada } from "@/components/publico";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <TelaDeEntrada>
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entrar no painel</h1>
        <p className="text-sm text-muted-foreground">Use o e-mail e a senha do seu acesso.</p>
      </div>
      <LoginForm />
    </TelaDeEntrada>
  );
}
