import { Link } from "react-router-dom";
import Header from "@/components/Header";
import { Helmet } from "react-helmet-async";
import { Card, CardContent } from "@/components/ui/card";
import { slugifyConjunto, splitByCategoria } from "@/data/conjuntos";

const MACHINE_IMG = "/lovable-uploads/9d222af5-6ef4-4e1f-a7c8-f7bb8567c7ae.png";

const GridSection = ({ title, items }: { title: string; items: string[] }) => (
  <section className="space-y-4">
    <header className="flex items-center justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
    </header>
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {items.map((name) => {
        const slug = slugifyConjunto(name);
        return (
          <Link key={name} to={`/apontamento/${slug}`} aria-label={`Abrir conjunto ${name}`} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="p-0">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-muted">
                  <img
                    src={MACHINE_IMG}
                    alt={`Máquina do conjunto ${name}`}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-center">{name}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  </section>
);

const Acessos = () => {
  const { fofura, torcida } = splitByCategoria();

  return (
    <>
      <Helmet>
        <title>Acessos - Seleção de conjuntos de máquinas</title>
        <meta name="description" content="Escolha o componente Fofura ou Torcida e acesse o conjunto de EAs correspondente." />
        <link rel="canonical" href="/acessos" />
      </Helmet>
      <Header />
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 space-y-8">
          <h1 className="text-2xl md:text-3xl font-bold">Apontamento de produção</h1>

          <GridSection title="Selecione o componente Fofura" items={fofura} />

          <hr className="border-t" />

          <GridSection title="Selecione o componente Torcida" items={torcida} />
        </div>
      </main>
    </>
  );
};

export default Acessos;
