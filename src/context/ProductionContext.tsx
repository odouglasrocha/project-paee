import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type MachineForm = {
  materialCodigo?: string;
  familia?: string; // ex.: Torcida, Fofura, etc.
  lote?: string;
  caixas?: number;
  turno?: "A" | "B" | "C";
  status?: "OK" | "Ajuste" | "Parado";
  // Produção
  bolsasProduzidas?: number;
  ppm?: number; // peças por minuto
  hInicio?: string; // HH:MM
  hFim?: string; // HH:MM
  minutos?: number;
  // Nova tela - metas e produção
  meta85?: number; // valor numérico informado
  bobinasBrutas?: number; // quantidade de bobinas brutas (unid.)
  quantidadeBruta?: number; // quantidade bruta (unid.)
  producaoLiquida?: number; // produção líquida (unid.)
  // Qualidade
  filmePerdasKg?: number;
  motivoPerdaFilme?: string;
  eficienciaBalanca?: number;
  overpackG?: number;
  // Downtime fields
  tipoParada?: "ACIDENTAL" | "HORAS SEM DEMANDA" | "PROGRAMADA";
  downtimeArea?: string;
  downtimeEquipamento?: string;
  downtimeMotivo?: string;
  downtimeTotalMin?: number; // total de minutos parado
  observacoes?: string;
  photos?: string[]; // data URLs
};

interface ProductionState {
  operatorName: string;
  selectedGroup: string | null;
  machineData: Record<string, MachineForm>; // key: machine code
}

interface ProductionContextValue extends ProductionState {
  setOperatorName: (name: string) => void;
  setSelectedGroup: (group: string | null) => void;
  updateMachineData: (machine: string, data: Partial<MachineForm>) => void;
  addPhoto: (machine: string, dataUrl: string) => void;
  removePhoto: (machine: string, photoUrl: string) => void;
  resetCurrentGroup: (machines: string[]) => void;
}

const defaultState: ProductionState = {
  operatorName: "",
  selectedGroup: null,
  machineData: {},
};

const ProductionContext = createContext<ProductionContextValue | undefined>(undefined);
const STORAGE_KEY = "production-state-v1";

export const ProductionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProductionState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    try {
      const stateToPersist: ProductionState = {
        operatorName: state.operatorName,
        selectedGroup: state.selectedGroup,
        machineData: Object.fromEntries(
          Object.entries(state.machineData).map(([k, v]) => {
            const { photos, ...rest } = v || {};
            return [k, rest as MachineForm];
          })
        ),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch (e) {
      console.warn("Falha ao persistir estado (quota possivelmente excedida). Fotos não são persistidas.", e);
    }
  }, [state]);

  const ctxValue = useMemo<ProductionContextValue>(() => ({
    ...state,
    setOperatorName: (name) => setState((s) => ({ ...s, operatorName: name })),
    setSelectedGroup: (group) => setState((s) => ({ ...s, selectedGroup: group })),
    updateMachineData: (machine, data) =>
      setState((s) => ({
        ...s,
        machineData: { ...s.machineData, [machine]: { ...s.machineData[machine], ...data } },
      })),
    addPhoto: (machine, dataUrl) =>
      setState((s) => ({
        ...s,
        machineData: {
          ...s.machineData,
          [machine]: { ...s.machineData[machine], photos: [...(s.machineData[machine]?.photos || []), dataUrl] },
        },
      })),
    removePhoto: (machine, photoUrl) =>
      setState((s) => ({
        ...s,
        machineData: {
          ...s.machineData,
          [machine]: { 
            ...s.machineData[machine], 
            photos: (s.machineData[machine]?.photos || []).filter(url => url !== photoUrl) 
          },
        },
      })),
    resetCurrentGroup: (machines) =>
      setState((s) => {
        const copy = { ...s.machineData };
        machines.forEach((m) => delete copy[m]);
        return { ...s, machineData: copy };
      }),
  }), [state]);

  return <ProductionContext.Provider value={ctxValue}>{children}</ProductionContext.Provider>;
};

export const useProduction = () => {
  const ctx = useContext(ProductionContext);
  if (!ctx) throw new Error("useProduction must be used within ProductionProvider");
  return ctx;
};
