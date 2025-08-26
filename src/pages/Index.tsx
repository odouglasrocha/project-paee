import { Link } from "react-router-dom";
import Header from "@/components/Header";
import { Helmet } from "react-helmet-async";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Validação PAEE - Verificação rápida de código LS</title>
        <meta name="description" content="Validação PAEE: capture a embalagem e valide o código LS (dia juliano) automaticamente." />
        <link rel="canonical" href="/" />
      </Helmet>
      <Header />
      <main className="min-h-screen flex items-center justify-center bg-background">
        <section className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Validação PAEE</h1>
          <p className="text-xl text-muted-foreground">Capture a embalagem e valide o código LS (dia juliano) automaticamente.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/validar" className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent">
              Novo Registro
            </Link>
            <Link to="/acessos" className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent">
              Acessos
            </Link>
            <Link to="/controle-qualidade" className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent">
              Controle de Qualidade
            </Link>
          </div>
        </section>
      </main>
    </>
  );
};

export default Index;
