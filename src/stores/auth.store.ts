import { create } from "zustand";
import { api } from "@/lib/api";

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
    logout: () => Promise<void>;
    fetchCurrentUser: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
    user: null,
    isLoading: true,

    setUser: (user) => set({ user, isLoading: false }),

    logout: async () => {
        try {
            await api.logout();
        } catch {}
        set({ user: null });
        window.location.href = "/login";
    },

    fetchCurrentUser: async () => {
        set({ isLoading: true });
        try {
            const data = await api.getCurrentUser();
            set({ user: data.user, isLoading: false });
        } catch {
            set({ user: null, isLoading: false });
        }
    },
}));
