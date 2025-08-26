import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Validate from "./pages/Validate";
import Apontamento from "./pages/Apontamento";
import ApontamentoDetalhe from "./pages/ApontamentoDetalhe";
import Acessos from "./pages/Acessos";
import ControleQualidade from "./pages/ControleQualidade";
import { ProductionProvider } from "./context/ProductionContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ProductionProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/acessos" element={<Acessos />} />
                <Route path="/apontamento" element={<Apontamento />} />
                <Route path="/apontamento/:slug" element={<ApontamentoDetalhe />} />
                <Route path="/validar" element={<Validate />} />
                <Route path="/controle-qualidade" element={<ControleQualidade />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ProductionProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;