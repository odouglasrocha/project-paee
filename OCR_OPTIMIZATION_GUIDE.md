# Guia de Otimizações OCR - ShelfWise Scan

## Resumo das Melhorias Implementadas

Este documento descreve as otimizações implementadas para melhorar a precisão do OCR na leitura de datas de validade, códigos de lote e horários em imagens capturadas por celular.

### Objetivo
- **Meta**: Aumentar a precisão de 30% (3 em 10) para **80%** em fotos de celular
- **Formato esperado**: `DD/MM/AAAA LS000 00:00`
- **Foco**: Baixa luminosidade e modo macro

## 1. Pré-processamento de Imagem Otimizado

### Pipeline Implementado (arquivo: `src/lib/ocr.ts`)

#### Etapa 1: Correção de Inclinação (Deskew)
- **Função**: `detectSkewAngle()` e `applyDeskew()`
- **Benefício**: Corrige imagens inclinadas comuns em fotos de celular
- **Ângulos testados**: -15° a +15°
- **Algoritmo**: Detecção de bordas horizontais para determinar inclinação

#### Etapa 2: Redução de Ruído para Macro
- **Função**: `reduceMacroNoise()`
- **Técnica**: Filtro bilateral
- **Benefício**: Remove ruído preservando bordas importantes
- **Parâmetros**: σ_color=50, σ_space=50, kernel=5x5

#### Etapa 3: Equalização de Histograma Adaptativa (CLAHE)
- **Função**: `applyCLAHE()`
- **Benefício**: Melhora contraste em áreas escuras (baixa luminosidade)
- **Parâmetros**: clipLimit=3.0, tileSize=8x8
- **Resultado**: Destaca texto em condições de pouca luz

#### Etapa 4: Filtro de Nitidez
- **Função**: `applySharpen()`
- **Benefício**: Destaca contornos finos do texto
- **Força**: 0.4 (balanceada para não criar artefatos)

#### Etapa 5: Binarização Adaptativa
- **Técnica**: Threshold adaptativo por tiles (16x16)
- **Benefício**: Adapta-se a variações de iluminação na imagem
- **Suavização**: Zona de transição para evitar bordas abruptas

#### Etapa 6: Limpeza Morfológica
- **Técnica**: Remoção de artefatos isolados
- **Critério**: Análise de vizinhança 3x3
- **Resultado**: Imagem final limpa para OCR

## 2. Extração de Dados Otimizada

### Correção de Caracteres OCR (arquivo: `src/pages/ControleQualidade.tsx`)

#### Função: `correctOCRErrors()`
Correções automáticas de caracteres comumente confundidos:

| Caractere OCR | Correção | Contexto |
|---------------|----------|----------|
| O, o, Q | 0 | Números |
| I, l, \|, 1 | 1 | Números |
| S, $, 5 | 5 | Números (preserva LS) |
| Z | 2 | Números |
| B | 8 | Números |
| G | 6 | Números |
| T | 7 | Números |
| A | 4 | Números |
| E | 3 | Números |
| g | 9 | Números |

**Correções específicas para LS**:
- `L5` → `LS`
- `1S` → `LS`
- `IS` → `LS`

### Reconhecimento Direcionado

#### 1. Extração de Data (DD/MM/AAAA)
**Função**: `parseExpiryData()` - seção de datas

**Padrões robustos**:
```regex
/\b([0-3]?[0-9])[\/.\-]([0-1]?[0-9])[\/.\-]([2][0-9]{3})\b/g  // dd/mm/yyyy
/\b([0-3]?[0-9])[\/.\-]([0-1]?[0-9])[\/.\-]([2-9][0-9])\b/g     // dd/mm/yy
```

**Validações**:
- Dia: 1-31
- Mês: 1-12
- Ano: 2020-2030
- Validação de dias por mês (incluindo anos bissextos)

#### 2. Extração de Código de Lote (LS000)
**Função**: `parseExpiryData()` - seção de lote

**Padrões robustos**:
```regex
/\bLS\s*([0-9]{3,6})\b/gi                    // LS123
/\bL5\s*([0-9]{3,6})\b/gi                    // L5123 (confundido)
/\bL[S5]\s*[\-_\s]*([0-9]{3,6})\b/gi        // LS-123, LS_123
/\b[L1I][S5]\s*([0-9]{3,6})\b/gi            // 1S123, IS123
```

**Normalização**:
- Extrai apenas números
- Formata como `LS` + números
- Suporte para 3-6 dígitos

#### 3. Extração de Horário (HH:MM)
**Função**: `extractTime()`

**Padrões robustos**:
```regex
/\b([0-2]?[0-9]):([0-5][0-9])\b/g           // 14:30
/\b([0-2]?[0-9])\s+([0-5][0-9])\b/g         // 14 30
/\b([0-2][0-9])([0-5][0-9])\b/g             // 1430
```

**Validações**:
- Hora: 00-23
- Minuto: 00-59
- Formatação: sempre HH:MM com zero à esquerda

## 3. Formato de Saída Padronizado

### Função: `formatExtractedData()`
**Formato**: `DD/MM/AAAA LS000 00:00`

**Exemplo de saída**:
```
26/01/2026 LS223 14:30
```

### Função: `extractCompleteData()`
Extrai todos os dados em uma única chamada, retornando o formato padronizado.

## 4. Melhorias de Performance

### Configurações Tesseract Otimizadas
- **Idioma**: `por` (português)
- **Qualidade de imagem**: 95% JPEG
- **Redimensionamento**: Máximo 1200px (mantendo qualidade)
- **Suavização**: Alta qualidade (`imageSmoothingQuality: 'high'`)

### Pipeline de Processamento
1. **Pré-processamento**: ~200ms
2. **OCR**: ~1-3s (dependendo da imagem)
3. **Extração e validação**: ~50ms
4. **Total**: ~1.5-3.5s por imagem

## 5. Validação e Qualidade

### Critérios de Validação
- **Data**: Deve estar no formato correto e ser válida
- **Lote**: Deve seguir padrão LS + números
- **Horário**: Deve ser válido (00:00-23:59)
- **Completude**: Todos os três componentes devem estar presentes

### Logs de Depuração
Todos os passos são logados para facilitar depuração:
```javascript
console.log('🔧 Corrigindo inclinação: ${skewAngle}°');
console.log('🔧 Aplicando CLAHE para melhorar contraste...');
console.log('📋 Dados formatados (DD/MM/AAAA LS000 00:00):', formattedData);
```

## 6. Resultados Esperados

### Antes das Otimizações
- **Precisão em computador**: 90%
- **Precisão em celular**: 30% (3 em 10)
- **Problemas**: Baixa luminosidade, macro, inclinação

### Após as Otimizações
- **Meta de precisão**: 80%+ em fotos de celular
- **Melhorias específicas**:
  - ✅ Correção automática de inclinação
  - ✅ Melhoria em baixa luminosidade (CLAHE)
  - ✅ Redução de ruído em modo macro
  - ✅ Correção de caracteres confundidos
  - ✅ Reconhecimento direcionado por blocos
  - ✅ Formato de saída padronizado

## 7. Uso das Funções

### Para extrair dados completos:
```javascript
const completeData = extractCompleteData(ocrText);
// Retorna: "26/01/2026 LS223 14:30"
```

### Para extrair componentes individuais:
```javascript
const expiryData = parseExpiryData(ocrText);
// Retorna: { fullDate: "26/01/2026", loteCode: "LS223", timeCode: "14:30", ... }
```

### Para pré-processar imagem:
```javascript
const processedBlob = await preprocessImageFromUrl(imageUrl);
// Retorna imagem otimizada para OCR
```

---

**Nota**: Todas as otimizações foram implementadas mantendo compatibilidade com o código existente e sem comprometer os parâmetros já configurados no sistema.