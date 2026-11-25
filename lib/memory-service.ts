// lib/memory-service.ts
// High-level memory orchestration: retrieve long-term memories for prompt injection.

import type { MemoryConfig, MemoryEntry } from "./memory-types";
import { loadMemoryEntriesByType } from "./memory-storage";
import { resolveAuxiliaryApiConfig } from "./settings-storage";
import { generateEmbedding, resolveEmbeddingModel, cosineSimilarity } from "./memory-embedding";
import { estimateTokens } from "./token-counter";

/**
 * Retrieve relevant long-term memories for prompt injection.
 * Strategy:
 *   1. Total tokens <= longTermTokenBudget → return all
 *   2. Otherwise: reserve ~35% budget for most recent long-term memories
 *      + fill remaining budget with vector retrieval (hybrid score + threshold)
 *   3. Fallback to newest-first if no embedding available
 * Embedding API is resolved from auxiliary binding (global, not per-character).
 */
export async function retrieveMemoriesForPrompt(
    characterId: string,
    currentContext: string,
    config: MemoryConfig
): Promise<MemoryEntry[]> {
    const longTermEntries = await loadMemoryEntriesByType(characterId, "long_term");
    if (longTermEntries.length === 0 || !currentContext.trim()) return [];

    const budget = config.longTermTokenBudget;
    const recentReserveRatio = 0.35;
    const recentBudget = Math.floor(budget * recentReserveRatio);
    const retrieveBudget = budget - recentBudget;

    // Always take most recent long-term memories first
    const byTime = [...longTermEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const recentOnes = fillByBudget(byTime, recentBudget);
    const recentIds = new Set(recentOnes.map(e => e.id));

    let retrieved: MemoryEntry[] = [];

    // Vector retrieval for the remaining budget
    const embeddingApiConfig = config.vectorRecallEnabled
        ? resolveAuxiliaryApiConfig("embeddingApiConfigId")
        : null;

    if (embeddingApiConfig && resolveEmbeddingModel(embeddingApiConfig)) {
        const queryEmbedding = await generateEmbedding(currentContext, embeddingApiConfig);
        if (queryEmbedding) {
            const candidates = longTermEntries.filter(
                m => m.embedding && m.embedding.length > 0 && !recentIds.has(m.id)
            );

            if (candidates.length > 0) {
                const scored = candidates.map(entry => {
                    const sim = cosineSimilarity(queryEmbedding, entry.embedding!);
                    const ageHours = (Date.now() - new Date(entry.createdAt).getTime()) / 36e5;
                    const recencyBoost = Math.max(0, 1 - ageHours / (24 * 30)); // gentle decay over ~30 days
                    const finalScore = sim * 0.85 + recencyBoost * 0.15;
                    return { entry, score: finalScore, sim };
                });

                const filtered = scored
                    .filter(s => s.sim > 0.25)
                    .sort((a, b) => b.score - a.score);

                retrieved = fillByBudget(filtered.map(s => s.entry), retrieveBudget);
            }
        }
    }

    // Merge: recent first, then retrieved
    const merged = [...recentOnes, ...retrieved];

    // If still under budget, fill with more recent ones
    const used = merged.reduce((sum, e) => sum + estimateTokens(e.content) + 4, 0);
    if (used < budget) {
        const more = fillByBudget(
            byTime.filter(e => !merged.some(m => m.id === e.id)),
            budget - used
        );
        merged.push(...more);
    }

    return merged;
}

export async function retrieveCoreMemoriesForPrompt(
    characterId: string,
    config: MemoryConfig,
): Promise<MemoryEntry[]> {
    const coreEntries = await loadMemoryEntriesByType(characterId, "core");
    if (coreEntries.length === 0) return [];

    const sorted = [...coreEntries].sort((a, b) => {
        const aActive = a.metadata?.active ? 1 : 0;
        const bActive = b.metadata?.active ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        const aDate = String(a.metadata?.eventDate ?? a.updatedAt ?? a.createdAt);
        const bDate = String(b.metadata?.eventDate ?? b.updatedAt ?? b.createdAt);
        return bDate.localeCompare(aDate);
    });

    return fillByBudget(sorted, config.coreMemoryTokenBudget);
}

/** Pick entries in order until token budget is exhausted. */
function fillByBudget(entries: MemoryEntry[], budget: number): MemoryEntry[] {
    const result: MemoryEntry[] = [];
    let used = 0;
    for (const entry of entries) {
        const tokens = estimateTokens(entry.content) + 4;
        if (used + tokens > budget) break;
        result.push(entry);
        used += tokens;
    }
    return result;
}
