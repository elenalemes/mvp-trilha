import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-display text-sm font-semibold tracking-[0.18em] text-trilha-500 uppercase">
            Trilha
          </p>
          <h1 className="mt-1 text-3xl font-bold text-trilha-900">Painel interno</h1>
          <p className="mt-2 text-[15px] text-trilha-400">
            Acesso do time da Trilha para cadastro de incorporadoras parceiras.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
