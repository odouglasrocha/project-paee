import React, { useEffect, useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import { preprocessImageFromUrl } from "@/lib/ocr";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { startOfWeek, addWeeks, getDay, differenceInCalendarWeeks, format } from "date-fns";
import { Trash2 } from "lucide-react";

type Item = {
  url: string;
  refText: string;
  code: string;
  expiryISO: string;
  expiryRaw: string;
  status: 'pending' | 'processing' | 'ok' | 'mismatch' | 'error';
};

function formatISOToBR(iso: string, shortYear = false): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return shortYear ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}/${y}`;
}

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

function parseISODateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function extractLSCode(text: string) {
  const upper = (text || "").toUpperCase().replace(/\s+/g, "");
  const m = upper.match(/LS\d{3}/);
  return m ? m[0] : "";
}

function extractExpiryDate(text: string): { raw: string; iso: string } | null {
  const t = (text || "").replace(/\s+/g, " ").trim();
  // 1) Datas com separador (dd/mm/aaaa, dd-mm-aa, etc.) com palavras-chave
  const re = /(?:VAL|VALIDADE|VENC|VENCE|VENCT|EXP|DATA)?[^\d]{0,6}(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})|((?:\d{1,2})[\/.\-](?:\d{1,2})[\/.\-](?:\d{2,4}))/i;
  const m = re.exec(t);
  let day: number, month: number, yearNum: number;
  if (m) {
    if (m[1] && m[2] && m[3]) {
      day = Number(m[1]);
      month = Number(m[2]);
      const y = m[3];
      yearNum = y.length === 2 ? 2000 + Number(y) : Number(y);
    } else if (m[4]) {
      const parts = m[4].split(/[\/.\-]/);
      day = Number(parts[0]);
      month = Number(parts[1]);
      const y = parts[2];
      yearNum = y.length === 2 ? 2000 + Number(y) : Number(y);
    } else {
      return null;
    }
  } else {
    // 2) Fallback: datas compactas sem separador perto de palavras-chave (ddmmyy ou ddmmyyyy)
    const upperNoSpace = (text || "").toUpperCase().replace(/\s+/g, "");
    const m2 = upperNoSpace.match(/(?:VAL|VALIDADE|VENC|VENCE|VENCT|EXP|DATA)[^0-9]{0,6}(\d{2})(\d{2})(\d{2,4})/);
    if (m2) {
      day = Number(m2[1]);
      month = Number(m2[2]);
      const y = m2[3];
      yearNum = y.length === 2 ? 2000 + Number(y) : Number(y);
    } else {
      // 3) Último recurso: qualquer sequência ddmmyy(yy) isolada
      const m3 = upperNoSpace.match(/\b(\d{2})(\d{2})(\d{2,4})\b/);
      if (!m3) return null;
      day = Number(m3[1]);
      month = Number(m3[2]);
      const y = m3[3];
      yearNum = y.length === 2 ? 2000 + Number(y) : Number(y);
    }
  }
  if (!(day >= 1 && day <= 31 && month >= 1 && month <= 12 && yearNum >= 2000 && yearNum <= 2099)) return null;
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const iso = `${yearNum}-${mm}-${dd}`;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return { raw: `${dd}/${mm}/${yearNum}`, iso };
}

function buildReference(iso: string, code: string): string {
  const datePart = iso ? formatISOToBR(iso, true) : "";
  const codePart = (code || "").toUpperCase();
  return [datePart, codePart].filter(Boolean).join(" ");
}

function weeklyBaseExpiryISO(selectedDateISO: string): string {
  const date = parseISODateLocal(selectedDateISO);
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
}

export default function MachinePhotosOcr({ machine, photos, selectedDateISO, onRemovePhoto }: { machine: string; photos: string[]; selectedDateISO?: string; onRemovePhoto?: (photoUrl: string) => void; }) {
  const effectiveDateISO = useMemo(() => selectedDateISO || getBrazilTodayISO(), [selectedDateISO]);
  const [items, setItems] = useState<Item[]>([]);
  const [targetISO, setTargetISO] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const iso = weeklyBaseExpiryISO(effectiveDateISO);
    if (mounted) setTargetISO(iso);
    return () => { mounted = false; };
  }, [effectiveDateISO]);

  // Sync items with photos list
  useEffect(() => {
    setItems((prev) => {
      const map = new Map(prev.map((p) => [p.url, p]));
      const next: Item[] = photos.map((u) => map.get(u) || ({ url: u, refText: "", code: "", expiryISO: "", expiryRaw: "", status: 'pending' }));
      return next;
    });
  }, [photos]);

  // Process pending in parallel
  useEffect(() => {
    if (!targetISO) return;
    const pending = items.map((it, idx) => ({ it, idx })).filter(({ it }) => it.status === 'pending');
    if (pending.length === 0) return;

    // mark processing
    setItems((prev) => prev.map((it) => (it.status === 'pending' ? { ...it, status: 'processing' } : it)));

    Promise.all(pending.map(async ({ it, idx }) => {
      try {
        let fullText = "";
        let code = "";
        let exp: { raw: string; iso: string } | null = null;

        // Estratégia multi-tentativa para maior robustez
        const attempts = [
          // Tentativa 1: Imagem pré-processada com PSM 8 (linha única)
          {
            input: async () => await preprocessImageFromUrl(it.url),
            options: {
              logger: (m: any) => console.log(m),
              tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
              psm: 8,

              preserve_interword_spaces: 1,
            }
          },
          // Tentativa 2: Imagem pré-processada com PSM 6 (bloco uniforme)
          {
            input: async () => await preprocessImageFromUrl(it.url),
            options: {
              logger: (m: any) => console.log(m),
              tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
              psm: 6,

            }
          },
          // Tentativa 3: Imagem original com PSM 11 (texto esparso)
          {
            input: async () => it.url,
            options: {
              logger: (m: any) => console.log(m),
              tessedit_char_whitelist: "0123456789./- ",
              psm: 11,

            }
          },
          // Tentativa 4: Imagem original com PSM 13 (linha única, sem segmentação)
          {
            input: async () => it.url,
            options: {
              logger: (m: any) => console.log(m),
              tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./- ",
              psm: 13,

            }
          }
        ];

        // Executa tentativas até encontrar código E data ou esgotar opções
        for (const attempt of attempts) {
          if (code && exp) break; // Já encontrou tudo

          try {
            const input = await attempt.input();
            const { data } = await Tesseract.recognize(input, "por+eng", attempt.options as any);
            const text = data.text || "";
            
            if (text.length > fullText.length) fullText = text;
            if (!code) code = extractLSCode(text);
            if (!exp) exp = extractExpiryDate(text);
            
            // Se encontrou código E data nesta tentativa, para aqui
            if (code && exp) break;
          } catch (attemptError) {
            console.warn('OCR attempt failed:', attemptError);
            continue;
          }
        }

        const newISO = exp?.iso ?? "";
        const newRaw = exp?.raw ?? "";
        const ref = buildReference(newISO, code);
        const match = Boolean(targetISO && newISO && newISO === targetISO);
        setItems((prev) => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], code, expiryISO: newISO, expiryRaw: newRaw, refText: ref, status: match ? 'ok' : 'mismatch' };
          return copy;
        });
      } catch (e) {
        console.error(e);
        setItems((prev) => {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], status: 'error' };
          return copy;
        });
      }
    })).catch(() => {});
  }, [items, targetISO]);

  const anyMismatch = items.some((i) => i.status === 'mismatch');
  const allOk = items.length > 0 && items.every((i) => i.status === 'ok');

  return (
    <div className="space-y-2">
      {targetISO && (
        <p className="text-xs text-muted-foreground">Data selecionada: <strong>{formatISOToBR(targetISO)}</strong></p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((img) => (
          <div key={img.url} className="border rounded-md p-3 relative">
            <AspectRatio ratio={4/3}>
              <img
                src={img.url}
                alt={`Foto ${machine} - ${img.refText || 'sem referência'}`}
                className="w-full h-full object-contain rounded bg-muted"
                loading="lazy"
              />
            </AspectRatio>
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-muted-foreground break-words whitespace-normal">{img.refText || 'Ref. não lida'}</p>
              <div className="flex items-center justify-between">
                <p className={`text-xs ${img.status === 'ok' ? 'text-green-600' : img.status === 'mismatch' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {img.status === 'ok'
                    ? `OK${img.expiryISO ? ` (${formatISOToBR(img.expiryISO)})` : ''}`
                    : img.status === 'mismatch'
                    ? `Divergente${img.expiryISO ? ` (${formatISOToBR(img.expiryISO)})` : ''}`
                    : img.status === 'processing'
                    ? 'Lendo...'
                    : img.status === 'error'
                    ? 'Erro'
                    : ''}
                </p>
                {img.status === 'mismatch' && onRemovePhoto && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onRemovePhoto(img.url)}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {anyMismatch && targetISO && (
        <div className="text-xs text-red-600">
          Atenção! Uma ou mais imagens não correspondem à data selecionada ({formatISOToBR(targetISO)}).{' '}
          Datas lidas: {Array.from(new Set(items.map((i) => i.expiryISO).filter(Boolean))).map((d) => formatISOToBR(d as string)).join(', ') || '—'}.
        </div>
      )}
      {allOk && targetISO && (
        <div className="text-xs text-green-600">Todas as imagens correspondem à data selecionada ({formatISOToBR(targetISO)}).</div>
      )}
    </div>
  );
}
