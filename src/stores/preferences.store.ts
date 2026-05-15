import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SelectedModel = {
    providerId: number;
    model: string;
}

export type TranslationMode = "manual" | "zh_en_auto";

export const AUTO_SOURCE_LANGUAGE = "auto";

type PrefereneceState = {
    selectedModel: SelectedModel | null;
    translationMode: TranslationMode;
    sourceLanguage: string;
    targetLanguage: string;
    selectedPromptId: number | null;
    sourceText: string;
    translatedText: string;

    setSelectedModel: (value: SelectedModel | null) => void;
    setTranslationMode: (mode: TranslationMode) => void;
    setSourceLanguage: (code: string) => void;
    setTargetLanguage: (code: string) => void;
    setSelectedPromptId: (id: number | null) => void;
    setSourceText: (value: string) => void;
    setTranslatedText: (value: string) => void;
}

export const usePreferences = create<PrefereneceState>()(
    persist(
        (set) => ({
            selectedModel: null,
            translationMode: "manual",
            sourceLanguage: AUTO_SOURCE_LANGUAGE,
            targetLanguage: "",
            selectedPromptId: null,
            sourceText: "",
            translatedText: "",

            setSelectedModel: (value) => set({ selectedModel: value }),
            setTranslationMode: (mode) => set({ translationMode: mode }),
            setSourceLanguage: (code) => set({ sourceLanguage: code }),
            setTargetLanguage: (code) => set({ targetLanguage: code }),
            setSelectedPromptId: (id) => set({ selectedPromptId: id }),
            setSourceText: (value) => set({ sourceText: value }),
            setTranslatedText: (value) => set({ translatedText: value }),
        }),
        {
            name: "poixe_translate_preferences", // localStorage key
            version: 2,
            migrate: (persistedState) => {
                const state = persistedState as Partial<PrefereneceState> | undefined;

                return {
                    ...state,
                    translationMode: state?.translationMode ?? "manual",
                    sourceLanguage: state?.sourceLanguage ?? AUTO_SOURCE_LANGUAGE,
                } as PrefereneceState;
            },
        }
    )
)