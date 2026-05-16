import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type ModelProvider = {
    id: number;
    name: string;
    models: string[];
};

export function useModels() {
    const [providers, setProviders] = useState<ModelProvider[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.listModels().then(data => {
            setProviders(data.providers || []);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    return { providers, loading };
}
