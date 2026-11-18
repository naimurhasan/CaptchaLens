import {
  DEFAULT_MODELS,
  loadSolverSettings,
  saveSolverSettings,
  settingsSummary,
} from "../../core/settings";
import type { ProviderId } from "../../core/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function syncProviderVisibility(provider: ProviderId): void {
  const local = provider === "local";
  $("key-row").classList.toggle("hidden", local);
  $("baseurl-row").classList.toggle("hidden", !local);
  $("model-hint").textContent = `default: ${DEFAULT_MODELS[provider]}`;
}

function setStatus(text: string, isError = false): void {
  const el = $("status");
  el.textContent = text;
  el.className = isError ? "error" : "";
}

async function save(provider: ProviderId, apiKey: string, model: string, baseUrl: string): Promise<void> {
  const next = await saveSolverSettings({ provider, apiKey: apiKey.trim(), model, baseUrl });
  setStatus(`Saved — ${settingsSummary(next)}`);
}

async function main(): Promise<void> {
  const providerSel = $("provider") as HTMLSelectElement;
  const keyInput = $("api-key") as HTMLInputElement;
  const modelInput = $("model") as HTMLInputElement;
  const baseUrlInput = $("base-url") as HTMLInputElement;

  const s = await loadSolverSettings();
  providerSel.value = s.provider;
  keyInput.value = s.apiKey;
  modelInput.value = s.model;
  baseUrlInput.value = s.baseUrl;
  syncProviderVisibility(s.provider);

  providerSel.addEventListener("change", () => {
    syncProviderVisibility(providerSel.value as ProviderId);
  });

  $("save").addEventListener("click", () => {
    void save(
      providerSel.value as ProviderId,
      keyInput.value,
      modelInput.value.trim(),
      baseUrlInput.value.trim()
    );
  });

  const params = new URLSearchParams(location.search);
  const qProvider = params.get("provider");
  const qKey = params.get("key");
  const qModel = params.get("model");
  const qBaseUrl = params.get("baseUrl");

  if (qProvider || qKey || qModel || qBaseUrl) {
    const provider = (qProvider as ProviderId) || s.provider;
    const apiKey = qKey ?? s.apiKey;
    const model = qModel ?? s.model;
    const baseUrl = qBaseUrl ?? s.baseUrl;
    providerSel.value = provider;
    keyInput.value = apiKey;
    modelInput.value = model;
    baseUrlInput.value = baseUrl;
    syncProviderVisibility(provider);
    await save(provider, apiKey, model, baseUrl).then(() => {
      setStatus(`Saved from URL params — ${settingsSummary({ provider, apiKey, model, baseUrl })}`);
    });
    history.replaceState(null, "", location.pathname);
  }
}

void main();
