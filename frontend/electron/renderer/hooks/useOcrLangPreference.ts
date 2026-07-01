import { useCallback, useState } from "react";

import {
  normalizeOcrLang,
  readStoredOcrLang,
  writeStoredOcrLang,
  type OcrLang,
} from "@shared/ocrLang.js";

export function useOcrLangPreference(): {
  ocrLang: OcrLang;
  setOcrLang: (lang: OcrLang) => void;
} {
  const [ocrLang, setOcrLangState] = useState<OcrLang>(() => readStoredOcrLang());

  const setOcrLang = useCallback((lang: OcrLang) => {
    const normalized = normalizeOcrLang(lang);
    writeStoredOcrLang(normalized);
    setOcrLangState(normalized);
  }, []);

  return { ocrLang, setOcrLang };
}
