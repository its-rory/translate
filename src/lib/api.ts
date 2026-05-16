const BASE_URL = "/api/v1";

type TranslateParams = {
    source_text: string;
    source_language: string;
    target_language: string;
    translation_mode: string;
    provider_id: number;
    model: string;
    prompt_id: number;
};

type SSEStream = {
    onDelta: (handler: (delta: string) => void) => SSEStream;
    onError: (handler: (error: string) => void) => SSEStream;
    onComplete: (handler: () => void) => SSEStream;
    abort: () => void;
};

type ProviderPayload = {
    id: number;
    name: string;
    base_url: string;
    api_key: string;
    api_style: string;
    models: string;
    created_at: number;
    updated_at: number;
};

type PromptPayload = {
    id: number;
    name: string;
    content: string;
    is_system: boolean;
    created_at: number;
    updated_at: number;
};

type UserPayload = {
    id: number;
    username: string;
    role: "ADMIN" | "USER";
    display_name: string;
    email: string;
    created_at: number;
};

type ApiEnvelope<T> = T | { data: T };

function getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("access_token");
}

function buildHeaders(init?: RequestInit): Headers {
    const headers = new Headers(init?.headers);
    if (init?.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const token = getAccessToken();
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
}

async function parseJsonSafely<T>(res: Response): Promise<T | undefined> {
    if (res.status === 204) return undefined;

    const text = await res.text().catch(() => "");
    if (!text) return undefined;

    return JSON.parse(text) as T;
}

function unwrapData<T>(payload: ApiEnvelope<T> | undefined): T {
    if (payload && typeof payload === "object" && "data" in payload) {
        return payload.data;
    }
    return payload as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: buildHeaders(init),
    });

    const payload = await parseJsonSafely<unknown>(res);
    if (!res.ok) {
        const errorPayload = payload as { error?: string } | undefined;
        throw {
            message: errorPayload?.error ?? `Request failed: ${res.status}`,
            status: res.status,
            body: payload,
        };
    }

    return payload as T;
}

function createSSEStream(path: string, body: unknown): SSEStream {
    const controller = new AbortController();
    let deltaHandler: ((delta: string) => void) | null = null;
    let errorHandler: ((error: string) => void) | null = null;
    let completeHandler: (() => void) | null = null;

    (async () => {
        try {
            const res = await fetch(`${BASE_URL}${path}`, {
                method: "POST",
                headers: buildHeaders({ body: JSON.stringify(body) }),
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!res.ok) {
                const payload = await parseJsonSafely<{ error?: string }>(res);
                errorHandler?.(payload?.error ?? `HTTP ${res.status}`);
                completeHandler?.();
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) {
                errorHandler?.("No response body");
                completeHandler?.();
                return;
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;

                    const data = line.slice(6);
                    if (data === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(data) as { error?: string; delta?: string; content?: string; text?: string };
                        if (parsed.error) {
                            errorHandler?.(parsed.error);
                            continue;
                        }
                        const delta = parsed.delta ?? parsed.content ?? parsed.text ?? "";
                        if (delta) deltaHandler?.(delta);
                    } catch {
                        if (data.trim()) deltaHandler?.(data);
                    }
                }
            }

            completeHandler?.();
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
                completeHandler?.();
                return;
            }
            errorHandler?.(err instanceof Error ? err.message : String(err));
            completeHandler?.();
        }
    })();

    return {
        onDelta: (handler) => { deltaHandler = handler; return wrap(controller, { deltaHandler: handler, errorHandler, completeHandler }); },
        onError: (handler) => { errorHandler = handler; return wrap(controller, { deltaHandler, errorHandler: handler, completeHandler }); },
        onComplete: (handler) => { completeHandler = handler; return wrap(controller, { deltaHandler, errorHandler, completeHandler: handler }); },
        abort: () => controller.abort(),
    };
}

function wrap(ctrl: AbortController, h: { deltaHandler: ((delta: string) => void) | null; errorHandler: ((error: string) => void) | null; completeHandler: (() => void) | null }): SSEStream {
    return {
        onDelta: (handler) => { h.deltaHandler = handler; return wrap(ctrl, { ...h, deltaHandler: handler }); },
        onError: (handler) => { h.errorHandler = handler; return wrap(ctrl, { ...h, errorHandler: handler }); },
        onComplete: (handler) => { h.completeHandler = handler; return wrap(ctrl, { ...h, completeHandler: handler }); },
        abort: () => ctrl.abort(),
    };
}

export const api = {
    translate(params: TranslateParams): SSEStream {
        return createSSEStream("/translate/stream", {
            provider_id: params.provider_id,
            model_name: params.model,
            prompt_id: params.prompt_id,
            source_text: params.source_text,
            target_lang: params.target_language,
            source_lang: params.source_language,
        });
    },

    async listProviders() {
        const providers = unwrapData<ProviderPayload[]>(await request<ApiEnvelope<ProviderPayload[]>>("/providers"));
        return { providers };
    },

    createProvider: (input: { name: string; base_url: string; api_key: string; api_style: string; models: string }) =>
        request("/providers", { method: "POST", body: JSON.stringify(input) }),

    updateProvider: (id: number, patch: Record<string, unknown>) =>
        request(`/providers/${id}`, { method: "PUT", body: JSON.stringify(patch) }),

    deleteProvider: (id: number) =>
        request(`/providers/${id}`, { method: "DELETE" }),

    async listPrompts() {
        const prompts = unwrapData<PromptPayload[]>(await request<ApiEnvelope<PromptPayload[]>>("/prompts"));
        return { prompts };
    },

    createPrompt: (input: { name: string; content: string }) =>
        request("/prompts", { method: "POST", body: JSON.stringify(input) }),

    updatePrompt: (id: number, patch: Record<string, unknown>) =>
        request(`/prompts/${id}`, { method: "PUT", body: JSON.stringify(patch) }),

    deletePrompt: (id: number) =>
        request(`/prompts/${id}`, { method: "DELETE" }),

    listModels: (providerId: number) =>
        request<ApiEnvelope<string[]>>(`/providers/${providerId}/models`),

    async getPreferences() {
        const payload = unwrapData<Record<string, unknown>>(await request<ApiEnvelope<Record<string, unknown>>>("/preferences"));
        const providerId = payload.selected_model_provider_id;
        const modelName = payload.selected_model_name;

        return {
            selectedModel: typeof providerId === "number" && typeof modelName === "string"
                ? { providerId, model: modelName }
                : null,
            translationMode: typeof payload.translation_mode === "string" ? payload.translation_mode : "manual",
            sourceLanguage: typeof payload.source_language === "string" ? payload.source_language : "auto",
            targetLanguage: typeof payload.target_language === "string" ? payload.target_language : "",
            selectedPromptId: typeof payload.selected_prompt_id === "number" ? payload.selected_prompt_id : null,
            theme: typeof payload.theme === "string" ? payload.theme : "system",
            locale: typeof payload.locale === "string" ? payload.locale : "en",
        };
    },

    updatePreferences: (data: Record<string, unknown>) => {
        const selectedModel = (data.selectedModel ?? null) as { providerId: number; model: string } | null;
        const payload = {
            translation_mode: data.translationMode ?? "manual",
            source_language: data.sourceLanguage ?? "auto",
            target_language: data.targetLanguage ?? "",
            selected_model_provider_id: selectedModel?.providerId ?? null,
            selected_model_name: selectedModel?.model ?? "",
            selected_prompt_id: data.selectedPromptId ?? null,
            theme: data.theme ?? "system",
            locale: data.locale ?? "en",
        };
        return request("/preferences", { method: "PUT", body: JSON.stringify(payload) });
    },

    async getCurrentUser() {
        const payload = await request<{ user?: UserPayload; user_id?: number; username?: string; role?: "ADMIN" | "USER" }>("/auth/me");
        const user = payload.user ?? {
            id: payload.user_id ?? 0,
            username: payload.username ?? "",
            role: payload.role ?? "USER",
            display_name: "",
            email: "",
            created_at: 0,
        };
        return { user };
    },

    logout: () =>
        request("/auth/logout", { method: "POST", body: JSON.stringify({}) }),

    async listUsers() {
        const users = unwrapData<UserPayload[]>(await request<ApiEnvelope<UserPayload[]>>("/users"));
        return { users };
    },

    createUser: (input: { username: string; password: string; role: "ADMIN" | "USER"; display_name: string; email: string }) =>
        request("/users", { method: "POST", body: JSON.stringify(input) }),

    updateUser: (id: number, patch: { role?: "ADMIN" | "USER"; display_name?: string; email?: string }) =>
        request(`/users/${id}`, { method: "PUT", body: JSON.stringify(patch) }),

    changeUserPassword: (id: number, password: string) =>
        request(`/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),

    deleteUser: (id: number) =>
        request(`/users/${id}`, { method: "DELETE" }),
};
