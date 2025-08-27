import React, { useEffect, useMemo, useRef, useState } from "react";

import Tesseract from "tesseract.js";
import { getDayOfYear, format, startOfWeek, addWeeks, getDay, differenceInCalendarWeeks } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import OcrCropper from "@/components/OcrCropper";
import CameraCapture from "@/components/CameraCapture";
import { preprocessImageFromUrl } from "@/lib/ocr";
import { CodigoJuliano } from "@/data/CodigoJuliano";
import Header from "@/components/Header";
interface RecordItem {
  id: string;
  timestamp: string; // ISO
  date: string; // ISO date selected
  operator: string;
  machine: string;
  codeDetected: string;
  expectedCode: string;
  result: "ok" | "mismatch" | "error";
  notes?: string;
}

const STORAGE_KEY = "paee-records";

const loadHistory = (): RecordItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecordItem[]) : [];
  } catch {
    return [];
  }
};

const saveHistory = (items: RecordItem[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

// Função para correção de caracteres comuns confundidos pelo OCR
const correctOCRErrors = (text: string): string => {
  let corrected = text;
  
  // Correções comuns de OCR
  corrected = corrected.replace(/[O0oQ]/g, '0'); // O, o, Q → 0
  corrected = corrected.replace(/[Il1|]/g, '1'); // I, l, | → 1
  corrected = corrected.replace(/[S5$]/g, '5'); // S, $ → 5 (mas preserva LS)
  corrected = corrected.replace(/[Z2]/g, '2'); // Z → 2
  corrected = corrected.replace(/[B8]/g, '8'); // B → 8
  corrected = corrected.replace(/[G6]/g, '6'); // G → 6
  corrected = corrected.replace(/[T7]/g, '7'); // T → 7
  corrected = corrected.replace(/[A4]/g, '4'); // A → 4
  corrected = corrected.replace(/[E3]/g, '3'); // E → 3
  corrected = corrected.replace(/[g9]/g, '9'); // g → 9
  
  // Corrige LS específicamente (pode ter sido alterado acima)
  corrected = corrected.replace(/L[5S]/g, 'LS');
  corrected = corrected.replace(/[1I]S/g, 'LS');
  
  return corrected;
};

// Função para extrair horário no formato HH:MM
const extractTime = (text: string): string => {
  const correctedText = correctOCRErrors(text);
  console.log('🕐 Buscando horário em:', correctedText);
  
  // Padrões para detectar horário
  const timePatterns = [
    // HH:MM formato padrão
    /\b([0-2]?[0-9]):([0-5][0-9])\b/g,
    // HH MM com espaço
    /\b([0-2]?[0-9])\s+([0-5][0-9])\b/g,
    // HHMM sem separador
    /\b([0-2][0-9])([0-5][0-9])\b/g
  ];
  
  for (const pattern of timePatterns) {
    const matches = Array.from(correctedText.matchAll(pattern));
    for (const match of matches) {
      const hour = parseInt(match[1], 10);
      const minute = parseInt(match[2], 10);
      
      // Valida horário (00-23:00-59)
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        console.log('🕐 Horário extraído:', formattedTime);
        return formattedTime;
      }
    }
  }
  
  console.log('❌ Nenhum horário válido encontrado');
  return '';
};

// Função otimizada para extrair código LS
const extractLSCode = (text: string): string => {
  const correctedText = correctOCRErrors(text);
  console.log('🏷️ Buscando código LS em:', correctedText);
  
  // Padrões robustos para detectar códigos LS
  const lotePatterns = [
    // LS seguido de 3-6 dígitos
    /\bLS\s*([0-9]{3,6})\b/gi,
    // L5 (confundido com LS)
    /\bL5\s*([0-9]{3,6})\b/gi,
    // Padrões com espaços e caracteres especiais
    /\bL[S5]\s*[\-_\s]*([0-9]{3,6})\b/gi,
    // Formato mais flexível
    /\b[L1I][S5]\s*([0-9]{3,6})\b/gi
  ];
  
  for (const pattern of lotePatterns) {
    const match = correctedText.match(pattern);
    if (match) {
      // Extrai apenas os números
      const numbers = match[0].replace(/[^0-9]/g, '');
      if (numbers.length >= 3) {
        const loteCode = `LS${numbers.substring(0, 6)}`; // Máximo 6 dígitos
        console.log('🏷️ Código LS extraído:', loteCode);
        return loteCode;
      }
    }
  }
  
  console.log('❌ Nenhum código LS válido encontrado');
  return '';
};

const pad3 = (n: number) => String(n).padStart(3, "0");

// Função otimizada para extrair data de validade
const extractExpiryDate = (text: string): { raw: string; iso: string } | null => {
  const originalText = (text || "").trim();
  const correctedText = correctOCRErrors(originalText);
  console.log('📅 Texto original:', originalText);
  console.log('🔧 Texto corrigido:', correctedText);
  
  // Padrões mais flexíveis para detectar datas em OCR
  const datePatterns = [
    // Padrão mais permissivo para dd/mm/yyyy
    /(\d{1,2})[\/.\-\s]+(\d{1,2})[\/.\-\s]+(\d{4})/g,
    // Padrão para dd/mm/yy
    /(\d{1,2})[\/.\-\s]+(\d{1,2})[\/.\-\s]+(\d{2})/g,
    // Padrão com prefixos mais flexível
    /(?:VAL|VALIDADE|VENC|VENCE|VENCT|EXP|DATA)?[^\d]{0,10}(\d{1,2})[\/.\-\s]+(\d{1,2})[\/.\-\s]+(\d{2,4})/gi,
    // Padrão muito flexível para capturar qualquer sequência de números que pareça data
    /\b(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})\b/g,
    // Padrão para datas com espaços extras
    /(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})/g,
    // Padrão para datas sem separadores (ddmmyyyy ou ddmmyy)
    /\b(\d{2})(\d{2})(\d{2,4})\b/g
  ];
  
  for (const pattern of datePatterns) {
    const matches = Array.from(correctedText.matchAll(pattern));
    for (const match of matches) {
      if (match[1] && match[2] && match[3]) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        let year = parseInt(match[3], 10);
        
        // Converte ano de 2 dígitos para 4 dígitos
        if (year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        }
        
        // Validação mais flexível de data
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2099) {
          // Validação básica para dias por mês (mais permissiva)
          const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Usa 29 para fevereiro sempre
          
          if (day <= daysInMonth[month - 1]) {
            const dd = day.toString().padStart(2, '0');
            const mm = month.toString().padStart(2, '0');
            const iso = `${year}-${mm}-${dd}`;
            
            // Tenta criar a data e verifica se é válida
            try {
              const date = new Date(year, month - 1, day);
              if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                const raw = `${dd}/${mm}/${year}`;
                console.log('📅 Data extraída:', raw);
                return { raw, iso };
              }
            } catch (error) {
              console.log('⚠️ Erro ao criar data:', error);
            }
          }
        }
        
        console.log('⚠️ Data não passou na validação:', { day, month, year });
      }
    }
  }
  
  // Fallback: tenta extrair qualquer sequência que pareça uma data
  console.log('🔍 Tentando fallback para extração de data...');
  const fallbackPattern = /(\d{1,2})[^\d]+(\d{1,2})[^\d]+(\d{2,4})/;
  const fallbackMatch = correctedText.match(fallbackPattern);
  
  if (fallbackMatch) {
    const day = parseInt(fallbackMatch[1], 10);
    const month = parseInt(fallbackMatch[2], 10);
    let year = parseInt(fallbackMatch[3], 10);
    
    // Converte ano de 2 dígitos
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    // Validação mínima
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dd = day.toString().padStart(2, '0');
      const mm = month.toString().padStart(2, '0');
      const raw = `${dd}/${mm}/${year}`;
      const iso = `${year}-${mm}-${dd}`;
      
      console.log('📅 Data extraída via fallback:', raw);
      return { raw, iso };
    }
  }
  
  console.log('❌ Nenhuma data válida encontrada');
  return null;
};

// Função para extrair dados completos no formato padronizado
const extractCompleteData = (text: string): string => {
  const correctedText = correctOCRErrors(text);
  const parts = [];
  
  // Extrai data
  const dateResult = extractExpiryDate(correctedText);
  if (dateResult) {
    parts.push(dateResult.raw);
  }
  
  // Extrai código de lote
  const loteCode = extractLSCode(correctedText);
  if (loteCode) {
    parts.push(loteCode);
  }
  
  // Extrai horário
  const timeCode = extractTime(correctedText);
  if (timeCode) {
    parts.push(timeCode);
  }
  
  const formatted = parts.join(' ');
  console.log('📋 Dados completos extraídos:', formatted);
  return formatted;
};

const Validate: React.FC = () => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(getBrazilTodayISO());
  const [operator, setOperator] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string>("");
  const [machine, setMachine] = useState("");
  const [notes, setNotes] = useState("");
  
  // Organização das máquinas por família de produtos
  const maquinasPorFamilia = {
    FOFURA: Array.from({ length: 20 }, (_, i) => {
      const num = i + 1;
      return { id: `EA${num.toString().padStart(2, '0')}`, nome: `EA${num.toString().padStart(2, '0')}` };
    }),
    TORCIDA: Array.from({ length: 25 }, (_, i) => {
      const num = i + 34;
      return { id: `EA${num.toString().padStart(2, '0')}`, nome: `EA${num.toString().padStart(2, '0')}` };
    })
  };
  
  // Máquinas disponíveis baseadas na família selecionada
  const maquinasDisponiveis = selectedFamily ? maquinasPorFamilia[selectedFamily as keyof typeof maquinasPorFamilia] || [] : [];
  
  // Reset máquina quando família muda
  useEffect(() => {
    if (selectedFamily && machine) {
      const maquinaExiste = maquinasDisponiveis.some(m => m.id === machine);
      if (!maquinaExiste) {
        setMachine("");
      }
    }
  }, [selectedFamily, machine, maquinasDisponiveis]);

  
  const [imageUrl, setImageUrl] = useState<string>("");
  const [ocrText, setOcrText] = useState<string>("");
  const [detectedCode, setDetectedCode] = useState<string>("");
  const [manualCode, setManualCode] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  const [detectedExpiryISO, setDetectedExpiryISO] = useState<string>("");

  type CapturedImage = {
    id: string;
    url: string;
    code: string;
    expiryISO: string;
    expiryRaw: string;
    refText: string;
  };
  const [images, setImages] = useState<(CapturedImage & { status: 'pending' | 'processing' | 'ok' | 'mismatch' | 'error'; message?: string; })[]>([]);
  const [controleQualidadeImages, setControleQualidadeImages] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Carrega imagens do ControleQualidade do localStorage
  useEffect(() => {
    const loadControleQualidadeImages = () => {
      try {
        const storedImages = localStorage.getItem('ea-images');
        if (storedImages) {
          const parsedImages = JSON.parse(storedImages);
          // Combina todas as imagens de todas as EAs
          const allImages = Object.values(parsedImages).flat() as any[];
          setControleQualidadeImages(allImages);
        }
      } catch (error) {
        console.error('Erro ao carregar imagens do ControleQualidade:', error);
      }
    };

    loadControleQualidadeImages();
    
    // Atualiza a cada 2 segundos para sincronizar com ControleQualidade
    const interval = setInterval(loadControleQualidadeImages, 2000);
    
    return () => clearInterval(interval);
  }, []);

  // Função para resetar imagens do ControleQualidade
  const resetControleQualidadeImages = () => {
    localStorage.removeItem('ea-images');
    setControleQualidadeImages([]);
    toast({ title: "Reset realizado", description: "Todas as imagens do Controle de Qualidade foram removidas." });
  };

  // Correção manual padrão com base em CodigoJuliano (Dia = dia do mês, ColX = mês)
  const manualDefaultFromTable = useMemo(() => {
    try {
      const d = parseISODateLocal(selectedDate);
      const day = d.getDate();
      const month = d.getMonth() + 1;
      const row: any = (CodigoJuliano as unknown as any[]).find((r) => Number((r as any).Dia) === day);
      const key = `Col${month}`;
      const val = row?.[key];
      return typeof val === "string" ? val.toUpperCase() : "";
    } catch {
      return "";
    }
  }, [selectedDate]);

  useEffect(() => {
    // Atualiza o campo de correção manual com o valor sugerido pela tabela
    setManualCode(manualDefaultFromTable || "");
  }, [manualDefaultFromTable]);

  // Helpers
  function getBrazilTodayISO(): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const day = parts.find(p => p.type === 'day')?.value ?? '01';
    const month = parts.find(p => p.type === 'month')?.value ?? '01';
    const year = parts.find(p => p.type === 'year')?.value ?? '1970';
    return `${year}-${month}-${day}`;
  }

  function formatISOToBR(iso: string, shortYear = false): string {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return "";
    return shortYear ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}/${y}`;
  }
  
  function parseISODateLocal(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  
  function buildReference(iso: string, code: string): string {
    const datePart = iso ? formatISOToBR(iso, true) : "";
    const codePart = (code || "").toUpperCase();
    return [datePart, codePart].filter(Boolean).join(" ");
  }

  const [history, setHistory] = useState<RecordItem[]>(loadHistory());
  const expectedCode = useMemo(() => {
    const d = new Date(selectedDate);
    const doy = getDayOfYear(d);
    return `LS${pad3(doy)}`;
  }, [selectedDate]);

  const codeToValidate = manualCode.trim() || detectedCode;

  // shelfExpirationForSelected removido: lógica substituída por comparação direta com Referência detectada


  // Validade detectada: baseada na Data do Registro (segunda-feira da semana correspondente), ancorada em 19/01/2026 e avançando 7 dias
  const weeklyBaseISOForSelected = useMemo(() => {
    const date = parseISODateLocal(selectedDate);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const isSunday = getDay(date) === 0;
    const effectiveMonday = isSunday ? addWeeks(weekStart, 1) : weekStart;

    const anchorMonday = new Date(2025, 7, 11); // 11/08/2025
    anchorMonday.setHours(0, 0, 0, 0);
    const baseExpiry = new Date(2026, 0, 26); // 26/01/2026
    baseExpiry.setHours(0, 0, 0, 0);

    const weeksPassed = differenceInCalendarWeeks(effectiveMonday, anchorMonday, { weekStartsOn: 1 });
    const expiry = addWeeks(baseExpiry, weeksPassed);
    return format(expiry, "yyyy-MM-dd");
  }, [selectedDate]);

  // Exibir sempre a base semanal (segunda-feira da semana corrente selecionada)
  const displayedExpiryISO = useMemo(() => {
    return weeklyBaseISOForSelected;
  }, [weeklyBaseISOForSelected]);

  const canSave = useMemo(() => images.length > 0 && images.every((img) => img.status === 'ok'), [images, displayedExpiryISO]);

  // OCR paralelo para imagens pendentes
  useEffect(() => {
    const toProcess = images
      .map((img, idx) => ({ img, idx }))
      .filter(({ img }) => img.status === 'pending' && !!img.url);
    if (toProcess.length === 0) return;

    // marca como processando
    setImages((prev) => {
      const copy = [...prev];
      toProcess.forEach(({ idx }) => {
        if (copy[idx]) copy[idx] = { ...copy[idx], status: 'processing', message: 'Lendo...' };
      });
      return copy;
    });

    Promise.all(
      toProcess.map(async ({ img, idx }) => {
        try {
          const preBlob = await preprocessImageFromUrl(img.url);
          const { data } = await Tesseract.recognize(preBlob, "por+eng", {
            logger: (m: string) => console.log(m),
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
            psm: 6,
          } as any);
          const fullText = data.text || "";
          console.log('📄 Texto OCR extraído:', fullText);
          
          // Usa funções otimizadas de extração
          const code = extractLSCode(fullText);
          const exp = extractExpiryDate(fullText);
          const timeCode = extractTime(fullText);
          const completeData = extractCompleteData(fullText);
          
          const newISO = exp?.iso ?? "";
          const newRaw = exp?.raw ?? "";
          const ref = buildReference(newISO, code);
          const match = Boolean(displayedExpiryISO && newISO && newISO === displayedExpiryISO);
          
          console.log('📊 Dados extraídos otimizados:', {
            code,
            date: newRaw,
            time: timeCode,
            complete: completeData
          });
          
          // Envia dados OCR para comunicação com ControleQualidade
          if (fullText) {
            const ocrData = {
              ocrText: fullText,
              expiryDate: newRaw,
              code: code,
              timeCode: timeCode,
              formattedData: completeData, // DD/MM/AAAA LS000 00:00
              machine: machine, // Adiciona máquina selecionada
              operator: operator, // Adiciona operador
              selectedFamily: selectedFamily, // Adiciona família
              timestamp: new Date().toISOString()
            };
            localStorage.setItem('paee-ocr-data', JSON.stringify(ocrData));
            console.log('Dados enviados do Validate para ControleQualidade:', ocrData);
          }
          
          setImages((prev) => {
            const copy = [...prev];
            if (copy[idx]) {
              copy[idx] = { ...copy[idx], code, expiryISO: newISO, expiryRaw: newRaw, refText: ref, status: match ? 'ok' : 'mismatch', message: match ? 'OK' : 'Data diferente da selecionada' };
            }
            return copy;
          });
        } catch (e) {
          console.error(e);
          setImages((prev) => {
            const copy = [...prev];
            if (copy[idx]) {
              copy[idx] = { ...copy[idx], status: 'error', message: 'Falha na leitura' };
            }
            return copy;
          });
        }
      })
    ).catch(() => {});
  }, [images, displayedExpiryISO]);

  // Aviso quando datas divergem
  const lastWarnKeyRef = useRef<string>("");

  useEffect(() => {
    if (detectedExpiryISO && displayedExpiryISO && detectedExpiryISO !== displayedExpiryISO) {
      const key = `${displayedExpiryISO}|${detectedExpiryISO}`;
      if (lastWarnKeyRef.current !== key) {
        lastWarnKeyRef.current = key;
        toast({
          title: "Atenção!",
          description: `A data selecionada (${formatISOToBR(displayedExpiryISO)}) não corresponde à data da leitura (${formatISOToBR(detectedExpiryISO)}).`,
          variant: "destructive",
        });
      }
    }
  }, [detectedExpiryISO, displayedExpiryISO, toast]);

  // SEO
  useEffect(() => {
    document.title = "Validação PAEE - Captura e OCR";

    // Simple meta + canonical for SEO
    const metaDesc = document.createElement("meta");
    metaDesc.name = "description";
    metaDesc.content = "Validação de data de validade PAEE com captura de imagem e OCR (LS + dia do ano).";
    document.head.appendChild(metaDesc);

    const linkCanonical = document.createElement("link");
    linkCanonical.rel = "canonical";
    linkCanonical.href = window.location.href;
    document.head.appendChild(linkCanonical);

    return () => {
      document.head.removeChild(metaDesc);
      document.head.removeChild(linkCanonical);
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    setOcrText("");
    setDetectedCode("");

    setProcessing(true);
    (async () => {
      try {
        const preBlob = await preprocessImageFromUrl(imageUrl);
        const { data } = await Tesseract.recognize(preBlob, "por+eng", {
          logger: (m: string) => console.log(m),
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
          psm: 6,
        } as any);
        const fullText = data.text || "";
        console.log('📄 Texto OCR extraído (segunda seção):', fullText);
        
        // Usa funções otimizadas de extração
        const code = extractLSCode(fullText);
        const exp = extractExpiryDate(fullText);
        const timeCode = extractTime(fullText);
        const completeData = extractCompleteData(fullText);
        
        const newDetectedISO = exp?.iso ?? "";
        
        console.log('📊 Dados extraídos otimizados (segunda seção):', {
          code,
          date: exp?.raw,
          time: timeCode,
          complete: completeData
        });
        const newDetectedRaw = exp?.raw ?? "";
        const ref = buildReference(newDetectedISO, code);
        setDetectedCode(code);
        setOcrText(ref);
        const match = Boolean(displayedExpiryISO && newDetectedISO && newDetectedISO === displayedExpiryISO);
        setImages((prev) => {
          if (activeIndex < 0 || activeIndex >= prev.length) return prev;
          const copy = [...prev];
          copy[activeIndex] = { ...copy[activeIndex], code, expiryISO: newDetectedISO, expiryRaw: newDetectedRaw, refText: ref, status: match ? 'ok' : 'mismatch', message: match ? 'OK' : 'Data diferente da selecionada' };
          return copy;
        });
      } catch (e) {
        console.error(e);
        toast({
          title: "Erro na leitura",
          description: "Não foi possível ler a data. Por favor, repita a captura com melhor iluminação.",
          variant: "destructive",
        });
      } finally {
        setProcessing(false);
      }
    })();
  }, [imageUrl, activeIndex, toast]);

  const addNewImage = (file: File) => {
    if (images.length >= 8) {
      toast({ title: "Limite de imagens", description: "Você pode adicionar até 8 imagens.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(file);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const idx = images.length;
    setImages((prev) => [...prev, { id, url, code: "", expiryISO: "", expiryRaw: "", refText: "", status: 'pending' }]);
    setActiveIndex(idx);
    setImageUrl(url);
    
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addNewImage(f);
    e.currentTarget.value = "";
  };

  const onSave = () => {
    const result: RecordItem = {
      id: `${Date.now()}`,
      timestamp: new Date().toISOString(),
      date: selectedDate,
      operator,
      machine,
      codeDetected: codeToValidate || "",
      expectedCode,
      result: canSave ? "ok" : "error",
      notes: notes || undefined,
    };
    const newHistory = [result, ...history].slice(0, 50);
    setHistory(newHistory);
    saveHistory(newHistory);

    toast({ title: "Registro salvo!", description: "Validade corresponde à tabela ShelfLifeWeekly." });
  };

  const handleReadSelectedArea = async () => {
    if (!imageUrl || !selectionRect) return;
    setProcessing(true);
    try {
      const preBlob = await preprocessImageFromUrl(imageUrl, selectionRect);
      const { data } = await Tesseract.recognize(preBlob, "por+eng", {
        logger: (m: string) => console.log(m),
        tessedit_char_whitelist: "0123456789./-",
        psm: 7,
      } as any);
      const selText = data.text || "";
      console.log('📄 Texto OCR extraído (seleção):', selText);
      
      // Usa funções otimizadas de extração
      const code = extractLSCode(selText);
      const exp = extractExpiryDate(selText);
      const timeCode = extractTime(selText);
      const completeData = extractCompleteData(selText);
      
      setDetectedCode(code);
      const newISO = exp?.iso ?? "";
      const newRaw = exp?.raw ?? "";
      const ref = buildReference(newISO, code);
      setOcrText(ref);
      
      console.log('📊 Dados extraídos otimizados (seleção):', {
        code,
        date: newRaw,
        time: timeCode,
        complete: completeData
      });
      
      // Envia dados OCR para comunicação com ControleQualidade
      if (selText) {
        const ocrData = {
          ocrText: selText,
          expiryDate: newRaw,
          timeCode: timeCode,
          formattedData: completeData, // DD/MM/AAAA LS000 00:00
          code: code,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('paee-ocr-data', JSON.stringify(ocrData));
      }
      
      const match = Boolean(displayedExpiryISO && newISO && newISO === displayedExpiryISO);
      setImages((prev) => {
        if (activeIndex < 0 || activeIndex >= prev.length) return prev;
        const copy = [...prev];
        copy[activeIndex] = { ...copy[activeIndex], code, expiryISO: newISO, expiryRaw: newRaw, refText: ref, status: match ? 'ok' : 'mismatch', message: match ? 'OK' : 'Data diferente da selecionada' };
        return copy;
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Erro na leitura",
        description: "Não foi possível ler a data na área selecionada.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="container mx-auto px-4 py-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Captura de Imagem</CardTitle>
              <CardDescription>Use a câmera para focar a data/código. Dica: boa iluminação e enquadramento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="photo">Foto da Embalagem</Label>
                  <Input id="photo" type="file" accept="image/*" capture="environment" onChange={onFileChange} />
                  <CameraCapture onCapture={(file) => addNewImage(file)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Data do Registro</Label>
                  <Input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>

              {imageUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pré-visualização</span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="zoom" className="text-sm">Zoom</Label>
                      <Input id="zoom" type="range" min={50} max={200} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
                      <Button variant="secondary" size="sm" onClick={handleReadSelectedArea} disabled={!selectionRect || processing}>
                        Ler área selecionada
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-md overflow-hidden bg-muted/20 p-2">
                    <OcrCropper
                      imageUrl={imageUrl}
                      zoomPercent={zoom}
                      onSelectionChange={setSelectionRect}
                    />
                  </div>
                </div>
              )}

              {images.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Imagens capturadas (Qtd: {images.length}/8)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {images.map((img, idx) => (
                      <div key={img.id} className={`border rounded-md p-1 ${idx === activeIndex ? "ring-2 ring-ring" : ""}`}>
                        <button type="button" className="block w-full" onClick={() => {
                          setActiveIndex(idx);
                          setImageUrl(img.url);
                          setOcrText(img.refText);
                          setDetectedCode(img.code);
                          setDetectedExpiryISO(img.expiryISO);
                          
                        }}>
                          <img src={img.url} alt={`Imagem ${idx + 1} - ${img.refText || "sem referência"}`} className="w-full h-24 object-cover rounded" loading="lazy" />
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground break-all">{img.refText || "Referência não lida"}</p>
                        <p className={`text-[10px] mt-0.5 ${img.status === 'ok' ? 'text-green-600' : img.status === 'mismatch' ? 'text-red-600' : img.status === 'processing' ? 'text-muted-foreground' : 'text-muted-foreground'}`}>{img.status === 'ok' ? `OK (${img.expiryISO ? formatISOToBR(img.expiryISO) : '—'})` : img.status === 'mismatch' ? `Divergente (${img.expiryISO ? formatISOToBR(img.expiryISO) : '—'})` : img.status === 'processing' ? 'Lendo...' : img.status === 'error' ? 'Erro na leitura' : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block">Referência detectada</Label>
                  <Input value={ocrText} readOnly placeholder="ex.: 18/01/26 LS000" />
                  {processing && <p className="text-xs text-muted-foreground mt-1">Lendo imagem...</p>}
                </div>
                <div>
                  <Label className="mb-1 block">Código esperado (CodigoJuliano)</Label>
                  <Input value={manualCode} onChange={(e) => setManualCode(e.target.value.toUpperCase())} placeholder="LS000" />
                </div>
              </div>

                <div>
                  <Label className="mb-1 block">Validade detectada</Label>
                  <Input
                    value={displayedExpiryISO ? formatISOToBR(displayedExpiryISO) : ""}
                    readOnly
                    placeholder="dd/mm/aaaa"
                  />
                </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label className="mb-1 block">Operador</Label>
                  <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Nome do operador" />
                </div>
                <div>
                  <Label className="mb-1 block">Família do Produto</Label>
                  <Select value={selectedFamily} onValueChange={setSelectedFamily}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar família" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOFURA">FOFURA</SelectItem>
                      <SelectItem value="TORCIDA">TORCIDA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">Nº da Máquina (EA)</Label>
                  <Select value={machine} onValueChange={setMachine} disabled={!selectedFamily}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedFamily ? "Selecionar máquina" : "Selecione família primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      {maquinasDisponiveis.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-1 block">Observações (opcional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Informações adicionais" />
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="text-sm">Data selecionada: <strong>{displayedExpiryISO ? formatISOToBR(displayedExpiryISO) : ""}</strong></p>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => {
                      const testData = {
                        ocrText: "Teste OCR 26/01/26 LS223",
                        expiryDate: "26/01/26",
                        code: "LS223",
                        machine: machine,
                        operator: operator,
                        selectedFamily: selectedFamily,
                        timestamp: new Date().toISOString()
                      };
                      localStorage.setItem('paee-ocr-data', JSON.stringify(testData));
                      console.log('🧪 Dados de teste enviados:', testData);
                    }}
                  >
                    🧪 Testar Comunicação
                  </Button>
                  <p className="text-sm">Código esperado (CodigoJuliano): <strong>{manualCode}</strong></p>
                </div>
                <Button onClick={onSave} disabled={!canSave}>
                  Salvar registro
                </Button>
              </div>

              {images.length > 0 && (
                <div className="mt-2 text-sm">
                  {images.every((img) => img.status === 'ok') ? (
                    <span className="text-green-600">Todas as imagens conferem com a data selecionada {formatISOToBR(displayedExpiryISO)}.</span>
                  ) : images.some((img) => img.status === 'mismatch') ? (
                    <span className="text-red-600">
                      Atenção! Uma ou mais imagens não correspondem à data selecionada ({formatISOToBR(displayedExpiryISO)}).{' '}
                      Datas lidas: {Array.from(new Set(images.map((i) => i.expiryISO).filter(Boolean))).map((d) => formatISOToBR(d as string)).join(', ') || '—'}.
                    </span>
                  ) : images.some((img) => img.status === 'processing') ? (
                    <span className="text-muted-foreground">Lendo imagens...</span>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Nova seção para exibir imagens do ControleQualidade */}
          <Card>
            <CardHeader>
              <CardTitle>Imagens do Controle de Qualidade</CardTitle>
              <CardDescription>Imagens capturadas através do botão Teste no Controle de Qualidade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Imagens capturadas (Qtd: {controleQualidadeImages.length}/8)
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={resetControleQualidadeImages}
                  disabled={controleQualidadeImages.length === 0}
                >
                  🔄 Reset
                </Button>
              </div>
              
              {controleQualidadeImages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma imagem capturada ainda. Use o botão "🧪 Teste" no Controle de Qualidade para capturar imagens.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {controleQualidadeImages.map((image, idx) => (
                    <div key={image.id} className="border rounded-md p-1">
                      <img 
                        src={image.thumbnail} 
                        alt={`Imagem ${idx + 1} - EA ${image.eaKey}`} 
                        className="w-full h-24 object-cover rounded" 
                        loading="lazy" 
                      />
                      <p className="mt-1 text-xs text-muted-foreground break-all">
                        EA: {image.eaKey}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(image.timestamp).toLocaleString('pt-BR')}
                      </p>
                      {image.ocrData && (
                        <div className="text-[10px] mt-1">
                          {image.ocrData.expiryDate && (
                            <p className="text-green-600">Data: {image.ocrData.expiryDate}</p>
                          )}
                          {image.ocrData.lsCode && (
                            <p className="text-blue-600">Código: {image.ocrData.lsCode}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leitura completa (OCR)</CardTitle>
              <CardDescription>Texto bruto reconhecido para auditoria.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={ocrText} readOnly placeholder="Texto reconhecido aparecerá aqui" className="min-h-32" />
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico recente</CardTitle>
              <CardDescription>Últimos registros salvos localmente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
              )}
              {history.slice(0, 8).map((r) => (
                <div key={r.id} className="rounded-md border p-2">
                  <p className="text-sm font-medium">{format(new Date(r.date), "dd/MM/yyyy")} • {r.codeDetected}</p>
                  <p className="text-xs text-muted-foreground">Esperado: {r.expectedCode} • {r.result === "ok" ? "OK" : "Inconsistência"}</p>
                </div>
              ))}
              {history.length > 0 && (
                <Button variant="secondary" onClick={() => { localStorage.removeItem(STORAGE_KEY); setHistory([]); }}>Limpar histórico</Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual rápido</CardTitle>
              <CardDescription>Dicas para melhor leitura.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-4 text-sm space-y-1 text-muted-foreground">
                <li>Use boa iluminação e evite reflexos.</li>
                <li>Enquadre o código de validade sem distorções.</li>
                <li>Use o controle de zoom para facilitar a leitura.</li>
                <li>Se o OCR falhar, digite manualmente em "Correção manual".</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
};

export default Validate;
