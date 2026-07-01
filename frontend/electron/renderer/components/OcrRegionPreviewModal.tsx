import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clampOcrContentRegion,
  DEFAULT_OCR_CONTENT_REGION,
  type OcrContentRegion,
} from "@shared/ocrContentRegion.js";

import "./OcrRegionPreviewModal.css";

export interface OcrRegionPreviewModalProps {
  open: boolean;
  fileName: string;
  imageSrc: string;
  region: OcrContentRegion;
  onRegionChange: (region: OcrContentRegion) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

type DragHandle = "top" | "bottom" | null;

export function OcrRegionPreviewModal({
  open,
  fileName,
  imageSrc,
  region,
  onRegionChange,
  onConfirm,
  onCancel,
}: OcrRegionPreviewModalProps) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<DragHandle>(null);

  const updateFromClientY = useCallback(
    (clientY: number, handle: DragHandle) => {
      const frame = frameRef.current;
      if (!frame || !handle) {
        return;
      }
      const rect = frame.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const ratio = (clientY - rect.top) / rect.height;
      const next =
        handle === "top"
          ? clampOcrContentRegion({ ...region, contentTop: ratio })
          : clampOcrContentRegion({ ...region, contentBottom: ratio });
      onRegionChange(next);
    },
    [onRegionChange, region],
  );

  useEffect(() => {
    if (!dragging) {
      return;
    }

    function onMove(event: PointerEvent) {
      updateFromClientY(event.clientY, dragging);
    }

    function onUp() {
      setDragging(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, updateFromClientY]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  const topPct = `${(region.contentTop * 100).toFixed(1)}%`;
  const bottomPct = `${(region.contentBottom * 100).toFixed(1)}%`;

  return (
    <div className="ocr-region-overlay" role="presentation" onClick={onCancel}>
      <div
        className="ocr-region-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-region-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ocr-region-header">
          <h2 id="ocr-region-title">{t("ocrRegion.title")}</h2>
          <p className="ocr-region-subtitle">{fileName}</p>
          <p className="ocr-region-hint">{t("ocrRegion.hint")}</p>
        </header>

        <div className="ocr-region-frame" ref={frameRef}>
          <img className="ocr-region-image" src={imageSrc} alt={fileName} draggable={false} />
          <div className="ocr-region-shade ocr-region-shade-top" style={{ height: topPct }} />
          <div
            className="ocr-region-shade ocr-region-shade-bottom"
            style={{ top: bottomPct, bottom: 0 }}
          />
          <div className="ocr-region-band" style={{ top: topPct, height: `calc(${bottomPct} - ${topPct})` }} />
          <button
            type="button"
            className="ocr-region-handle ocr-region-handle-top"
            style={{ top: topPct }}
            aria-label={t("ocrRegion.topHandle")}
            onPointerDown={(event) => {
              event.preventDefault();
              setDragging("top");
            }}
          />
          <button
            type="button"
            className="ocr-region-handle ocr-region-handle-bottom"
            style={{ top: bottomPct }}
            aria-label={t("ocrRegion.bottomHandle")}
            onPointerDown={(event) => {
              event.preventDefault();
              setDragging("bottom");
            }}
          />
        </div>

        <div className="ocr-region-metrics">
          <span>{t("ocrRegion.top", { value: topPct })}</span>
          <span>{t("ocrRegion.bottom", { value: bottomPct })}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => onRegionChange(DEFAULT_OCR_CONTENT_REGION)}
          >
            {t("ocrRegion.reset")}
          </button>
        </div>

        <footer className="ocr-region-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {t("ocrRegion.cancel")}
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            {t("ocrRegion.confirm")}
          </button>
        </footer>
      </div>
    </div>
  );
}
