import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ManagedServiceState,
  OcrLang,
  OcrProcessResult,
  OcrProxyHealth,
  OcrTaskSummary,
  ServiceKind,
  TaskEventEnvelope,
} from "@shared/types.js";
import { OCR_LANGS, defaultOcrDpiForLang, defaultOcrModeForLang } from "@shared/ocrLang.js";
import {
  DEFAULT_OCR_CONTENT_REGION,
  normalizeOcrContentRegion,
  type OcrContentRegion,
} from "@shared/ocrContentRegion.js";

import "./App.css";
import { OcrRegionPreviewModal } from "./components/OcrRegionPreviewModal";
import { SUPPORTED_LANGUAGES, type AppLanguage } from "./i18n";
import { useElectronAPI } from "./hooks/useElectronAPI";
import { useOcrLangPreference } from "./hooks/useOcrLangPreference";

const MAX_TASK_EVENTS = 200;
const SERVICE_POLL_MS = 3000;

function statusClass(status: ManagedServiceState["status"]): string {
  return `status-badge status-${status}`;
}

function serviceLabel(kind: ServiceKind, t: (key: string) => string): string {
  return kind === "java-backend" ? t("services.java") : t("services.ocr");
}

export default function App() {
  const { t, i18n } = useTranslation();
  const api = useElectronAPI();
  const { ocrLang, setOcrLang } = useOcrLangPreference();
  const [services, setServices] = useState<ManagedServiceState[]>([]);
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [taskEvents, setTaskEvents] = useState<TaskEventEnvelope[]>([]);
  const [busyKind, setBusyKind] = useState<ServiceKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrProcessResult | null>(null);
  const [taskHistory, setTaskHistory] = useState<OcrTaskSummary[]>([]);
  const [taskHistoryBusy, setTaskHistoryBusy] = useState(false);
  const [regionPreviewOpen, setRegionPreviewOpen] = useState(false);
  const [pendingPdfPath, setPendingPdfPath] = useState<string | null>(null);
  const [pendingPdfFileName, setPendingPdfFileName] = useState("");
  const [previewImageSrc, setPreviewImageSrc] = useState("");
  const [contentRegion, setContentRegion] = useState<OcrContentRegion>(
    DEFAULT_OCR_CONTENT_REGION,
  );

  const javaService = useMemo(
    () => services.find((service) => service.kind === "java-backend"),
    [services],
  );
  const ocrProxy = javaService?.ocrProxy ?? null;

  const refresh = useCallback(async () => {
    if (!api) {
      return;
    }

    const [states, url] = await Promise.all([
      api.getServiceStates(),
      api.getBackendBaseUrl(),
    ]);
    setServices(states);
    setBackendUrl(url);
  }, [api]);

  const refreshTaskHistory = useCallback(async () => {
    if (!api?.listOcrTasks) {
      return;
    }

    setTaskHistoryBusy(true);
    try {
      const tasks = await api.listOcrTasks();
      setTaskHistory(tasks);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setTaskHistoryBusy(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) {
      return;
    }

    void refresh();
    void refreshTaskHistory();
    const timer = window.setInterval(() => {
      void refresh();
    }, SERVICE_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [api, refresh, refreshTaskHistory]);

  useEffect(() => {
    if (!api) {
      return;
    }

    return api.onTaskEvent((envelope) => {
      setTaskEvents((current) => [envelope, ...current].slice(0, MAX_TASK_EVENTS));
    });
  }, [api]);

  const currentLanguage = useMemo(
    () => (i18n.language as AppLanguage) ?? "zh-CN",
    [i18n.language],
  );

  async function handleRestart(kind: ServiceKind) {
    if (!api) {
      return;
    }

    setBusyKind(kind);
    setActionError(null);
    try {
      await api.restartService(kind);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKind(null);
    }
  }

  async function handleOpenLogs() {
    if (!api) {
      return;
    }

    setActionError(null);
    try {
      await api.openLogsDir();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDemoTasks() {
    if (!api) {
      return;
    }

    setActionError(null);
    try {
      await api.emitDemoTaskEvents();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleRefreshOcrProxy() {
    if (!api?.refreshOcrProxyHealth) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setOcrBusy(true);
    setActionError(null);
    try {
      await api.refreshOcrProxyHealth();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleOcrTest() {
    if (!api?.pickAndProcessOcr) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setOcrBusy(true);
    setActionError(null);
    setOcrResult(null);
    try {
      const result = await api.pickAndProcessOcr({ lang: ocrLang });
      if (result.cancelled) {
        return;
      }
      setOcrResult(result);
      if (!result.ok && result.error) {
        setActionError(result.error);
      }
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleOcrBatch() {
    if (!api?.pickAndRunOcrBatch) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setOcrBusy(true);
    setActionError(null);
    try {
      await api.pickAndRunOcrBatch({ lang: ocrLang });
      await refresh();
      await refreshTaskHistory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleResumeTask(batchId: string) {
    if (!api?.resumeOcrTask) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setOcrBusy(true);
    setActionError(null);
    try {
      await api.resumeOcrTask(batchId);
      await refreshTaskHistory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleOpenTaskExport(batchId: string) {
    if (!api?.openTaskExport) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setActionError(null);
    try {
      await api.openTaskExport(batchId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleOpenExportsDir() {
    if (!api?.openExportsDir) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setActionError(null);
    try {
      await api.openExportsDir();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function formatTaskPhase(phase: OcrTaskSummary["phase"]): string {
    return t(`taskHistory.phase.${phase}`);
  }

  function formatResumeAction(task: OcrTaskSummary): string | null {
    if (task.hasExportFile) {
      return t("taskHistory.actions.openExport");
    }
    if (task.resumeKind === "export") {
      return t("taskHistory.actions.resumeExport");
    }
    if (task.resumeKind === "continue") {
      return t("taskHistory.actions.resumeContinue");
    }
    if (task.resumeKind === "rerun") {
      return t("taskHistory.actions.rerun");
    }
    return null;
  }

  async function handlePdfPipeline() {
    if (!api?.pickPdfForPipeline || !api.fetchPdfPagePreview || !api.runPdfPipeline) {
      setActionError(t("error.stalePreload"));
      return;
    }

    setActionError(null);
    try {
      const picked = await api.pickPdfForPipeline();
      if (!picked) {
        return;
      }

      setOcrBusy(true);
      const preview = await api.fetchPdfPagePreview(picked.pdfPath, {
        pageIndex: 1,
        dpi: defaultOcrDpiForLang(ocrLang),
      });
      setPendingPdfPath(picked.pdfPath);
      setPendingPdfFileName(picked.fileName);
      setPreviewImageSrc(`data:image/png;base64,${preview.imageBase64}`);
      setContentRegion(
        normalizeOcrContentRegion({
          contentTop: preview.contentTop,
          contentBottom: preview.contentBottom,
        }),
      );
      setRegionPreviewOpen(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
    }
  }

  function handleCancelRegionPreview() {
    setRegionPreviewOpen(false);
    setPendingPdfPath(null);
    setPreviewImageSrc("");
  }

  async function handleConfirmRegionPreview() {
    if (!api?.runPdfPipeline || !pendingPdfPath) {
      return;
    }

    setRegionPreviewOpen(false);
    setOcrBusy(true);
    setActionError(null);
    try {
      await api.runPdfPipeline(pendingPdfPath, {
        lang: ocrLang,
        contentTop: contentRegion.contentTop,
        contentBottom: contentRegion.contentBottom,
      });
      await refresh();
      await refreshTaskHistory();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setOcrBusy(false);
      setPendingPdfPath(null);
      setPreviewImageSrc("");
    }
  }

  function ocrLangLabel(lang: OcrLang): string {
    if (lang === "ch+en") {
      return t("ocr.lang.chEn");
    }
    return t(`ocr.lang.${lang}`);
  }

  function formatOcrProxy(proxy: OcrProxyHealth | null): string {
    if (!proxy) {
      return t("ocr.proxy.unknown");
    }
    const parts: string[] = [proxy.status];
    if (proxy.engine) {
      parts.push(proxy.engine);
    }
    if (proxy.modelsLoaded !== undefined) {
      parts.push(proxy.modelsLoaded ? "models" : "no-models");
    }
    return parts.join(" · ");
  }

  if (!api) {
    return <div className="banner-error">{t("error.noElectron")}</div>;
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{t("app.title")}</h1>
          <p>{t("app.subtitle")}</p>
        </div>
        <label>
          {t("language.label")}{" "}
          <select
            value={currentLanguage}
            onChange={(event) => {
              void i18n.changeLanguage(event.target.value);
            }}
          >
            {SUPPORTED_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </header>

      {actionError ? <div className="banner-error">{actionError}</div> : null}

      <section className="panel">
        <h2>{t("backend.url")}</h2>
        <div className="backend-url">{backendUrl ?? t("backend.none")}</div>
      </section>

      <section className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{t("services.title")}</h2>
          <button type="button" onClick={() => void refresh()}>
            {t("actions.refresh")}
          </button>
          <button type="button" onClick={() => void handleOpenLogs()}>
            {t("actions.openLogs")}
          </button>
          <button type="button" onClick={() => void handleDemoTasks()}>
            {t("actions.demoTasks")}
          </button>
        </div>

        <div className="services">
          {services.map((service) => (
            <article key={service.kind} className="service-card">
              <header>
                <strong>{serviceLabel(service.kind, t)}</strong>
                <span className={statusClass(service.status)}>{service.status}</span>
              </header>
              <div className="meta">
                <div>
                  {t("services.port")}: {service.port ?? "—"}
                </div>
                <div>
                  {t("services.pid")}: {service.pid ?? "—"}
                </div>
              </div>
              {service.lastError ? (
                <div className="error-text">
                  {t("services.error")}: {service.lastError}
                </div>
              ) : null}
              <div className="toolbar" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  disabled={busyKind === service.kind}
                  onClick={() => void handleRestart(service.kind)}
                >
                  {t("actions.restart")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{t("ocr.title")}</h2>
          <button type="button" disabled={ocrBusy} onClick={() => void handleRefreshOcrProxy()}>
            {t("ocr.actions.refreshProxy")}
          </button>
          <button
            type="button"
            disabled={ocrBusy || javaService?.status !== "healthy"}
            onClick={() => void handleOcrTest()}
          >
            {t("ocr.actions.pickImage")}
          </button>
          <button
            type="button"
            disabled={ocrBusy || javaService?.status !== "healthy"}
            onClick={() => void handleOcrBatch()}
          >
            {t("ocr.actions.pickBatch")}
          </button>
          <button
            type="button"
            disabled={ocrBusy || javaService?.status !== "healthy"}
            onClick={() => void handlePdfPipeline()}
          >
            {t("ocr.actions.pickPdfPipeline")}
          </button>
        </div>
        <div className="ocr-lang-row">
          <span className="ocr-lang-label">{t("ocr.lang.label")}</span>
          <div className="ocr-lang-toggle" role="group" aria-label={t("ocr.lang.label")}>
            {OCR_LANGS.map((lang) => (
              <button
                key={lang}
                type="button"
                className={ocrLang === lang ? "is-active" : undefined}
                disabled={ocrBusy}
                onClick={() => setOcrLang(lang)}
              >
                {ocrLangLabel(lang)}
              </button>
            ))}
          </div>
          <span className="ocr-lang-hint">
            {ocrLang === "en"
              ? t("ocr.lang.enDefaults", {
                  mode: defaultOcrModeForLang("en"),
                  dpi: defaultOcrDpiForLang("en"),
                })
              : t("ocr.lang.chDefaults", {
                  mode: defaultOcrModeForLang(ocrLang),
                  dpi: defaultOcrDpiForLang(ocrLang),
                })}
          </span>
        </div>
        <div className="meta">
          <div>
            {t("ocr.proxy.label")}: {formatOcrProxy(ocrProxy)}
          </div>
          {ocrProxy?.message ? <div className="error-text">{ocrProxy.message}</div> : null}
        </div>
        {ocrResult ? (
          <div className="ocr-result">
            <div>
              HTTP {ocrResult.httpStatus} · {ocrResult.ok ? t("ocr.result.ok") : t("ocr.result.failed")}
            </div>
            {ocrResult.parsed?.text ? (
              <pre className="ocr-text">{ocrResult.parsed.text}</pre>
            ) : (
              <pre className="ocr-text">{ocrResult.body.slice(0, 800)}</pre>
            )}
          </div>
        ) : (
          <div className="empty">{t("ocr.result.empty")}</div>
        )}
      </section>

      <section className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>{t("taskHistory.title")}</h2>
          <button type="button" disabled={taskHistoryBusy} onClick={() => void refreshTaskHistory()}>
            {t("actions.refresh")}
          </button>
          <button type="button" onClick={() => void handleOpenExportsDir()}>
            {t("taskHistory.actions.openExportsDir")}
          </button>
        </div>
        {taskHistory.length === 0 ? (
          <div className="empty">{t("taskHistory.empty")}</div>
        ) : (
          <div className="task-log task-history">
            <table>
              <thead>
                <tr>
                  <th>{t("taskHistory.columns.file")}</th>
                  <th>{t("taskHistory.columns.phase")}</th>
                  <th>{t("taskHistory.columns.progress")}</th>
                  <th>{t("taskHistory.columns.updated")}</th>
                  <th>{t("taskHistory.columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {taskHistory.map((task) => {
                  const actionLabel = formatResumeAction(task);
                  return (
                    <tr key={task.batchId}>
                      <td title={task.sourcePdf}>{task.sourceFileName}</td>
                      <td>{formatTaskPhase(task.phase)}</td>
                      <td>{task.progress}%</td>
                      <td>{new Date(task.updatedAt).toLocaleString()}</td>
                      <td className="task-actions">
                        {task.hasExportFile ? (
                          <button
                            type="button"
                            disabled={ocrBusy}
                            onClick={() => void handleOpenTaskExport(task.batchId)}
                          >
                            {t("taskHistory.actions.openExport")}
                          </button>
                        ) : null}
                        {actionLabel && !task.hasExportFile ? (
                          <button
                            type="button"
                            disabled={ocrBusy}
                            onClick={() => void handleResumeTask(task.batchId)}
                          >
                            {actionLabel}
                          </button>
                        ) : null}
                        {task.lastError ? (
                          <span className="error-text" title={task.lastError}>
                            {task.lastError.slice(0, 48)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t("tasks.title")}</h2>
        {taskEvents.length === 0 ? (
          <div className="empty">{t("tasks.empty")}</div>
        ) : (
          <div className="task-log">
            <table>
              <thead>
                <tr>
                  <th>{t("tasks.columns.event")}</th>
                  <th>{t("tasks.columns.task")}</th>
                  <th>{t("tasks.columns.page")}</th>
                  <th>{t("tasks.columns.status")}</th>
                  <th>{t("tasks.columns.progress")}</th>
                  <th>{t("tasks.columns.message")}</th>
                </tr>
              </thead>
              <tbody>
                {taskEvents.map((entry, index) => (
                  <tr key={`${entry.event}-${entry.data.task_id}-${index}`}>
                    <td>{entry.event}</td>
                    <td>{entry.data.task_id}</td>
                    <td>{entry.data.page ?? "—"}</td>
                    <td>{entry.data.status}</td>
                    <td>
                      {entry.data.progress !== undefined ? `${entry.data.progress}%` : "—"}
                    </td>
                    <td>{entry.data.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OcrRegionPreviewModal
        open={regionPreviewOpen}
        fileName={pendingPdfFileName}
        imageSrc={previewImageSrc}
        region={contentRegion}
        onRegionChange={setContentRegion}
        onConfirm={() => void handleConfirmRegionPreview()}
        onCancel={handleCancelRegionPreview}
      />
    </div>
  );
}
