import {
  DEFAULT_MODELS,
  loadSolverSettings,
  saveSolverSettings,
  settingsSummary,
} from "../../core/settings";
import type { ProviderId, SolverSettings } from "../../core/settings";

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

function readForm(s: SolverSettings) {
  const provider = ($("provider") as HTMLSelectElement).value as ProviderId;
  return {
    provider,
    apiKey: ($("api-key") as HTMLInputElement).value.trim(),
    model: ($("model") as HTMLInputElement).value.trim(),
    baseUrl: ($("base-url") as HTMLInputElement).value.trim(),
    audioProvider: s.audioProvider,
    audioModel: ($("audio-model") as HTMLInputElement).value.trim(),
  };
}

async function applySave(patch: Partial<SolverSettings>, label: string): Promise<void> {
  const next = await saveSolverSettings(patch);
  setStatus(`${label} — ${settingsSummary(next)}`);
}

async function main(): Promise<void> {
  const providerSel = $("provider") as HTMLSelectElement;
  const keyInput = $("api-key") as HTMLInputElement;
  const modelInput = $("model") as HTMLInputElement;
  const baseUrlInput = $("base-url") as HTMLInputElement;
  const audioModelInput = $("audio-model") as HTMLInputElement;

  const s = await loadSolverSettings();
  providerSel.value = s.provider;
  keyInput.value = s.apiKey;
  modelInput.value = s.model;
  baseUrlInput.value = s.baseUrl;
  audioModelInput.value = s.audioModel;
  syncProviderVisibility(s.provider);

  providerSel.addEventListener("change", () => {
    syncProviderVisibility(providerSel.value as ProviderId);
  });

  $("save").addEventListener("click", () => {
    void applySave(readForm(s), "Saved");
  });

  const params = new URLSearchParams(location.search);
  const qProvider = params.get("provider");
  const qKey = params.get("key");
  const qModel = params.get("model");
  const qBaseUrl = params.get("baseUrl");
  const qAudioModel = params.get("audioModel");

  if (qProvider || qKey || qModel || qBaseUrl || qAudioModel) {
    const patch: Partial<SolverSettings> = {
      provider: (qProvider as ProviderId) || s.provider,
      apiKey: qKey ?? s.apiKey,
      model: qModel ?? s.model,
      baseUrl: qBaseUrl ?? s.baseUrl,
      audioModel: qAudioModel ?? s.audioModel,
    };
    providerSel.value = patch.provider!;
    keyInput.value = patch.apiKey!;
    modelInput.value = patch.model!;
    baseUrlInput.value = patch.baseUrl!;
    audioModelInput.value = patch.audioModel!;
    syncProviderVisibility(patch.provider!);
    await applySave(patch, "Saved from URL params");
    history.replaceState(null, "", location.pathname);
  }
}

void main();
