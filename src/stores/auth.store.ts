import { create } from "zustand";

import { api } from "@/lib/api";
import { clearAuthTokens, hasStoredAuthTokens } from "@/lib/auth-session";

export type UserRole = "ADMIN" | "USER";

export type User = {
    id: number;
    username: string;
    role: UserRole;
    display_name: string;
    email: string;
    created_at: number;
};

type AuthState = {
    user: User | null;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    fetchCurrentUser: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
    user: null,
    isLoading: true,

    setUser: (user) => set({ user, isLoading: false }),

    login: async (username, password) => {
        set({ isLoading: true });
        try {
            await api.login({ username, password });
            const data = await api.getCurrentUser();
            set({ user: data.user, isLoading: false });
        } catch (error) {
            clearAuthTokens();
            set({ user: null, isLoading: false });
            throw error;
        }
    },

    logout: async () => {
        try {
            await api.logout();
        } catch {}

        clearAuthTokens();
        set({ user: null, isLoading: false });
        window.location.href = "/login";
    },

    fetchCurrentUser: async () => {
        set({ isLoading: true });

        if (!hasStoredAuthTokens()) {
            set({ user: null, isLoading: false });
            return;
        }

        try {
            const data = await api.getCurrentUser();
            set({ user: data.user, isLoading: false });
        } catch {
            clearAuthTokens();
            set({ user: null, isLoading: false });
        }
    },
}));
