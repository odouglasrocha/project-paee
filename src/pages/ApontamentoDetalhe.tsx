import Header from "@/components/Header";
import CameraCapture from "@/components/CameraCapture";
import MachinePhotosOcr from "@/components/MachinePhotosOcr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useProduction } from "@/context/ProductionContext";
import { findConjuntoBySlug } from "@/data/conjuntos";
import { materialsData } from "@/data/MaterialsData";

// ================= Utilities =================
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const nfPtBR2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPtBR2 = (n?: number) => (n == null ? "" : nfPtBR2.format(n));
const nfPtBR3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const formatPtBR3 = (n?: number) => (n == null ? "" : nfPtBR3.format(n));
const parsePtBRNumber = (s: string): number | undefined => {
  if (!s) return undefined;
  const cleaned = s.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(/,/g, ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
};

const parseTimeToMinutes = (t?: string) => {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
};
const diffMinutes = (start?: string, end?: string) => {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return undefined;
  let d = e - s;
  if (d < 0) d += 24 * 60; // atravessa meia-noite
  return d;
};

// ================= Catalogs =================
const FAMILIAS = ["TORCIDA", "FOFURA", "QUEIJO", "PÃO DE ALHO", "CEBOLA"] as const;
const SHIFT_NUMS = ["1", "2", "3"] as const; // exibimos 1/2/3 e salvamos A/B/C
const MOTIVOS_PERDA = [
  "1 - MORDIDO BATATA GRANDE",
  "2 - MORDIDO CAÇAMBA COM FOLGA",
  "3 - FALTA DE AR",
  "4 - AJUSTE DE CORTE",
  "5 - SUJEIRA NO TÚNEL",
  "6 - SOBREpeso/SOBREescala",
] as const;
const DT_AREAS = ["MANUTENÇÃO", "ALMOXARIFADO", "QUALIDADE", "PRODUÇÃO"] as const;
const DT_EQUIPAMENTOS = ["EA-EMPACOTADORA", "EXTERNO", "FORNO", "MISTURADOR"] as const;
const DT_MOTIVOS = [
  "AJUSTE-POSIÇÃO DATA",
  "ATRASO ENTREGA DE MATERIAL",
  "PREVENTIVA PROGRAMADA",
] as const;

const getCategoria = (m: string) => (/(EA0\d|EA1\d)/.test(m) ? "Fofura" : "Torcida");

// ================= Reusable Time Select =================
const TimeSelect = ({
  label,
  hh,
  mm,
  onChange,
}: {
  label: string;
  hh: string;
  mm: string;
  onChange: (hh: string, mm: string) => void;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="grid grid-cols-2 gap-2">
      <Select value={hh} onValueChange={(v) => onChange(v, mm)}>
        <SelectTrigger><SelectValue placeholder="HH" /></SelectTrigger>
        <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={mm} onValueChange={(v) => onChange(hh, v)}>
        <SelectTrigger><SelectValue placeholder="MM" /></SelectTrigger>
        <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
);

// ================= Machine Column (Card) =================
const MachineCard = ({ machine }: { machine: string }) => {
  const { machineData, updateMachineData, addPhoto, removePhoto } = useProduction();
  const { toast } = useToast();
  const data = machineData[machine] || {};

  // Time and downtime derived values
  const totalMin = useMemo(() => diffMinutes(data.hInicio, data.hFim) ?? 0, [data.hInicio, data.hFim]);
  const downtimeMin = Number(data.downtimeTotalMin) || 0;
  const opMin = Math.max(totalMin - downtimeMin, 0);

  // Production calculations (mantemos a lógica existente)
  const quantidadeBruta = Number(data.quantidadeBruta) || 0;
  const producaoLiquida = Number(data.producaoLiquida) || 0;
  const rendimento = quantidadeBruta > 0 ? (producaoLiquida / quantidadeBruta) * 100 : undefined;
  const disponibilidade = totalMin > 0 ? (opMin / totalMin) : undefined;
  const eficiencia = rendimento != null && disponibilidade != null ? rendimento * disponibilidade : undefined;
  const eficienciaDwt = totalMin > 0 ? ((totalMin - downtimeMin) / totalMin) * 100 : undefined;

  // Select values for times
  const hIni = data.hInicio?.split(":") ?? ["00", "00"];
  const hFim = data.hFim?.split(":") ?? ["00", "00"];
  const dtH = Math.floor(downtimeMin / 60);
  const dtM = downtimeMin % 60;

  const handleTimeChange = (key: "hInicio" | "hFim", hh: string, mm: string) => {
    const time = `${hh}:${mm}`;
    const other = key === "hInicio" ? data.hFim : data.hInicio;
    const minutosCalc = key === "hInicio" ? diffMinutes(time, other) : diffMinutes(other, time);
    const min = (minutosCalc ?? Number(data.minutos)) || 0;
    const ppmVal = Number(data.ppm) || 0;
    updateMachineData(machine, { [key]: time, minutos: minutosCalc ?? data.minutos, meta85: ppmVal * min * 0.85 });
  };

  const handleDowntimeChange = (hh: string, mm: string) => {
    const mins = Number(hh) * 60 + Number(mm);
    updateMachineData(machine, { downtimeTotalMin: mins });
  };

  const [openObs, setOpenObs] = useState(false);

  // Produtos filtrados por família
  const prods = useMemo(() =>
    materialsData.filter((mat) =>
      data.familia ? mat.Material.toUpperCase().includes((data.familia || '').toUpperCase()) : true
    ),
  [data.familia]);

  const categoria = getCategoria(machine);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{machine} <span className="text-muted-foreground font-normal">{categoria}</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Linha 1: Família e Turno */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Família</Label>
            <Select value={data.familia || ""} onValueChange={(v) => updateMachineData(machine, { familia: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {FAMILIAS.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Turno</Label>
            <Select value={data.turno === 'A' ? '1' : data.turno === 'B' ? '2' : data.turno === 'C' ? '3' : ''} onValueChange={(v) => {
              let start = ""; let end = ""; let t: 'A' | 'B' | 'C' = 'A';
              if (v === '1') { start = '05:40'; end = '14:00'; t = 'A'; }
              else if (v === '2') { start = '13:50'; end = '22:08'; t = 'B'; }
              else { start = '22:08'; end = '05:40'; t = 'C'; }
              const minutos = diffMinutes(start, end) ?? 0;
              const ppmVal = Number(data.ppm) || 0;
              updateMachineData(machine, { turno: t, hInicio: start, hFim: end, minutos, meta85: ppmVal * minutos * 0.85 });
            }}>
              <SelectTrigger><SelectValue placeholder="Turno" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {SHIFT_NUMS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Linha 2: Produto, PPM, Minuto, Meta 85% */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="md:col-span-2 space-y-2">
            <Label>Produto</Label>
            <Select
              value={data.materialCodigo || ""}
              onValueChange={(codigo) => {
                const mat = materialsData.find((m) => m.Codigo === codigo);
                const minutosVal = Number(data.minutos) || 0;
                const ppmVal = Number(mat?.PPm) || 0;
                updateMachineData(machine, { materialCodigo: codigo, ppm: mat?.PPm, meta85: ppmVal * minutosVal * 0.85 });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {prods.map((m) => (
                  <SelectItem key={m.Codigo} value={m.Codigo}>{m.Material}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ppm</Label>
            <Input
              type="number"
              value={data.ppm ?? ""}
              onChange={(e) => {
                const ppmVal = Number(e.target.value) || 0;
                const min = Number(data.minutos) || 0;
                updateMachineData(machine, { ppm: ppmVal, meta85: ppmVal * min * 0.85 });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Minuto</Label>
            <Input
              type="number"
              value={data.minutos ?? ""}
              onChange={(e) => {
                const min = Number(e.target.value) || 0;
                const ppmVal = Number(data.ppm) || 0;
                updateMachineData(machine, { minutos: min, meta85: ppmVal * min * 0.85 });
              }}
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label>Meta 85%</Label>
            <Input
              inputMode="decimal"
              value={formatPtBR3(data.meta85)}
              onChange={(e) => updateMachineData(machine, { meta85: parsePtBRNumber(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* Linha 3: H Início e H Final */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <TimeSelect label="H Início" hh={hIni[0]} mm={hIni[1]} onChange={(hh, mm) => handleTimeChange("hInicio", hh, mm)} />
          <TimeSelect label="H Final" hh={hFim[0]} mm={hFim[1]} onChange={(hh, mm) => handleTimeChange("hFim", hh, mm)} />
        </div>

        {/* Linha 4: Bolsas, Eficiência EA, Filme perdas, Lote */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="space-y-2">
            <Label>Bolsas produzidas</Label>
            <Input
              type="number"
              value={data.bolsasProduzidas ?? ""}
              onChange={(e) => updateMachineData(machine, { bolsasProduzidas: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Eficiência da EA</Label>
            <Input readOnly value={eficiencia != null ? `${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}).format(eficiencia)}%` : ""} />
          </div>
          <div className="space-y-2">
            <Label>Filme Perdas (kg)</Label>
            <Input
              type="number"
              step="0.001"
              value={data.filmePerdasKg ?? ""}
              onChange={(e) => updateMachineData(machine, { filmePerdasKg: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Lote</Label>
            <Input
              value={data.lote ?? ""}
              onChange={(e) => updateMachineData(machine, { lote: e.target.value })}
            />
          </div>
        </div>

        {/* Linha 5: Motivo perda, Ef.balança, Overpack, Tipo Parada */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Motivo da perda de filme</Label>
            <Select value={data.motivoPerdaFilme || ""} onValueChange={(v) => updateMachineData(machine, { motivoPerdaFilme: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Eficiência da balança</Label>
            <Input
              type="number"
              value={data.eficienciaBalanca ?? ""}
              onChange={(e) => updateMachineData(machine, { eficienciaBalanca: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Overpack (g)</Label>
            <Input
              type="number"
              step="0.1"
              value={data.overpackG ?? ""}
              onChange={(e) => updateMachineData(machine, { overpackG: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo Parada</Label>
            <Select value={data.tipoParada || ""} onValueChange={(v) => updateMachineData(machine, { tipoParada: v as any })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {(["ACIDENTAL", "HORAS SEM DEMANDA", "PROGRAMADA"] as const).map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Linha 6: Downtime e Eficiência DWT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <TimeSelect label="Downtime" hh={String(dtH).padStart(2, "0")} mm={String(dtM).padStart(2, "0")} onChange={(hh, mm) => handleDowntimeChange(hh, mm)} />
          <div className="space-y-2">
            <Label>Tempo DWT [min]</Label>
            <Input readOnly value={downtimeMin} />
          </div>
          <div className="space-y-2">
            <Label>Eficiência DWT (%)</Label>
            <Input readOnly value={eficienciaDwt != null ? `${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(eficienciaDwt)}%` : ""} />
          </div>
        </div>

        {/* Linha 7: Área, Equipamento, Observações */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="space-y-2">
            <Label>Downtime Área</Label>
            <Select value={data.downtimeArea || ""} onValueChange={(v) => updateMachineData(machine, { downtimeArea: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {DT_AREAS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Downtime Equipamento</Label>
            <Select value={data.downtimeEquipamento || ""} onValueChange={(v) => updateMachineData(machine, { downtimeEquipamento: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
                {DT_EQUIPAMENTOS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Dialog open={openObs} onOpenChange={setOpenObs}>
              <DialogTrigger asChild>
                <Button variant="outline">Observações</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Observações - {machine}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Texto</Label>
                  <Input value={data.observacoes ?? ""} onChange={(e) => updateMachineData(machine, { observacoes: e.target.value })} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Linha 8: Downtime Motivo */}
        <div className="space-y-2">
          <Label>Downtime Motivo</Label>
          <Select value={data.downtimeMotivo || ""} onValueChange={(v) => updateMachineData(machine, { downtimeMotivo: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent className="max-h-64 z-50 bg-background border shadow-md">
              {DT_MOTIVOS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fotos */}
        <div className="space-y-2" id={`photos-${machine}`}>
          <Label>Fotos</Label>
          <p className="text-xs text-muted-foreground">Qtd img.: {(data.photos || []).length}</p>
          <div className="flex flex-wrap gap-2">
            <MachinePhotosOcr machine={machine} photos={data.photos || []} onRemovePhoto={(photoUrl) => removePhoto(machine, photoUrl)} />
          </div>
          <CameraCapture
            onCapture={(file) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === "string") addPhoto(machine, reader.result);
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>

        {/* Rodapé: Home / Photo / Save */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Link to="/"><Button variant="ghost" size="sm">Home</Button></Link>
            <Button variant="outline" size="sm" onClick={() => {
              const el = document.getElementById(`photos-${machine}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }}>Photo</Button>
          </div>
          <Button size="sm" onClick={() => toast({ title: "Dados salvos", description: `Máquina ${machine}` })}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ================= Page =================
const ApontamentoDetalhe = () => {
  const { slug } = useParams<{ slug: string }>();
  
  const grupo = slug ? findConjuntoBySlug(slug) : null;

  if (!grupo) {
    return (
      <main className="container mx-auto px-4 py-10">
        <p className="text-center">Conjunto não encontrado.</p>
        <div className="mt-4 flex justify-center"><Button variant="outline" asChild><Link to="/apontamento">Voltar</Link></Button></div>
      </main>
    );
  }

  const scrollToPhotos = () => {
    const first = document.getElementById(`photos-${grupo.machines[0]}`);
    if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <Helmet>
        <title>{`${grupo.name} - Apontamento de Produção`}</title>
        <meta name="description" content={`Apontamento detalhado para o conjunto ${grupo.name}.`} />
        <link rel="canonical" href={`/apontamento/${slug}`} />
      </Helmet>
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Top: Home e Photo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost">Home</Button></Link>
            <Button variant="outline" onClick={scrollToPhotos}>Photo</Button>
          </div>
        </div>

        <h1 className="sr-only">Apontamento de Produção</h1>

        {/* 3 colunas responsivas */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {grupo.machines.map((m) => (
            <MachineCard key={m} machine={m} />
          ))}
        </section>
      </main>
    </>
  );
};

export default ApontamentoDetalhe;

