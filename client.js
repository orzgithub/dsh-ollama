window.__ModuleLoader__.load({
  id: "dsh-ollama",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    // ─── Locale Dictionaries ────────────────────────────────────────────────

    const lang_dict = {
      "zh-CN": {
        "settings.title": "Ollama",
        "settings.desc": "Ollama 本地模型服务管理",
        "endpoint.title": "连接设置",
        "endpoint.baseUrl": "服务地址",
        "endpoint.hint": "Ollama 服务器地址，例如 http://127.0.0.1:11434",
        "endpoint.save": "保存",
        "endpoint.test": "测试",
        "endpoint.testing": "测试中...",
        "endpoint.connected": "已连接 — {n} 个模型可用",
        "endpoint.failed": "连接失败",
        "models.title": "已安装模型",
        "models.loading": "加载中...",
        "models.empty": "暂无已安装模型，请在下方拉取模型",
        "models.info": "详情",
        "models.hide": "收起",
        "models.remove": "移除",
        "models.removeConfirm": "确认移除模型 \"{name}\" ？",
        "models.removeFailed": "移除失败: {error}",
        "pull.title": "拉取模型",
        "pull.placeholder": "输入模型名称，例如 llama3.1:8b, qwen2.5:14b",
        "pull.hint": "支持 Ollama 库模型或 HuggingFace tag",
        "pull.button": "拉取",
        "pull.complete": "拉取完成",
        "pull.starting": "开始拉取...",
        "params.title": "Ollama 参数",
        "params.button": "Ollama 参数",
        "params.temperature": "Temperature",
        "params.seed": "Seed",
        "params.top_k": "Top K",
        "params.top_p": "Top P",
        "params.min_p": "Min P",
        "params.repeat_penalty": "Repeat Penalty",
        "params.repeat_last_n": "Repeat Last N",
        "params.num_predict": "Max Tokens",
        "params.num_ctx": "Context Length",
        "params.stop": "Stop Sequences",
        "params.stopHint": "逗号分隔",
        "params.think": "Thinking",
        "params.thinkOn": "开启",
        "params.thinkOff": "关闭",
        "params.mirostat": "Mirostat",
        "params.mirostat_tau": "Mirostat Tau",
        "params.mirostat_eta": "Mirostat Eta",
        "params.frequency_penalty": "Frequency Penalty",
        "params.presence_penalty": "Presence Penalty",
        "params.tfs_z": "TFS Z",
        "params.typical_p": "Typical P",
        "params.reset": "重置默认",
        "params.hint": "仅当使用 Ollama 模型时生效",
        "params.defaultLabel": "默认",
      },
      "en-US": {
        "settings.title": "Ollama",
        "settings.desc": "Ollama local model service management",
        "endpoint.title": "Connection",
        "endpoint.baseUrl": "Base URL",
        "endpoint.hint": "Ollama server address, e.g. http://127.0.0.1:11434",
        "endpoint.save": "Save",
        "endpoint.test": "Test",
        "endpoint.testing": "Testing...",
        "endpoint.connected": "Connected — {n} model(s) available",
        "endpoint.failed": "Connection failed",
        "models.title": "Installed Models",
        "models.loading": "Loading...",
        "models.empty": "No models installed. Pull a model below.",
        "models.info": "Info",
        "models.hide": "Hide",
        "models.remove": "Remove",
        "models.removeConfirm": "Remove model \"{name}\"?",
        "models.removeFailed": "Remove failed: {error}",
        "pull.title": "Pull Model",
        "pull.placeholder": "Enter model name, e.g. llama3.1:8b, qwen2.5:14b",
        "pull.hint": "Supports Ollama library models or HuggingFace tags",
        "pull.button": "Pull",
        "pull.complete": "Pull complete",
        "pull.starting": "Starting pull...",
        "params.title": "Ollama Parameters",
        "params.button": "Ollama Params",
        "params.temperature": "Temperature",
        "params.seed": "Seed",
        "params.top_k": "Top K",
        "params.top_p": "Top P",
        "params.min_p": "Min P",
        "params.repeat_penalty": "Repeat Penalty",
        "params.repeat_last_n": "Repeat Last N",
        "params.num_predict": "Max Tokens",
        "params.num_ctx": "Context Length",
        "params.stop": "Stop Sequences",
        "params.stopHint": "comma-separated",
        "params.think": "Thinking",
        "params.thinkOn": "On",
        "params.thinkOff": "Off",
        "params.mirostat": "Mirostat",
        "params.mirostat_tau": "Mirostat Tau",
        "params.mirostat_eta": "Mirostat Eta",
        "params.frequency_penalty": "Frequency Penalty",
        "params.presence_penalty": "Presence Penalty",
        "params.tfs_z": "TFS Z",
        "params.typical_p": "Typical P",
        "params.reset": "Reset Defaults",
        "params.hint": "Only effective when using Ollama models",
        "params.defaultLabel": "default",
      },
    };

    // ─── CSS ──────────────────────────────────────────────────────────────────

    const css = `
.ollama-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;min-width:0;list-style:none;transition:border-color .16s,background .16s;overflow:hidden;margin-bottom:8px}
.ollama-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.ollama-header{width:100%;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;align-items:center;gap:8px;padding:10px 14px;display:flex}
.ollama-header:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ollama-headText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex;overflow:hidden}
.ollama-name{color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis;font-weight:600;overflow:hidden}
.ollama-desc{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:12px;overflow:hidden}
.ollama-chevron{color:var(--dsw-alias-label-tertiary);flex:none;font-size:13px;transition:transform .12s}
.ollama-chevronOpen{transform:rotate(180deg)}
.ollama-body{flex-direction:column;gap:14px;padding:0 14px 14px;display:flex}
.ollama-section{flex-direction:column;gap:8px;display:flex}
.ollama-sectionTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:4px}
.ollama-row{display:flex;align-items:center;gap:12px}
.ollama-row .ollama-label{flex:none;min-width:64px}
.ollama-controls{display:flex;gap:8px;flex:1;align-items:center}
.ollama-controls .ollama-input{flex:1}
.ollama-controls .ollama-input,.ollama-controls .ollama-btn{height:32px;box-sizing:border-box}
.ollama-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}
.ollama-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.ollama-input{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:6px;padding:6px 8px;font-size:13px;width:100%;box-sizing:border-box}
.ollama-input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}
.ollama-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.ollama-input:disabled{opacity:.6;cursor:default}
.ollama-btnConversation{height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}
.ollama-btnConversation:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ollama-btnConversation:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.ollama-btnConversationActive{background:var(--dsw-alias-interactive-bg-hover)}
.ollama-btn{font:inherit;cursor:pointer;border-radius:6px;padding:5px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);transition:background .13s}
.ollama-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ollama-btn:disabled{opacity:.5;cursor:default}
.ollama-btnPrimary{border:1px solid var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground)}
.ollama-btnPrimary:hover:not(:disabled){border-color:var(--dsw-alias-button-info-hover);background:var(--dsw-alias-button-info-hover)}
.ollama-btnDanger{border:1px solid var(--dsw-alias-state-error-border);background:transparent;color:var(--dsw-alias-state-error-primary)}
.ollama-btnDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-bg-hover)}
.ollama-status{font-size:12px;line-height:1.5}
.ollama-statusOk{color:var(--dsw-alias-state-ok-primary)}
.ollama-statusErr{color:var(--dsw-alias-state-error-primary)}
.ollama-statusWarn{color:var(--dsw-alias-state-warn-primary)}
.ollama-modelsList{flex-direction:column;gap:4px;display:flex;max-height:400px;overflow-y:auto}
.ollama-modelRow{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;border:1px solid transparent;transition:background .12s,border-color .12s}
.ollama-modelRow:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.ollama-modelName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ollama-modelMeta{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.ollama-modelActions{display:flex;gap:4px;flex-shrink:0}
.ollama-progress{width:100%;height:4px;background:var(--dsw-alias-bg-layer-1);border-radius:2px;overflow:hidden;margin-top:4px}
.ollama-progressBar{height:100%;background:var(--dsw-alias-state-business-primary);transition:width .3s;border-radius:2px}
.ollama-log{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:8px;max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.ollama-empty{color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center;padding:16px}
.ollama-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;animation:ollamaSpin .6s linear infinite}
@keyframes ollamaSpin{to{transform:rotate(360deg)}}
.ollama-detail{padding:4px 8px 8px;font-size:12px}
.ollama-detailPre{font-family:monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:8px;white-space:pre-wrap;word-break:break-all}
.ollama-paramsPopup{position:absolute;bottom:calc(100% + 8px);right:0;z-index:1100;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(320px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;border-radius:20px;flex-direction:column;padding:4px;display:flex;overflow:hidden}
.ollama-paramsPopupTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);padding:6px 10px;display:flex;justify-content:space-between;align-items:center}
.ollama-paramsGroup{display:flex;flex-direction:column;gap:2px;padding:4px;overflow-y:auto}
.ollama-paramsField{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:8px}
.ollama-paramsField:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ollama-paramsLabel{font-size:12px;font-weight:500;color:var(--dsw-alias-label-primary);display:flex;justify-content:space-between;align-items:center}
.ollama-paramsDefault{font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400}
.ollama-paramsInput{border:1px solid var(--dsw-alias-border-l2);font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border-radius:4px;padding:4px 6px;width:100%;box-sizing:border-box}
.ollama-paramsInput:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.ollama-paramsInput::placeholder{color:var(--dsw-alias-label-tertiary)}
.ollama-paramsToggle{display:flex;gap:0;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;overflow:hidden}
.ollama-paramsToggleBtn{flex:1;padding:4px 8px;font:inherit;font-size:12px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s}
.ollama-paramsToggleBtnActive{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-foreground)}
.ollama-paramsDivider{border:0;border-top:1px solid var(--dsw-alias-border-l2);margin:4px 0}
`;
    if (typeof document !== "undefined") {
      const existing = document.querySelector("style[data-plugin-css='dsh-ollama']");
      if (!existing) {
        const tag = document.createElement("style");
        tag.dataset.plugin = "dsh-ollama";
        tag.dataset.pluginCss = "dsh-ollama";
        tag.textContent = css;
        document.head.appendChild(tag);
      }
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    const NS = "dsh-ollama";
    const SETTINGS_NS = "llm-ollama";
    const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return "—";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let i = 0;
      let size = bytes;
      while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
      return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }

    function localeString(dict, key, params) {
      let str = dict[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    }

    // ─── Ollama API Client ────────────────────────────────────────────────────

    async function ollamaFetch(baseUrl, path, opts = {}) {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers: opts.body ? { "Content-Type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        let msg = `HTTP ${resp.status}`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }
      return resp;
    }

    async function ollamaTags(baseUrl) {
      const resp = await ollamaFetch(baseUrl, "/api/tags");
      const data = await resp.json();
      return data.models || [];
    }

    async function ollamaShow(baseUrl, name) {
      const resp = await ollamaFetch(baseUrl, "/api/show", {
        method: "POST",
        body: { name },
      });
      return resp.json();
    }

    async function ollamaPull(baseUrl, name, onProgress, signal) {
      const resp = await ollamaFetch(baseUrl, "/api/pull", {
        method: "POST",
        body: { name, stream: true },
        signal,
      });
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try { onProgress(JSON.parse(line)); } catch {}
        }
      }
    }

    async function ollamaDelete(baseUrl, name) {
      await ollamaFetch(baseUrl, "/api/delete", {
        method: "DELETE",
        body: { name },
      });
    }

    // ─── React Helpers ────────────────────────────────────────────────────────

    const h = react.createElement;

    function Spinner() {
      return h("span", { className: "ollama-spinner" });
    }

    // ─── Settings Card Components ──────────────────────────────────────────────

    function EndpointSection({ baseUrl, dict, onSave, onTest, testStatus }) {
      const [draft, setDraft] = react.useState(baseUrl);
      const [saving, setSaving] = react.useState(false);

      const save = async () => {
        setSaving(true);
        try { await onSave(draft.trim() || DEFAULT_BASE_URL); }
        finally { setSaving(false); }
      };

      return h("div", { className: "ollama-section" },
        h("div", { className: "ollama-sectionTitle" }, dict("endpoint.title")),
        h("div", { className: "ollama-row" },
          h("label", { className: "ollama-label" }, dict("endpoint.baseUrl")),
          h("div", { className: "ollama-controls" },
            h("input", {
              className: "ollama-input",
              value: draft,
              placeholder: DEFAULT_BASE_URL,
              onChange: (e) => setDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === "Enter") save(); },
            }),
            h("button", {
              className: "ollama-btn ollama-btnPrimary",
              disabled: saving,
              onClick: save,
            }, saving ? h(Spinner) : dict("endpoint.save")),
            h("button", {
              className: "ollama-btn",
              onClick: () => onTest(draft.trim() || DEFAULT_BASE_URL),
            }, testStatus?.testing ? h(Spinner) : dict("endpoint.test")),
          )
        ),
        h("span", { className: "ollama-hint" }, dict("endpoint.hint")),
        testStatus && !testStatus.testing && h("span", {
          className: `ollama-status ${testStatus.ok ? "ollama-statusOk" : "ollama-statusErr"}`
        }, testStatus.ok
          ? localeString(dict, "endpoint.connected", { n: testStatus.modelCount })
          : `${dict("endpoint.failed")}: ${testStatus.error}`)
      );
    }

    function ModelRow({ model, baseUrl, dict, onDelete, deleting }) {
      const [showDetail, setShowDetail] = react.useState(false);
      const [detail, setDetail] = react.useState(null);

      const loadDetail = async () => {
        if (detail) { setShowDetail(!showDetail); return; }
        try {
          setDetail(await ollamaShow(baseUrl, model.name));
          setShowDetail(true);
        } catch (e) {
          setDetail({ error: e.message });
          setShowDetail(true);
        }
      };

      const size = formatBytes(model.size);
      const params = model.details?.parameter_size || "";
      const quant = model.details?.quantization_level || "";

      return h("div", null,
        h("div", { className: "ollama-modelRow" },
          h("span", { className: "ollama-modelName", title: model.name }, model.name),
          h("span", { className: "ollama-modelMeta" },
            [params, quant, size].filter(Boolean).join(" · ")
          ),
          h("div", { className: "ollama-modelActions" },
            h("button", {
              className: "ollama-btn",
              style: { fontSize: 11, padding: "3px 8px" },
              onClick: loadDetail,
            }, showDetail ? dict("models.hide") : dict("models.info")),
            h("button", {
              className: "ollama-btn ollama-btnDanger",
              style: { fontSize: 11, padding: "3px 8px" },
              disabled: deleting,
              onClick: () => onDelete(model.name),
            }, deleting ? h(Spinner) : dict("models.remove")),
          )
        ),
        showDetail && detail && h("div", { className: "ollama-detail" },
          detail.error
            ? h("span", { className: "ollama-statusErr" }, detail.error)
            : h("div", { className: "ollama-detailPre" }, JSON.stringify({
                family: detail.details?.family,
                families: detail.details?.families,
                parameter_size: detail.details?.parameter_size,
                quantization: detail.details?.quantization_level,
                context_length: detail.details?.context_length,
                embedding_length: detail.details?.embedding_length,
                capabilities: detail.details?.capabilities,
                template: (detail.template || "").slice(0, 200),
              }, null, 2))
        )
      );
    }

    function PullSection({ baseUrl, dict, onPull, pulling, pullProgress }) {
      const [name, setName] = react.useState("");
      return h("div", { className: "ollama-section" },
        h("div", { className: "ollama-sectionTitle" }, dict("pull.title")),
        h("div", { className: "ollama-controls" },
          h("input", {
            className: "ollama-input",
            value: name,
            placeholder: dict("pull.placeholder"),
            disabled: pulling,
            onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => { if (e.key === "Enter" && !pulling && name.trim()) onPull(name.trim()); },
          }),
          h("button", {
            className: "ollama-btn ollama-btnPrimary",
            disabled: pulling || !name.trim(),
            onClick: () => { if (name.trim()) onPull(name.trim()); },
          }, pulling ? h(Spinner) : dict("pull.button")),
        ),
        h("span", { className: "ollama-hint" }, dict("pull.hint")),
        pullProgress && h("div", null,
          h("div", { className: "ollama-progress" },
            h("div", {
              className: "ollama-progressBar",
              style: { width: pullProgress.total ? `${(pullProgress.completed / pullProgress.total) * 100}%` : "30%" },
            })
          ),
          h("span", { className: "ollama-status ollama-statusWarn", style: { marginTop: 4 } },
            pullProgress.status
          ),
          pullProgress.log && h("div", { className: "ollama-log" }, pullProgress.log)
        )
      );
    }

    function OllamaCard({ scope, useSnapshot, t }) {
      const snapshot = useSnapshot();
      const value = snapshot?.value;
      const baseUrl = value?.baseURL || DEFAULT_BASE_URL;

      const [open, setOpen] = react.useState(false);
      const [models, setModels] = react.useState([]);
      const [loading, setLoading] = react.useState(false);
      const [testStatus, setTestStatus] = react.useState(null);
      const [pulling, setPulling] = react.useState(false);
      const [pullProgress, setPullProgress] = react.useState(null);
      const [deleting, setDeleting] = react.useState(null);

      react.useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
          setLoading(true);
          try { const m = await ollamaTags(baseUrl); if (!cancelled) setModels(m); }
          catch { if (!cancelled) setModels([]); }
          finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
      }, [open, baseUrl]);

      const handleSave = async (newUrl) => {
        try { await scope.set("baseURL", newUrl); setTestStatus(null); setModels([]); }
        catch (e) { setTestStatus({ ok: false, error: e.message }); }
      };

      const handleTest = async (url) => {
        setTestStatus({ testing: true });
        try { const m = await ollamaTags(url); setTestStatus({ ok: true, modelCount: m.length }); }
        catch (e) { setTestStatus({ ok: false, error: e.message }); }
      };

      const handlePull = async (modelName) => {
        if (pulling) return;
        setPulling(true);
        setPullProgress({ status: t("pull.starting"), completed: 0, total: 0, log: "" });
        const controller = new AbortController();
        try {
          let logLines = [];
          await ollamaPull(baseUrl, modelName, (obj) => {
            if (obj.error) {
              logLines = [...logLines, `ERROR: ${obj.error}`];
              setPullProgress((p) => ({ ...p, status: obj.error, log: logLines.join("\n") }));
              return;
            }
            if (obj.status) {
              const line = obj.completed != null && obj.total != null
                ? `${obj.status}: ${formatBytes(obj.completed)} / ${formatBytes(obj.total)}`
                : obj.status;
              logLines = [...logLines.slice(-50), line];
              setPullProgress({ status: line, completed: obj.completed || 0, total: obj.total || 0, log: logLines.join("\n") });
            }
          }, controller.signal);
          setPullProgress((p) => ({ ...p, status: t("pull.complete") }));
          const m = await ollamaTags(baseUrl);
          setModels(m);
          setTimeout(() => { setPulling(false); setPullProgress(null); }, 2000);
        } catch (e) {
          if (e.name !== "AbortError") setPullProgress((p) => ({ ...p, status: `Error: ${e.message}` }));
          else setPullProgress(null);
          setPulling(false);
        }
      };

      const handleDelete = async (modelName) => {
        if (!confirm(localeString(t, "models.removeConfirm", { name: modelName }))) return;
        setDeleting(modelName);
        try {
          await ollamaDelete(baseUrl, modelName);
          setModels((prev) => prev.filter((m) => m.name !== modelName));
        } catch (e) { alert(localeString(t, "models.removeFailed", { error: e.message })); }
        finally { setDeleting(null); }
      };

      return h("li", { className: `ollama-card ${open ? "ollama-cardOpen" : ""}` },
        h("button", { className: "ollama-header", onClick: () => setOpen(!open), type: "button" },
          h("div", { className: "ollama-headText" },
            h("span", { className: "ollama-name" }, t("settings.title")),
            h("span", { className: "ollama-desc" },
              `${baseUrl}${models.length > 0 ? ` — ${models.length}` : ""}`
            ),
          ),
          h("span", { className: `ollama-chevron ${open ? "ollama-chevronOpen" : ""}` }, "▾"),
        ),
        open && h("div", { className: "ollama-body" },
          h(EndpointSection, { baseUrl, dict: t, onSave: handleSave, onTest: handleTest, testStatus }),
          h("div", { className: "ollama-section" },
            h("div", { className: "ollama-sectionTitle" }, t("models.title")),
            loading
              ? h("div", { className: "ollama-status ollama-statusWarn" }, h(Spinner), ` ${t("models.loading")}`)
              : models.length === 0
                ? h("div", { className: "ollama-empty" }, t("models.empty"))
                : h("div", { className: "ollama-modelsList" },
                    models.map((m) => h(ModelRow, {
                      key: m.name, model: m, baseUrl, dict: t,
                      deleting: deleting === m.name, onDelete: handleDelete,
                    }))
                  )
          ),
          h(PullSection, { baseUrl, dict: t, onPull: handlePull, pulling, pullProgress }),
        )
      );
    }

    // ─── Parameter Panel (Composer Dock) ──────────────────────────────────────

    const PARAM_FIELDS = [
      { key: "temperature", label: "params.temperature", type: "number", step: 0.1, min: 0, max: 2 },
      { key: "seed", label: "params.seed", type: "number", step: 1 },
      { key: "top_k", label: "params.top_k", type: "number", step: 1, min: 1 },
      { key: "top_p", label: "params.top_p", type: "number", step: 0.05, min: 0, max: 1 },
      { key: "min_p", label: "params.min_p", type: "number", step: 0.05, min: 0, max: 1 },
      { key: "repeat_penalty", label: "params.repeat_penalty", type: "number", step: 0.1, min: 0 },
      { key: "repeat_last_n", label: "params.repeat_last_n", type: "number", step: 1, min: 0 },
      { key: "frequency_penalty", label: "params.frequency_penalty", type: "number", step: 0.1 },
      { key: "presence_penalty", label: "params.presence_penalty", type: "number", step: 0.1 },
      { key: "tfs_z", label: "params.tfs_z", type: "number", step: 0.05, min: 0, max: 1 },
      { key: "typical_p", label: "params.typical_p", type: "number", step: 0.05, min: 0, max: 1 },
      { key: "mirostat", label: "params.mirostat", type: "number", step: 1, min: 0, max: 2 },
      { key: "mirostat_tau", label: "params.mirostat_tau", type: "number", step: 0.1, min: 0 },
      { key: "mirostat_eta", label: "params.mirostat_eta", type: "number", step: 0.01, min: 0 },
      { key: "num_predict", label: "params.num_predict", type: "number", step: 1 },
      { key: "num_ctx", label: "params.num_ctx", type: "number", step: 256, min: 1 },
      { key: "stop", label: "params.stop", type: "text" },
      { key: "think", label: "params.think", type: "toggle" },
    ];

    function ParamInput({ field, value, onChange, dict }) {
      if (field.type === "toggle") {
        return h("div", { className: "ollama-paramsField" },
          h("label", { className: "ollama-paramsLabel" }, dict(field.label)),
          h("div", { className: "ollama-paramsToggle" },
            h("button", {
              className: `ollama-paramsToggleBtn ${value === true ? "ollama-paramsToggleBtnActive" : ""}`,
              type: "button",
              onClick: () => onChange(value === true ? undefined : true),
            }, dict("params.thinkOn")),
            h("button", {
              className: `ollama-paramsToggleBtn ${value === false ? "ollama-paramsToggleBtnActive" : ""}`,
              type: "button",
              onClick: () => onChange(value === false ? undefined : false),
            }, dict("params.thinkOff")),
          )
        );
      }

      const displayValue = value != null ? String(value) : "";
      return h("div", { className: "ollama-paramsField" },
        h("label", { className: "ollama-paramsLabel" },
          dict(field.label),
          value == null && h("span", { className: "ollama-paramsDefault" }, dict("params.defaultLabel")),
        ),
        h("input", {
          className: "ollama-paramsInput",
          type: field.type === "text" ? "text" : "number",
          value: displayValue,
          step: field.step,
          min: field.min,
          max: field.max,
          placeholder: field.type === "text" ? dict("params.stopHint") : dict("params.defaultLabel"),
          onChange: (e) => {
            const v = e.target.value;
            if (v === "") { onChange(undefined); return; }
            if (field.type === "text") { onChange(v.split(",").map((s) => s.trim()).filter(Boolean)); return; }
            const n = Number(v);
            onChange(Number.isNaN(n) ? undefined : n);
          },
        })
      );
    }

    function ParamsPanel({ params, onChange, dict, onClose }) {
      const [local, setLocal] = react.useState({ ...params });

      const update = (key, value) => {
        setLocal((prev) => {
          const next = { ...prev };
          if (value === undefined) delete next[key];
          else next[key] = value;
          return next;
        });
      };

      const apply = () => {
        const cleaned = {};
        for (const [k, v] of Object.entries(local)) {
          if (v !== undefined) cleaned[k] = v;
        }
        onChange(cleaned);
        onClose();
      };

      const reset = () => {
        setLocal({});
        onChange({});
        onClose();
      };

      return h("div", { className: "ollama-paramsPopup", onClick: (e) => e.stopPropagation() },
        h("div", { className: "ollama-paramsPopupTitle" },
          dict("params.title"),
          h("button", {
            className: "ollama-btn",
            style: { fontSize: 11, padding: "2px 6px" },
            onClick: onClose,
          }, "✕"),
        ),
        h("div", { className: "ollama-paramsGroup" },
          PARAM_FIELDS.map((f, i) =>
            h(react.Fragment, { key: f.key },
              i > 0 && i % 5 === 0 && h("hr", { className: "ollama-paramsDivider" }),
              h(ParamInput, {
                field: f,
                value: local[f.key],
                onChange: (v) => update(f.key, v),
                dict,
              })
            )
          )
        ),
        h("div", { style: { marginTop: 10, display: "flex", gap: 8 } },
          h("button", { className: "ollama-btn", onClick: reset }, dict("params.reset")),
          h("button", { className: "ollama-btn ollama-btnPrimary", onClick: apply }, dict("endpoint.save")),
        )
      );
    }

    function ParamsDockButton({ scope, useSnapshot, dict }) {
      const snapshot = useSnapshot();
      const value = snapshot?.value;
      const currentParams = value?.params || {};
      const [open, setOpen] = react.useState(false);
      const btnRef = react.useRef(null);
      const panelRef = react.useRef(null);

      const activeCount = Object.keys(currentParams).length;

      react.useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          if (panelRef.current && !panelRef.current.contains(e.target) &&
              btnRef.current && !btnRef.current.contains(e.target)) {
            setOpen(false);
          }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
      }, [open]);

      return h("span", {
        ref: btnRef,
        style: { position: "relative", display: "inline-flex" },
      },
        h("button", {
          className: `ollama-btnConversation ${activeCount > 0 ? "ollama-btnConversationActive" : ""}`,
          type: "button",
          title: dict("params.title"),
          onClick: (e) => { e.stopPropagation(); setOpen(!open); },
        },
          dict("params.button"),
          activeCount > 0 && h("span", {
            style: {
              background: "var(--dsw-alias-state-business-primary)",
              color: "var(--dsw-alias-label-primary-foreground)",
              borderRadius: 8,
              padding: "0 5px",
              fontSize: 10,
              lineHeight: "16px",
              marginLeft: 2,
            },
          }, String(activeCount)),
        ),
        open && h("div", { ref: panelRef },
          h(ParamsPanel, {
            params: currentParams,
            onChange: async (newParams) => {
              try { await scope.set("params", newParams); }
              catch (e) { console.error("dsh-ollama: failed to save params", e); }
            },
            dict,
            onClose: () => setOpen(false),
          })
        )
      );
    }

    // ─── Plugin Registration ──────────────────────────────────────────────────

    const inject = ["slots", "settingsScope", "modelDirectories"];

    function apply(ctx) {
      const modelDirectories = ctx.modelDirectories;
      // Detect language
      const detected = typeof navigator !== "undefined" ? navigator.language : "en-US";
      const langBase = detected.split("-")[0];
      const dict = lang_dict[detected]
        || Object.values(lang_dict).find((_, i) => Object.keys(lang_dict)[i].startsWith(langBase))
        || lang_dict["en-US"];
      const t = (key, params) => localeString(dict, key, params);

      // Settings scope
      const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS });
      const getSnapshot = scope.getSnapshot.bind(scope);
      const subscribe = scope.subscribe.bind(scope);
      const useSnapshot = () => react.useSyncExternalStore(subscribe, getSnapshot);

      // Settings card in Plugins page
      ctx.slots.inject("settings.plugin.item", () => {
        try {
          return ctx.slots.register(
            {
              name: "settings.plugin.item",
              key: SETTINGS_NS,
              id: "dsh-ollama",
              order: 200,
              inject: () => ({ scope, useSnapshot, t }),
            },
            OllamaCard
          );
        } catch (err) {
          console.warn(`dsh-ollama: settings card rejected (${err instanceof Error ? err.message : String(err)})`);
        }
      });

      // Composer input-right button for Ollama parameters
      // Only visible when current model is from the Ollama provider
      ctx.slots.inject("conversation.input.right", () => {
        try {
          return ctx.slots.register(
            {
              name: "conversation.input.right",
              id: "dsh-ollama-params",
              order: 50,
              inject: () => ({ scope, useSnapshot, dict: t, modelDirectories }),
            },
            function OllamaParamsSlot({ sessionId, modelDirectories: dirs }) {
              // Use modelDirectories to get the current provider for this session
              const [isOllama, setIsOllama] = react.useState(false);

              react.useEffect(() => {
                if (!dirs || !sessionId) { setIsOllama(false); return; }
                const dir = dirs.directoryFor(sessionId);
                if (!dir) { setIsOllama(false); return; }

                // Check current state
                const check = () => {
                  const snap = dir.store.getSnapshot();
                  setIsOllama(snap.current?.provider === "ollama");
                };
                check();

                // Subscribe to changes
                return dir.store.subscribe(check);
              }, [dirs, sessionId]);

              if (!isOllama) return null;
              return h(ParamsDockButton, { scope, useSnapshot, dict: t });
            }
          );
        } catch (err) {
          console.warn(`dsh-ollama: dock button rejected (${err instanceof Error ? err.message : String(err)})`);
        }
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
