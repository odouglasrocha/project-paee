import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Check, X, ArrowLeft, Calendar, User, Settings, AlertTriangle, FileText, Clock, Camera } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import React, { useState, useEffect } from "react";
import Tesseract from "tesseract.js";
import { preprocessImageFromUrl } from "@/lib/ocr";
import { format, startOfWeek, addWeeks, getDay, differenceInCalendarWeeks } from "date-fns";
import CameraCapture from "@/components/CameraCapture";

const ControleQualidade = () => {
  const [selectedOperador, setSelectedOperador] = useState("");
  const [selectedMaquina, setSelectedMaquina] = useState("");
  const [produto, setProduto] = useState("");
  const [gramagem, setGramagem] = useState("");
  const [analysisData, setAnalysisData] = useState<{[key: string]: 'verde' | 'amarelo' | 'vermelho' | 'na' | null}>({});
  const [capturedExpiryDate, setCapturedExpiryDate] = useState<string>("");
  
  // Estados para modal de processamento
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");
  const [processingEA, setProcessingEA] = useState("");
  
  // Estado para cronômetros de cada EA
  const [timers, setTimers] = useState<{[key: string]: string}>({});
  
  // Configuração fixa da largura das colunas
  const columnWidth = 24; // largura em pixels
  
  // Configuração do tamanho da fonte da data de validade
  const dateTextSize = "text-[8px]"; // opções: text-[8px], text-[10px], text-xs, text-sm
  
  // Estado para armazenar valores selecionados dos dropdowns de gramagem
  const [gramagemValues, setGramagemValues] = useState<{[key: string]: string}>({});
  
  // Opções de gramagem disponíveis
  const gramagemOptions = ["35G", "60G", "100G", "120G", "210G", "420G"];
  
  // Função para atualizar valor da gramagem
  const updateGramagemValue = (columnIndex: number, value: string) => {
    setGramagemValues(prev => ({ ...prev, [`gramagem-${columnIndex}`]: value }));
  };
  
  // Estado para armazenar horários de análise
  const [analysisTimeValues, setAnalysisTimeValues] = useState<{[key: string]: string}>({});
  
  // Função para registrar horário da análise (fuso horário São Paulo)
  const registerAnalysisTime = (columnIndex: number) => {
    const now = new Date();
    const saoPauloTime = now.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
    setAnalysisTimeValues(prev => ({ ...prev, [`analysis-time-${columnIndex}`]: saoPauloTime }));
  };
  
  // Sistema de upload de imagens por EA
  interface EAImage {
    id: string;
    url: string;
    thumbnail: string;
    timestamp: string;
    filename: string;
    eaKey: string;
    ocrData?: {
      detectedText: string;
      expiryDate: string;
      lsCode: string;
      timeCode?: string;
      formattedData?: string; // DD/MM/AAAA LS000 00:00
      isValidDate: boolean;
      isValidWeek: boolean;
      validationStatus?: 'valid' | 'divergent' | 'expired' | 'invalid';
      validationMessage?: string;
    };
  }
  
  interface OCRValidationResult {
    isValid: boolean;
    error?: string;
    data?: {
      detectedText: string;
      expiryDate: string;
      lsCode: string;
      isValidDate: boolean;
      isValidWeek: boolean;
    };
  }
  
  const [eaImages, setEaImages] = useState<{[eaKey: string]: EAImage[]}>({});
  const [uploadingEA, setUploadingEA] = useState<string | null>(null);
  
  // Função para criar thumbnail
  const createThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log('🖼️ Iniciando criação de thumbnail para:', file.name, 'Tamanho:', file.size);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('❌ Não foi possível obter contexto do canvas');
        reject(new Error('Canvas context not available'));
        return;
      }
      
      const img = new Image();
      
      img.onload = () => {
        console.log('✅ Imagem carregada:', img.width, 'x', img.height);
        
        const maxSize = 150;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        console.log('📐 Novo tamanho:', canvas.width, 'x', canvas.height);
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        
        console.log('✅ Thumbnail criado, tamanho:', dataUrl.length, 'caracteres');
        resolve(dataUrl);
      };
      
      img.onerror = (error) => {
        console.error('❌ Erro ao carregar imagem:', error);
        reject(new Error('Failed to load image'));
      };
      
      const objectUrl = URL.createObjectURL(file);
      console.log('🔗 Object URL criado:', objectUrl);
      img.src = objectUrl;
    });
  };
  
  // Função validateExpiryDate removida - agora usando a nova implementação com validação automática
  
  // Função para verificar intervalo de 1 hora
  const canUploadToEA = (eaKey: string): boolean => {
    const images = eaImages[eaKey] || [];
    console.log(`⏰ Verificando intervalo para ${eaKey}:`, {
      totalImages: images.length,
      images: images.map(img => ({ id: img.id, timestamp: img.timestamp }))
    });
    
    if (images.length === 0) {
      console.log(`✅ ${eaKey}: Primeira imagem, upload permitido`);
      return true;
    }
    
    const lastUpload = new Date(images[images.length - 1].timestamp);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastUpload.getTime()) / (1000 * 60 * 60);
    
    console.log(`⏰ ${eaKey}: Último upload há ${hoursDiff.toFixed(2)} horas`);
    
    const canUpload = hoursDiff >= 1;
    console.log(`${canUpload ? '✅' : '❌'} ${eaKey}: Upload ${canUpload ? 'permitido' : 'bloqueado'}`);
    
    return canUpload;
  };
  
  // Função para upload de imagem com validação OCR
  const handleImageUpload = async (eaKey: string, file: File) => {
    console.log('🔄 Iniciando upload para EA:', eaKey, 'Arquivo:', file.name);
    
    const images = eaImages[eaKey] || [];
    console.log('📊 Imagens atuais na EA:', images.length);
    
    // Verifica limite de 8 imagens
    if (images.length >= 8) {
      console.log('❌ Limite de 8 imagens atingido para', eaKey);
      alert(`Limite de 8 imagens atingido para ${eaKey}. Use o botão Reset para limpar e adicionar novas imagens.`);
      return;
    }
    
    // Verifica intervalo de 1 hora
    const canUpload = canUploadToEA(eaKey);
    console.log('⏰ Pode fazer upload?', canUpload);
    
    if (!canUpload) {
      console.log('❌ Intervalo de 1 hora não respeitado');
      alert("Aguarde pelo menos 1 hora desde o último upload para esta EA.");
      return;
    }
    
    setUploadingEA(eaKey);
    setProcessingEA(eaKey);
    setShowProcessingModal(true);
    setProcessingProgress(0);
    setProcessingStep('Iniciando processamento...');
    console.log('⏳ Processando upload...');
    
    try {
      // Cria thumbnail
      setProcessingProgress(10);
      setProcessingStep('Criando thumbnail...');
      console.log('🖼️ Criando thumbnail...');
      const thumbnail = await createThumbnail(file);
      const imageUrl = URL.createObjectURL(file);
      console.log('✅ Thumbnail criado com sucesso');
      
      setProcessingProgress(25);
      setProcessingStep('Otimizando imagem para OCR...');
      
      // OCR real da imagem capturada
      console.log('🔍 Iniciando OCR real da imagem capturada');
      
      let ocrText = "";
       try {
         console.log('📸 Processando imagem com Tesseract.js (otimizado com alta qualidade)...');
          
          // Redimensiona imagem mantendo alta qualidade para OCR eficiente
         const canvas = document.createElement('canvas');
         const ctx = canvas.getContext('2d');
         const img = new Image();
         
         const processedFile = await new Promise<Blob>((resolve) => {
           img.onload = () => {
              // Reduz para máximo 1200px mantendo alta qualidade
              const maxWidth = 1200;
              const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
              canvas.width = img.width * ratio;
              canvas.height = img.height * ratio;
              
              // Usa filtro de alta qualidade para redimensionamento
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              
              // Alta qualidade JPEG (95%) para preservar detalhes
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
              }, 'image/jpeg', 0.95);
            };
           img.src = URL.createObjectURL(file);
         });
         
         console.log('🔧 Imagem otimizada mantendo alta qualidade para OCR preciso');
         
         setProcessingProgress(50);
         setProcessingStep('Executando OCR...');
         
         // Importa Tesseract dinamicamente
         const Tesseract = await import('tesseract.js');
        
        // Executa OCR na imagem otimizada com configurações balanceadas (velocidade + qualidade)
           const { data: { text } } = await Tesseract.recognize(
             processedFile,
             'por',
             {
               logger: m => {
                 if (m.status === 'recognizing text') {
                   const ocrProgress = Math.round(m.progress * 100);
                   setProcessingProgress(50 + (ocrProgress * 0.25)); // 50% a 75%
                   console.log(`⚡ OCR Otimizado: ${ocrProgress}%`);
                 }
               },


             }
           );
        
        ocrText = text.trim();
        console.log('📄 Texto OCR extraído da imagem:', ocrText);
        
        if (!ocrText) {
          console.log('⚠️ Nenhum texto detectado na imagem');
          alert('Nenhum texto foi detectado na imagem. Tente uma imagem com melhor qualidade.');
          setUploadingEA(null);
          return;
        }
        
      } catch (error) {
        console.error('❌ Erro no OCR:', error);
        alert('Erro ao processar OCR da imagem: ' + error.message);
        setUploadingEA(null);
        return;
      }
      
      setProcessingProgress(75);
       setProcessingStep('Validando data de validade...');
       
       // Validação automática da data de validade
       console.log('🔍 Iniciando validação automática da data de validade');
       const validadeDetectada = "02/02/2026";
       
       // Extrai e analisa dados do texto OCR real com nova lógica otimizada
       const expiryData = parseExpiryData(ocrText);
       console.log('📊 Dados extraídos da imagem real:', expiryData);
       console.log('🔍 DEBUG - Data extraída para validação:', expiryData.fullDate);
       console.log('🔍 DEBUG - Código de lote extraído:', expiryData.loteCode);
       console.log('🔍 DEBUG - Horário extraído:', expiryData.timeCode);
       
       // Formata dados no padrão solicitado
       const formattedData = formatExtractedData(expiryData);
       console.log('📋 Dados formatados (DD/MM/AAAA LS000 00:00):', formattedData);
       
       // Valida a data extraída
       const validation = validateExpiryDate(expiryData.fullDate);
       console.log('✅ Resultado da validação:', validation);
       console.log('🔍 DEBUG - isValid:', validation.isValid, 'Status:', validation.status);
      
      // Bloqueia upload se data for inválida, vencida ou divergente
      console.log('🔍 DEBUG - Verificando validação:', {
        isValid: validation.isValid,
        status: validation.status,
        message: validation.message,
        fullDate: expiryData.fullDate
      });
      
      if (!validation.isValid) {
        console.log('❌ Upload bloqueado:', validation.message);
        console.log('🚫 DEBUG - Bloqueando upload devido à validação falhou');
        console.log('🛑 BLOQUEIO EFETIVO - Upload interrompido imediatamente');
        alert(`🚫 Upload bloqueado: ${validation.message}`);
        setUploadingEA(null);
        console.log('🔄 Estado resetado - uploadingEA definido como null');
        return; // BLOQUEIO EFETIVO - Para execução aqui
      }
      
      console.log('✅ DEBUG - Validação passou, continuando com upload');
      
      // Prepara dados OCR com validação e formato padronizado
      const validatedOcrData = {
        detectedText: ocrText,
        originalDate: expiryData.date,
        expiryDate: expiryData.fullDate,
        lsCode: expiryData.loteCode,
        timeCode: expiryData.timeCode,
        formattedData: formattedData, // DD/MM/AAAA LS000 00:00
        validationStatus: validation.status,
        validationMessage: validation.message,
        isValidDate: validation.isValid,
        isValidWeek: validation.isValid
      };
      
      console.log('✅ Dados OCR validados:', validatedOcrData);
      
      const newImage: EAImage = {
        id: Date.now().toString(),
        url: imageUrl,
        thumbnail,
        timestamp: new Date().toISOString(),
        filename: file.name,
        eaKey,
        ocrData: validatedOcrData // Adiciona dados OCR validados à imagem
      };
      
      setProcessingProgress(90);
      setProcessingStep('Salvando imagem...');
      console.log('💾 Salvando imagem:', newImage);
      
      setEaImages(prev => {
        const updated = {
          ...prev,
          [eaKey]: [...(prev[eaKey] || []), newImage]
        };
        console.log('📋 Estado atualizado:', updated);
        
        // Salva no localStorage para comunicação com Validate
        localStorage.setItem('ea-images', JSON.stringify(updated));
        console.log('💾 Imagens salvas no localStorage para Validate');
        
        return updated;
      });
      
      setProcessingProgress(100);
      setProcessingStep('Processamento concluído!');
      console.log('✅ Upload concluído com sucesso!');
      
      // Fecha o modal após um breve delay
      setTimeout(() => {
        setShowProcessingModal(false);
        setProcessingProgress(0);
        setProcessingStep('');
        setProcessingEA('');
      }, 1500);
      
    } catch (error) {
      console.error('❌ Erro ao processar imagem:', error);
      setProcessingStep('Erro no processamento');
      alert('Erro ao processar a imagem: ' + error);
      setShowProcessingModal(false);
      setProcessingProgress(0);
      setProcessingStep('');
      setProcessingEA('');
    } finally {
      setUploadingEA(null);
      console.log('🏁 Finalizando processo de upload');
    }
  };
  
  // Função para remover imagem
  const removeImage = (eaKey: string, imageId: string) => {
    setEaImages(prev => {
      const updated = {
        ...prev,
        [eaKey]: (prev[eaKey] || []).filter(img => img.id !== imageId)
      };
      
      // Atualiza localStorage
      localStorage.setItem('ea-images', JSON.stringify(updated));
      console.log('🗑️ Imagem removida e localStorage atualizado');
      
      return updated;
    });
  };
  
  // Função para validação OCR da imagem
  const performOCRValidation = async (file: File): Promise<OCRValidationResult> => {
    try {
      console.log('🔍 Iniciando análise OCR do arquivo:', file.name);
      
      // Pré-processa a imagem
      const imageUrl = URL.createObjectURL(file);
      const preprocessedBlob = await preprocessImageFromUrl(imageUrl);
      
      console.log('🖼️ Imagem pré-processada, iniciando OCR...');
      
      // Executa OCR
      const { data } = await Tesseract.recognize(preprocessedBlob, "por+eng", {
        logger: (m: any) => console.log('📖 OCR:', m.status, m.progress),
      } as any);
      
      const detectedText = data.text || "";
      console.log('📝 Texto detectado:', detectedText);
      
      // Extrai data de validade
      const expiryDate = extractExpiryDate(detectedText);
      console.log('📅 Data extraída:', expiryDate);
      
      // Extrai código LS
      const lsCode = extractLSCode(detectedText);
      console.log('🏷️ Código LS extraído:', lsCode);
      
      // Validações
      const validations = {
        hasText: detectedText.trim().length > 0,
        hasExpiryDate: !!expiryDate,
        hasLSCode: !!lsCode,
        isValidWeek: false,
        isValidDate: false
      };
      
      // Valida se a data está na semana atual
      if (expiryDate) {
        validations.isValidDate = true;
        validations.isValidWeek = validateExpiryDate(expiryDate).isValid;
      }
      
      console.log('✅ Validações:', validations);
      
      // Determina se a validação passou
      const isValid = validations.hasText && validations.hasExpiryDate && validations.isValidWeek;
      
      if (!isValid) {
        let error = "Validação falhou: ";
        if (!validations.hasText) error += "Nenhum texto detectado. ";
        if (!validations.hasExpiryDate) error += "Data de validade não encontrada. ";
        if (validations.hasExpiryDate && !validations.isValidWeek) {
          error += "Data não corresponde à semana atual. ";
        }
        
        return {
          isValid: false,
          error: error.trim()
        };
      }
      
      return {
        isValid: true,
        data: {
          detectedText,
          expiryDate: expiryDate || '',
          lsCode: lsCode || '',
          isValidDate: validations.isValidDate,
          isValidWeek: validations.isValidWeek
        }
      };
      
    } catch (error) {
      console.error('❌ Erro na validação OCR:', error);
      return {
        isValid: false,
        error: `Erro ao processar imagem: ${error}`
      };
    }
  };
  
  // Sistema simples de mapeamento EA → Máquina
  const [eaHeaders, setEaHeaders] = useState<{
    [key: string]: string; // EA1: "EA01", EA2: "EA02", etc.
  }>({});
  
  // Função para mapear máquina diretamente ao cabeçalho EA correspondente
  const updateEAHeader = (machineCode: string) => {
    console.log('🔄 updateEAHeader chamada com:', machineCode);
    
    if (!machineCode) {
      console.log('🧹 Limpando headers - máquina vazia');
      setEaHeaders({});
      return;
    }
    
    // Extrai o número da máquina (EA01 → 1, EA02 → 2, etc.)
    const machineNumber = machineCode.replace('EA', '').replace(/^0+/, '');
    const eaSlot = parseInt(machineNumber);
    
    console.log('🔍 Análise:', {
      original: machineCode,
      numeroExtraido: machineNumber,
      slotEA: eaSlot,
      valido: eaSlot >= 1 && eaSlot <= 4
    });
    
    // Verifica se é uma EA válida (1-4)
    if (eaSlot >= 1 && eaSlot <= 4) {
      setEaHeaders(prev => {
        console.log('📋 Headers antes da atualização:', prev);
        const newHeaders = { ...prev };
        
        // Remove a máquina de outros EAs (evita duplicatas)
        Object.keys(newHeaders).forEach(key => {
          if (newHeaders[key] === machineCode) {
            console.log(`🗑️ Removendo ${machineCode} de ${key}`);
            delete newHeaders[key];
          }
        });
        
        // Adiciona a máquina ao EA correspondente
        const eaKey = `EA${eaSlot}`;
        newHeaders[eaKey] = machineCode;
        console.log(`✅ Adicionando ${machineCode} ao ${eaKey}`);
        
        console.log('📋 Headers após atualização:', newHeaders);
        return newHeaders;
      });
    } else {
      console.log('❌ EA inválida - slot fora do range 1-4:', eaSlot);
    }
  };
  
  // Atualiza cabeçalho quando máquina é selecionada
  useEffect(() => {
    console.log('useEffect disparado - selectedMaquina mudou para:', selectedMaquina);
    updateEAHeader(selectedMaquina);
  }, [selectedMaquina]);
  
  // Debug do estado eaHeaders
  useEffect(() => {
    console.log('Estado eaHeaders atualizado:', eaHeaders);
  }, [eaHeaders]);
  
  // Função para converter data abreviada para formato completo
  const convertDateToFullFormat = (dateStr: string): string => {
    if (!dateStr) return "";
    
    // Remove espaços e normaliza separadores
    const normalized = dateStr.trim().replace(/[\s\-\.]/g, '/');
    const parts = normalized.split('/');
    
    if (parts.length !== 3) return "";
    
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    // Converte ano de 2 dígitos para 4 dígitos
    if (year < 100) {
      // Anos 00-49 = 2000-2049, anos 50-99 = 1950-1999
      year += year < 50 ? 2000 : 1900;
    }
    
    // Valida se é uma data válida
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
    
    return "";
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
  
  // Função otimizada para extrair data e código de lote do texto OCR
  const parseExpiryData = (text: string): { date: string, fullDate: string, loteCode: string, timeCode: string, isValid: boolean } => {
    const originalText = (text || "").trim();
    const correctedText = correctOCRErrors(originalText);
    console.log('🔍 Texto original:', originalText);
    console.log('🔧 Texto corrigido:', correctedText);
    
    // Padrões robustos para detectar datas DD/MM/AAAA
    const datePatterns = [
      // dd/mm/yyyy formato padrão
      /\b([0-3]?[0-9])[\/.\-]([0-1]?[0-9])[\/.\-]([2][0-9]{3})\b/g,
      // dd/mm/yy formato curto
      /\b([0-3]?[0-9])[\/.\-]([0-1]?[0-9])[\/.\-]([2-9][0-9])\b/g,
      // Padrões com espaços
      /\b([0-3]?[0-9])\s*[\/.\-]\s*([0-1]?[0-9])\s*[\/.\-]\s*([2][0-9]{3})\b/g,
      // Formato brasileiro com espaços
      /\b([0-3][0-9])\s*\/\s*([0-1][0-9])\s*\/\s*([2][0-9]{3})\b/g
    ];
    
    let extractedDate = "";
    let fullDate = "";
    
    // Busca por data com validação rigorosa
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
          
          // Validação rigorosa de data
          if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
            // Validação adicional para dias por mês
            const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            if (year % 4 === 0) daysInMonth[1] = 29; // Ano bissexto
            
            if (day <= daysInMonth[month - 1]) {
              extractedDate = match[0];
              fullDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
              break;
            }
          }
        }
      }
      if (extractedDate) break;
    }
    
    // Extrai código de lote LS com padrões robustos
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
    
    let loteCode = "";
    for (const pattern of lotePatterns) {
      const match = correctedText.match(pattern);
      if (match) {
        // Extrai apenas os números
        const numbers = match[0].replace(/[^0-9]/g, '');
        if (numbers.length >= 3) {
          loteCode = `LS${numbers.substring(0, 6)}`; // Máximo 6 dígitos
          break;
        }
      }
    }
    
    // Extrai horário
    const timeCode = extractTime(correctedText);
    
    console.log('📅 Data extraída:', extractedDate, '→', fullDate);
    console.log('🏷️ Código de lote:', loteCode);
    console.log('🕐 Horário extraído:', timeCode);
    
    return {
      date: extractedDate,
      fullDate,
      loteCode,
      timeCode,
      isValid: !!fullDate && !!loteCode
    };
  };

  // Função para obter data de validade detectada pelo sistema
  const getSystemDetectedDate = (): string => {
    try {
      const ocrData = localStorage.getItem('paee-ocr-data');
      if (ocrData) {
        const parsedData = JSON.parse(ocrData);
        if (parsedData.expiryDate) {
          // Converte data do formato dd/mm/yy para dd/mm/yyyy se necessário
          const convertedDate = convertDateToFullFormat(parsedData.expiryDate);
          console.log('📅 Data detectada pelo sistema:', parsedData.expiryDate, '→', convertedDate);
          return convertedDate;
        }
      }
    } catch (error) {
      console.error('❌ Erro ao obter data do sistema:', error);
    }
    return "";
  };

  // Função para validar data contra validade detectada pelo sistema
  const validateExpiryDate = (fullDate: string): { isValid: boolean, message: string, status: 'valid' | 'divergent' | 'expired' | 'invalid' } => {
    if (!fullDate) {
      return { isValid: false, message: "Data não encontrada", status: 'invalid' };
    }
    
    // Shelflife - Data de validade detectada pelo sistema (cálculo automático baseado na semana atual)
    const getValidadeDetectada = (): string => {
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const isSunday = getDay(today) === 0;
      const effectiveMonday = isSunday ? addWeeks(weekStart, 1) : weekStart;

      const anchorMonday = new Date(2025, 7, 11); // 11/08/2025
      anchorMonday.setHours(0, 0, 0, 0);
      const baseExpiry = new Date(2026, 0, 26); // 26/01/2026
      baseExpiry.setHours(0, 0, 0, 0);

      const weeksPassed = differenceInCalendarWeeks(effectiveMonday, anchorMonday, { weekStartsOn: 1 });
      const expiry = addWeeks(baseExpiry, weeksPassed);
      return format(expiry, "dd/MM/yyyy");
    };
    
    const validadeDetectada = getValidadeDetectada();
    
    // Compara com a validade detectada (calculada automaticamente)
    console.log('🔍 Comparando datas:', {
      informada: fullDate,
      validadeDetectada: validadeDetectada
    });
    
    // Verifica se a data não está vencida (apenas datas futuras)
    const today = new Date();
    const [day, month, year] = fullDate.split('/').map(Number);
    const expiryDate = new Date(year, month - 1, day);
    
    if (expiryDate <= today) {
      return { 
        isValid: false, 
        message: `Data vencida ❌ - Data da imagem: ${fullDate} | Validade da semana é: ${validadeDetectada}`, 
        status: 'expired' 
      };
    }
    
    // Compara com a validade detectada (deve ser exatamente igual)
    if (fullDate === validadeDetectada) {
      return { 
        isValid: true, 
        message: `Válido ✅ - Data da imagem: ${fullDate} | Validade da semana é: ${validadeDetectada}`, 
        status: 'valid' 
      };
    } else {
      return { 
        isValid: false, 
        message: `Divergente ❌ - Data da imagem: ${fullDate} | Validade da semana é: ${validadeDetectada}`, 
        status: 'divergent' 
      };
    }
  };

  // Função para extrair data de validade do texto OCR (mantida para compatibilidade)
  const extractExpiryDate = (text: string): string => {
    const result = parseExpiryData(text);
    return result.fullDate;
  };
  
  // Função para extrair código LS do texto OCR (usando nova lógica otimizada)
  const extractLSCode = (text: string): string => {
    const result = parseExpiryData(text);
    return result.loteCode;
  };
  
  // Função para formatar dados extraídos no padrão solicitado: DD/MM/AAAA LS000 00:00
  const formatExtractedData = (expiryData: { fullDate: string, loteCode: string, timeCode: string }): string => {
    const parts = [];
    
    if (expiryData.fullDate) {
      parts.push(expiryData.fullDate);
    }
    
    if (expiryData.loteCode) {
      parts.push(expiryData.loteCode);
    }
    
    if (expiryData.timeCode) {
      parts.push(expiryData.timeCode);
    }
    
    const formatted = parts.join(' ');
    console.log('📋 Dados formatados:', formatted);
    return formatted;
  };
  
  // Função para extrair dados completos no formato padrão
  const extractCompleteData = (text: string): string => {
    const expiryData = parseExpiryData(text);
    return formatExtractedData(expiryData);
  };
  
  // Simula recebimento de dados do OCR da validação PAEE
  const handleOcrDataReceived = (ocrData: any) => {
    console.log('ControleQualidade recebeu dados:', ocrData);
    
    // Usa a nova função de extração completa otimizada
    const completeData = extractCompleteData(ocrData.ocrText || '');
    console.log('📋 Dados completos extraídos:', completeData);
    
    // Extrai componentes individuais para compatibilidade
    const expiryData = parseExpiryData(ocrData.ocrText || '');
    const extractedDate = expiryData.fullDate;
    const extractedCode = expiryData.loteCode;
    const extractedTime = expiryData.timeCode;
    
    // Usa dados completos formatados como prioridade
    let combinedData = completeData;
    if (!combinedData) {
      // Fallback para compatibilidade
      if (extractedDate && extractedCode && extractedTime) {
        combinedData = `${extractedDate} ${extractedCode} ${extractedTime}`;
      } else if (extractedDate && extractedCode) {
        combinedData = `${extractedDate} ${extractedCode}`;
      } else if (extractedDate) {
        combinedData = extractedDate;
      } else if (extractedCode) {
        combinedData = extractedCode;
      }
    }
    
    if (combinedData) {
      setCapturedExpiryDate(combinedData);
    }
    
    // Atualiza dados do formulário se recebidos do Validate
    if (ocrData.machine) {
      console.log('Atualizando máquina selecionada para:', ocrData.machine);
      setSelectedMaquina(ocrData.machine);
    }
    if (ocrData.operator) {
      console.log('Atualizando operador para:', ocrData.operator);
      setSelectedOperador(ocrData.operator);
    }
  };
  
  // Escuta por dados do localStorage (comunicação entre páginas)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      console.log('Storage event detectado:', e.key, e.newValue);
      if (e.key === 'paee-ocr-data' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          console.log('Dados parseados do storage:', data);
          handleOcrDataReceived(data);
        } catch (error) {
          console.error('Erro ao processar dados OCR:', error);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Verifica se já existe dados no localStorage
    const existingData = localStorage.getItem('paee-ocr-data');
    if (existingData) {
      try {
        const data = JSON.parse(existingData);
        console.log('Dados existentes no localStorage:', data);
        handleOcrDataReceived(data);
      } catch (error) {
        console.error('Erro ao carregar dados OCR existentes:', error);
      }
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  
  // Cronômetro para atualizar timers das EAs
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: {[key: string]: string} = {};
      
      // Para cada EA, calcula o tempo restante
      ['EA1', 'EA2', 'EA3', 'EA4'].forEach(eaKey => {
        const images = eaImages[eaKey] || [];
        if (images.length > 0) {
          const lastImage = images[images.length - 1];
          const lastUploadTime = new Date(lastImage.timestamp).getTime();
          const now = Date.now();
          const timeDiff = now - lastUploadTime;
          const oneHour = 60 * 60 * 1000; // 1 hora em ms
          
          if (timeDiff < oneHour) {
            const remaining = oneHour - timeDiff;
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            newTimers[eaKey] = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
        }
      });
      
      setTimers(newTimers);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [eaImages]);
  
  const hoje = new Date().toLocaleDateString("pt-BR");
  const operadores = ["João Silva","Maria Santos","Pedro Oliveira","Ana Costa","Carlos Pereira","Lucia Rodrigues","Fernando Lima","Patricia Alves"];
  
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
  
  // Lista completa de máquinas para o dropdown
  const todasMaquinas = [
    ...maquinasPorFamilia.FOFURA,
    ...maquinasPorFamilia.TORCIDA
  ];
  
  const handleCellClick = (rowId: string, colId: string) => {
    const key = `${rowId}-${colId}`;
    const currentValue = analysisData[key];
    const nextValue = currentValue === 'verde' ? 'amarelo' : 
                     currentValue === 'amarelo' ? 'vermelho' : 
                     currentValue === 'vermelho' ? 'na' : 'verde';
    setAnalysisData(prev => ({ ...prev, [key]: nextValue }));
  };
  
  const getCellColor = (value: string | null) => {
    switch(value) {
      case 'verde': return 'bg-green-100 hover:bg-green-200';
      case 'amarelo': return 'bg-yellow-100 hover:bg-yellow-200';
      case 'vermelho': return 'bg-red-100 hover:bg-red-200';
      case 'na': return 'bg-gray-100 hover:bg-gray-200';
      default: return 'hover:bg-blue-50';
    }
  };

  return (
    <>
      <Helmet>
        <title>Controle de Qualidade - PepsiCo LATAM</title>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        {/* PepsiCo Header */}
        <div className="bg-gradient-to-r from-[#004B87] to-[#0066B3] shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center space-x-6">
                <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10 transition-colors">
                  <Link to="/" className="flex items-center gap-2">
                    <ArrowLeft size={18} />
                    Voltar
                  </Link>
                </Button>
                <Separator orientation="vertical" className="h-8 bg-white/20" />
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <FileText className="text-white" size={24} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Controle de Qualidade</h1>
                    <p className="text-blue-100 text-sm">Sistema PepsiCo</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Badge className="bg-[#E32934] text-white border-0 px-4 py-2">
                  <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                  Sistema Ativo
                </Badge>
                <div className="text-white text-right">
                  <div className="text-sm font-semibold">PepsiCo LATAM</div>
                  <div className="text-xs text-blue-100">Controle de Qualidade</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
          {/* Document Header - Compacto */}
          <div className="bg-white border-2 border-[#004B87] shadow-xl rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 border-b-2 border-[#004B87] bg-gradient-to-r from-[#004B87] via-[#0066B3] to-[#004B87]">
              {/* Left Column */}
              <div className="col-span-3 border-r-2 border-white/20 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-[#E32934] rounded-lg flex items-center justify-center text-white font-bold shadow-lg">
                    <FileText size={16} />
                  </div>
                  <div className="text-lg font-black tracking-tight text-white">PEPSICO</div>
                </div>
              </div>
              
              {/* Center Column */}
              <div className="col-span-6 border-r-2 border-white/20 p-3 text-center">
                <div className="font-black text-lg mb-2 text-white tracking-tight">CONTROLE DE QUALIDADE</div>
                <div className="text-xs font-bold text-[#E32934] bg-white px-2 py-1 rounded-full uppercase tracking-wide inline-block">EMPLACETADORAS</div>
              </div>
              
              {/* Right Column */}
              <div className="col-span-3 p-3 text-right space-y-1 text-xs">
                <div className="font-bold text-white">13/01/2017</div>
                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-[#E32934] text-white shadow-lg">
                  <div className="w-2 h-2 bg-white rounded-full mr-1 animate-pulse"></div>
                  ATIVO
                </div>
              </div>
            </div>
          </div>

          {/* Data Table - PepsiCo Branded (Upper) */}
          <div className="bg-white border-2 border-[#004B87] shadow-xl rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-[#004B87] via-[#0066B3] to-[#004B87] text-white">
                    <th className="border border-white/20 p-3 text-left font-bold w-20"></th>
                    <th className="border border-white/20 p-3 text-left font-bold w-64 uppercase tracking-wide">DADOS</th>
                    {Array.from({ length: 32 }).map((_, i) => (
                      <th
                        key={i}
                        className={`border border-white/20 p-2 text-center font-bold ${
                          (i + 1) % 8 === 0 ? "border-r-2 border-r-[#E32934] bg-[#0066B3]" : "bg-[#004B87]"
                        }`}
                        style={{ 
                          width: `${columnWidth}px`, 
                          minWidth: `${columnWidth}px`, 
                          maxWidth: `${columnWidth}px`,
                          overflow: 'hidden'
                        }}
                      >
                        {(i % 8) + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    "DATA:",
                    "RESPONSÁVEL:",
                    "Nº DA MÁQUINA",
                    "PRODUTO",
                    "GRAMAGEM",
                    "DATA VALIDADE / LOTE",
                    "HORÁRIO DA ANÁLISE",
                  ].map((item, j) => (
                    <tr key={`data-${j}`} className="hover:bg-slate-50 transition-all duration-200 group">
                       {j === 0 && (
                         <td
                           rowSpan={7}
                           className="border border-slate-300 p-3 font-bold bg-gradient-to-r from-slate-100 to-slate-50 text-center align-middle text-slate-700 uppercase tracking-wide"
                         >
                         </td>
                       )}
                       <td className="border border-slate-300 p-3 text-sm font-medium text-[#004B87] group-hover:text-[#0066B3] transition-colors bg-gradient-to-r from-blue-50 to-white">{item}</td>
                       {Array.from({ length: 32 }).map((_, k) => {
                         // Exibe data de validade das imagens salvas na linha "DATA VALIDADE / LOTE"
                         const isDataValidadeRow = item === "DATA VALIDADE / LOTE";
                         // Detecta se é a linha de GRAMAGEM
                         const isGramagemRow = item === "GRAMAGEM";
                         // Detecta se é a linha de HORÁRIO DA ANÁLISE
                         const isHorarioAnaliseRow = item === "HORÁRIO DA ANÁLISE";
                         
                         // Determina qual EA corresponde a esta coluna (cada 8 colunas = 1 EA)
                         const eaIndex = Math.floor(k / 8);
                         const eaKey = `EA${eaIndex + 1}`;
                         const imageIndex = k % 8;
                         
                         // Busca a imagem correspondente nesta posição da EA
                         const eaImagesForThisEA = eaImages[eaKey] || [];
                         const imageAtThisPosition = eaImagesForThisEA[imageIndex];
                         const shouldShowExpiryDate = isDataValidadeRow && imageAtThisPosition && imageAtThisPosition.ocrData?.expiryDate;
                         
                         // Registra horário automaticamente quando imagem é salva
                         if (imageAtThisPosition && !analysisTimeValues[`analysis-time-${k}`]) {
                           registerAnalysisTime(k);
                         }
                         
                         return (
                           <td
                             key={k}
                             className={`border border-slate-300 p-1 text-center align-middle h-12 ${
                               (k + 1) % 8 === 0 ? "border-r-2 border-r-[#E32934]" : ""
                             } hover:bg-blue-50 transition-colors`}
                             style={{ 
                               width: `${columnWidth}px`, 
                               minWidth: `${columnWidth}px`, 
                               maxWidth: `${columnWidth}px`,
                               overflow: 'hidden'
                             }}
                           >
                             {shouldShowExpiryDate ? (
                               <div className="flex flex-col items-center justify-center h-full px-1">
                                 {/* Layout vertical sem rotação para melhor legibilidade */}
                                 <div className="flex flex-col items-center justify-center text-center">
                                   <div className="text-[9px] font-bold text-[#004B87] leading-none mb-1">
                                     {imageAtThisPosition.ocrData.expiryDate}
                                   </div>
                                   {imageAtThisPosition.ocrData.lsCode && (
                                     <div className="text-[8px] font-semibold text-[#E32934] leading-none">
                                       {imageAtThisPosition.ocrData.lsCode}
                                     </div>
                                   )}
                                 </div>
                               </div>
                             ) : isGramagemRow ? (
                                <div className="flex items-center justify-center h-full">
                                  <Select 
                                    value={gramagemValues[`gramagem-${k}`] || ""}
                                    onValueChange={(value) => updateGramagemValue(k, value)}
                                  >
                                    <SelectTrigger className="h-8 w-full text-[9px] font-medium border-transparent hover:border-transparent focus:border-transparent transition-colors px-0 py-0 shadow-none flex items-center justify-center">
                                       <div className="transform -rotate-90 whitespace-nowrap">
                                         <SelectValue placeholder="-" className="text-[9px] font-medium" />
                                       </div>
                                     </SelectTrigger>
                                     <SelectContent className="border border-[#004B87]/30 shadow-sm min-w-[50px]">
                                       {gramagemOptions.map(option => (
                                         <SelectItem key={option} value={option} className="hover:bg-[#004B87]/10 text-[9px] font-medium px-1 py-0.5">
                                           {option}
                                         </SelectItem>
                                       ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                             ) : isHorarioAnaliseRow ? (
                                <div className="flex items-center justify-center h-full">
                                  <div className="transform -rotate-90 whitespace-nowrap">
                                    <span className="text-[#004B87] text-[9px] font-medium">
                                      {analysisTimeValues[`analysis-time-${k}`] || "-"}
                                    </span>
                                  </div>
                                </div>
                             ) : (
                               <div className="flex items-center justify-center h-full">
                                 <span className="text-slate-400 text-xs">NA</span>
                               </div>
                             )}
                           </td>
                         );
                       })}
                     </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Analysis Table - PepsiCo Branded (Lower) */}
          <div className="bg-white border-2 border-[#004B87] shadow-xl rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-[#004B87] via-[#0066B3] to-[#004B87] text-white">
                    <th className="border border-white/20 p-3 text-left font-bold w-20"></th>
                    <th className="border border-white/20 p-3 text-left font-bold w-64 uppercase tracking-wide">ANÁLISE</th>
                    {Array.from({ length: 32 }).map((_, i) => (
                      <th
                        key={i}
                        className={`border border-white/20 p-2 text-center font-bold ${
                          (i + 1) % 8 === 0 ? "border-r-2 border-r-[#E32934] bg-[#0066B3]" : "bg-[#004B87]"
                        }`}
                        style={{ 
                          width: `${columnWidth}px`, 
                          minWidth: `${columnWidth}px`, 
                          maxWidth: `${columnWidth}px`,
                          overflow: 'hidden'
                        }}
                      >
                        {(i % 8) + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      section: "Bolsas",
                      items: [
                        "Aparência da Embalagem / Selagem",
                        "Código (Leitura / Posicionamento)",
                      ],
                    },
                    {
                      section: "Caixas",
                      items: [
                        "Verificação da etiqueta na caixa",
                        "Quantidade de bolsas/Multipacks",
                      ],
                    },
                  ].map((sec, i) => (
                    sec.items.map((item, j) => (
                      <tr key={`${i}-${j}`} className="hover:bg-slate-50 transition-all duration-200 group">
                        {j === 0 && (
                          <td
                            rowSpan={sec.items.length}
                            className="border border-slate-300 p-3 font-bold bg-gradient-to-r from-slate-100 to-slate-50 text-center align-middle text-slate-700 uppercase tracking-wide"
                          >
                            {sec.section}
                          </td>
                        )}
                        <td className="border border-slate-300 p-3 text-sm font-medium text-[#004B87] group-hover:text-[#0066B3] transition-colors bg-gradient-to-r from-blue-50 to-white">{item}</td>
                        {Array.from({ length: 32 }).map((_, k) => {
                          const cellKey = `${i}-${j}-${k}`;
                          const cellValue = analysisData[cellKey];
                        
                        return (
                          <td
                            key={k}
                            className={`border border-slate-300 h-12 cursor-pointer transition-all duration-200 text-center align-middle transform hover:scale-105 hover:shadow-lg ${
                              (k + 1) % 8 === 0 ? "border-r-2 border-r-[#E32934]" : ""
                            } ${getCellColor(cellValue)} hover:z-10 relative hover:border-[#004B87]`}
                            style={{ 
                              width: `${columnWidth}px`, 
                              minWidth: `${columnWidth}px`, 
                              maxWidth: `${columnWidth}px`,
                              overflow: 'hidden'
                            }}
                            onClick={() => handleCellClick(`${i}-${j}`, k.toString())}
                          >
                            {cellValue === 'verde' && <Check className="mx-auto text-green-600 drop-shadow-sm" size={18} />}
                            {cellValue === 'amarelo' && <AlertTriangle className="mx-auto text-yellow-600 drop-shadow-sm" size={18} />}
                            {cellValue === 'vermelho' && <X className="mx-auto text-red-600 drop-shadow-sm" size={18} />}
                            {cellValue === 'na' && <span className="text-gray-500 font-bold text-sm drop-shadow-sm">NA</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>

          {/* EA Section - Mapeamento Direto */}
          <div className="bg-white border-2 border-[#004B87] shadow-xl rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#004B87]/20">
              {[...Array(4)].map((_, i) => {
                const eaKey = `EA${i + 1}`;
                const assignedMachine = eaHeaders[eaKey];
                const isActive = !!assignedMachine;
                
                return (
                  <div key={i} className={`group transition-all duration-300 ${
                    isActive 
                      ? "bg-[#E32934]/10 ring-2 ring-[#E32934] ring-inset" 
                      : "hover:bg-[#004B87]/5 bg-slate-50"
                  }`}>
                    {/* Header da EA */}
                    <div className={`border-b border-[#004B87]/20 p-4 text-center font-bold text-sm uppercase tracking-wide transition-all duration-300 ${
                      isActive 
                        ? "bg-gradient-to-r from-[#E32934] via-[#E32934] to-[#E32934] text-white" 
                        : "bg-gradient-to-r from-[#004B87] via-[#0066B3] to-[#004B87] text-white"
                    }`}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          <span>EA {i + 1}</span>
                          {isActive && (
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          )}
                        </div>
                        
                        {isActive ? (
                          <div className="space-y-1">
                            <div className="text-lg font-bold">
                              {assignedMachine}
                            </div>
                            <div className="text-xs bg-white/20 px-2 py-1 rounded-full inline-block">
                              VINCULADA
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {/* Botão Câmera */}
                              <CameraCapture 
                                 onCapture={(file) => handleImageUpload(eaKey, file)}
                                 disabled={uploadingEA === eaKey}
                                 className="text-[10px] text-white border-white/30 hover:bg-white/10 px-2 py-1"
                               />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Conteúdo da EA */}
                    <div className={`p-4 transition-all duration-300 ${
                      isActive ? "bg-[#E32934]/5" : "bg-white"
                    }`}>
                      <div className="space-y-3">
                        {/* Seção de Imagens */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold uppercase tracking-wide ${
                              isActive ? "text-[#E32934]" : "text-[#004B87]"
                            }`}>
                              Imagens ({(eaImages[eaKey] || []).length}/8)
                            </span>
                            <div className="flex flex-wrap gap-2">
                               {canUploadToEA(eaKey) ? (
                                 <div></div>
                                ) : (
                                   <div className="flex items-center gap-2">
                                     <span className={`text-xs ${
                                       isActive ? "text-[#E32934]/60" : "text-[#004B87]/60"
                                     }`}>
                                       Aguarde 1h
                                     </span>
                                     {timers[eaKey] && (
                                       <div className={`text-xs font-mono px-2 py-1 rounded ${
                                         isActive 
                                           ? "bg-[#E32934]/10 text-[#E32934] border border-[#E32934]/20" 
                                           : "bg-[#004B87]/10 text-[#004B87] border border-[#004B87]/20"
                                       }`}>
                                         ⏱️ {timers[eaKey]}
                                       </div>
                                     )}
                                   </div>
                                 )}
                                
                                
                                {/* Botão Reset - sempre visível se houver imagens */}
                                {(eaImages[eaKey] || []).length > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-orange-600 border-orange-600 hover:bg-orange-50 text-xs"
                                    onClick={() => {
                                      if (window.confirm(`Tem certeza que deseja limpar todas as ${(eaImages[eaKey] || []).length} imagens da ${eaKey}?`)) {
                                        console.log('🔄 Limpando todas as imagens da', eaKey);
                                        setEaImages(prev => {
                                          const updated = { ...prev };
                                          delete updated[eaKey];
                                          
                                          // Atualiza localStorage
                                          localStorage.setItem('ea-images', JSON.stringify(updated));
                                          console.log('✅ Imagens da', eaKey, 'removidas');
                                          
                                          return updated;
                                        });
                                        
                                        // Limpa também os horários de análise relacionados a esta EA
                                        setAnalysisTimeValues(prev => {
                                          const updated = { ...prev };
                                          // Remove horários das 8 colunas desta EA (eaIndex * 8 até eaIndex * 8 + 7)
                                          const eaIndex = parseInt(eaKey.replace('EA', '')) - 1;
                                          for (let col = eaIndex * 8; col < (eaIndex + 1) * 8; col++) {
                                            delete updated[`analysis-time-${col}`];
                                          }
                                          console.log('✅ Horários de análise da', eaKey, 'removidos');
                                          return updated;
                                        });
                                      }
                                    }}
                                  >
                                    🔄 Reset
                                  </Button>
                                )}
                             </div>
                          </div>
                          
                          {/* Grid de Thumbnails */}
                             {(eaImages[eaKey] || []).length > 0 && (
                               <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                               {(eaImages[eaKey] || []).map((image) => (
                                 <div key={image.id} className="relative group">
                                   <img
                                      src={image.thumbnail}
                                      alt={image.filename}
                                      className={`w-full h-16 object-cover rounded border transition-colors ${
                                        isActive 
                                          ? "border-[#E32934]/30 hover:border-[#E32934]" 
                                          : "border-[#004B87]/30 hover:border-[#004B87]"
                                      }`}
                                    />
                                   
                                   {/* Indicador de validação automática */}
                                   <div className={`absolute top-1 left-1 w-3 h-3 rounded-full ${
                                     image.ocrData?.validationStatus === 'valid'
                                       ? "bg-green-500" 
                                       : image.ocrData?.validationStatus === 'divergent'
                                         ? "bg-orange-500"
                                         : image.ocrData?.validationStatus === 'expired'
                                           ? "bg-red-500"
                                           : "bg-yellow-500"
                                   }`} title={
                                     image.ocrData?.validationMessage || "Processando..."
                                   }></div>
                                   
                                   {/* Botão remover melhorado */}
                                    <button
                                      onClick={() => removeImage(eaKey, image.id)}
                                      className={`absolute -top-2 -right-2 w-6 h-6 text-white rounded-full text-sm font-bold shadow-lg border-2 border-white opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center hover:scale-110 ${
                                        isActive ? "bg-[#E32934] hover:bg-red-600" : "bg-[#004B87] hover:bg-blue-600"
                                      }`}
                                      title="Remover imagem"
                                    >
                                      ×
                                    </button>
                                   
                                   {/* Informações OCR no hover com validação automática */}


                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          

          {/* Footer - Compacto */}
          <div className="bg-gradient-to-r from-[#004B87]/5 via-white to-[#0066B3]/5 border-2 border-[#004B87] shadow-lg rounded-lg p-4 text-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-[#004B87] rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <strong className="text-[#004B87] text-sm">Frequência:</strong> 
                  <span className="text-[#0066B3] text-sm">1h após arranque (tolerância 5min)</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-[#E32934] rounded-full mt-2 flex-shrink-0"></div>
                <div>
                  <strong className="text-[#004B87] text-sm">Amostragem:</strong> 
                  <span className="text-[#0066B3] text-sm">2 embalagens por EA</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="font-bold text-[#004B87] text-sm">Status:</div>
              <div className="grid grid-cols-2 sm:flex gap-2 text-xs">
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <Check className="text-green-600" size={14}/>
                  <span className="font-semibold text-green-800">Conforme</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 rounded-lg border border-yellow-200">
                  <AlertTriangle className="text-yellow-600" size={14}/>
                  <span className="font-semibold text-yellow-800">Atenção</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                  <X className="text-red-600" size={14}/>
                  <span className="font-semibold text-red-800">Não Conforme</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="w-4 h-4 bg-gray-500 text-white text-xs font-bold rounded flex items-center justify-center">NA</div>
                  <span className="font-semibold text-gray-800">N/A</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Modal de Processamento */}
        <Dialog open={showProcessingModal} onOpenChange={setShowProcessingModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#004B87] rounded-lg flex items-center justify-center">
                  <Camera className="text-white" size={16} />
                </div>
                Processando Imagem - {processingEA}
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-4 py-4">
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#004B87]">{processingStep}</span>
                    <span className="text-slate-600">{processingProgress}%</span>
                  </div>
                  <Progress value={processingProgress} className="h-2" />
                </div>
                
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      processingProgress >= 25 ? 'bg-green-500' : 'bg-slate-300'
                    }`}></div>
                    <span className={processingProgress >= 25 ? 'text-green-700' : 'text-slate-500'}>
                      Otimizando imagem
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      processingProgress >= 50 ? 'bg-green-500' : 'bg-slate-300'
                    }`}></div>
                    <span className={processingProgress >= 50 ? 'text-green-700' : 'text-slate-500'}>
                      Executando OCR
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      processingProgress >= 75 ? 'bg-green-500' : 'bg-slate-300'
                    }`}></div>
                    <span className={processingProgress >= 75 ? 'text-green-700' : 'text-slate-500'}>
                      Validando data de validade
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      processingProgress >= 100 ? 'bg-green-500' : 'bg-slate-300'
                    }`}></div>
                    <span className={processingProgress >= 100 ? 'text-green-700' : 'text-slate-500'}>
                      Finalizando processamento
                    </span>
                  </div>
                </div>
                
                {processingProgress < 100 && (
                  <div className="text-center text-sm text-slate-600">
                    Por favor, aguarde enquanto processamos sua imagem...
                  </div>
                )}
              </div>
              
              {/* Área da imagem do personagem */}
               <div className="flex-shrink-0 w-32 h-40 bg-transparent rounded-lg flex items-center justify-center">
                 <img 
                   src="/lovable-uploads/imagem.png" 
                   alt="Personagem mascote" 
                   className="w-full h-full object-contain rounded-lg"
                 />
               </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default ControleQualidade;
