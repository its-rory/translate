const BASE_URL = "/api";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw { message: `Request failed: ${res.status}`, status: res.status, body };
    }
    return res.json();
}

function createSSEStream(url: string, body: unknown): SSEStream {
    const controller = new AbortController();
    let deltaHandler: ((delta: string) => void) | null = null;
    let errorHandler: ((error: string) => void) | null = null;
    let completeHandler: (() => void) | null = null;

    (async () => {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                errorHandler?.(text || `HTTP ${res.status}`);
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
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6);
                        if (data === "[DONE]") continue;
                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.delta ?? parsed.content ?? parsed.text ?? "";
                            if (delta) deltaHandler?.(delta);
                        } catch {
                            if (data.trim()) deltaHandler?.(data);
                        }
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
        return createSSEStream(`${BASE_URL}/translate`, params);
    },

    listProviders: () =>
        request<{ providers: Array<{ id: number; name: string; base_url: string; api_key: string; api_style: string; models: string; created_at: number; updated_at: number }> }>("/providers"),

    createProvider: (input: { name: string; base_url: string; api_key: string; api_style: string; models: string }) =>
        request<{ id: number }>("/providers", { method: "POST", body: JSON.stringify(input) }),

    updateProvider: (id: number, patch: Record<string, unknown>) =>
        request<void>(`/providers/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

    deleteProvider: (id: number) =>
        request<void>(`/providers/${id}`, { method: "DELETE" }),

    listPrompts: () =>
        request<{ prompts: Array<{ id: number; name: string; content: string; is_system: boolean; created_at: number; updated_at: number }> }>("/prompts"),

    createPrompt: (input: { name: string; content: string }) =>
        request<{ id: number }>("/prompts", { method: "POST", body: JSON.stringify(input) }),

    updatePrompt: (id: number, patch: Record<string, unknown>) =>
        request<void>(`/prompts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

    deletePrompt: (id: number) =>
        request<void>(`/prompts/${id}`, { method: "DELETE" }),

    listModels: () =>
        request<{ providers: Array<{ id: number; name: string; models: string[] }> }>("/models"),

    getPreferences: () =>
        request<Record<string, unknown>>("/preferences"),

    updatePreferences: (data: Record<string, unknown>) =>
        request<void>("/preferences", { method: "PUT", body: JSON.stringify(data) }),

    getCurrentUser: () =>
        request<{ user: { id: number; username: string; role: "ADMIN" | "USER"; display_name: string; email: string; created_at: number } }>("/auth/me"),

    logout: () =>
        request<void>("/auth/logout", { method: "POST" }),

    listUsers: () =>
        request<{ users: Array<{ id: number; username: string; role: "ADMIN" | "USER"; display_name: string; email: string; created_at: number }> }>("/users"),

    createUser: (input: { username: string; password: string; role: "ADMIN" | "USER"; display_name: string; email: string }) =>
        request<{ id: number }>("/users", { method: "POST", body: JSON.stringify(input) }),

    updateUser: (id: number, patch: { role?: "ADMIN" | "USER"; display_name?: string; email?: string }) =>
        request<void>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

    changeUserPassword: (id: number, password: string) =>
        request<void>(`/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),

    deleteUser: (id: number) =>
        request<void>(`/users/${id}`, { method: "DELETE" }),
};
