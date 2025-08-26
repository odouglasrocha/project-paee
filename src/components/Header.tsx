import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const LOGO_SRC = "/lovable-uploads/a5b84d8f-a9d6-4a98-a682-75c22d927401.png";

const Header: React.FC = () => {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="Ir para a página inicial">
          <img
            src={LOGO_SRC}
            alt="Logo MOTOR+ PepsiCo"
            className="h-10 md:h-12 w-auto"
            loading="eager"
          />
          <span className="sr-only">Início</span>
        </Link>
        <Link to="/" className="hidden sm:block">
          <Button variant="outline" size="sm" aria-label="Voltar para a tela principal">Início</Button>
        </Link>
      </div>
    </header>
  );
};

export default Header;
