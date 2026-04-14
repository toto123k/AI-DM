/**
 * DualPhase — Prompt Message Filter
 * Hooks into CHAT_COMPLETION_SETTINGS_READY to filter prompt messages
 * based on the current generation phase (planning vs writing).
 *
 * On Pass 1 (planning, isRecursiveToolPass=false):
 *   Keep messages from nodes tagged 🧠Planning or 🔄Both
 *   Remove messages from nodes tagged ✍️Writing only
 *
 * On Pass 2+ (writing, isRecursiveToolPass=true):
 *   Keep messages from nodes tagged ✍️Writing or 🔄Both
 *   Remove messages from nodes tagged 🧠Planning only
 */

import { isDualPhaseEnabled, getPhase, PHASE } from './phase-store.js';

// ─── Phase Detection ─────────────────────────────────────────────

/**
 * Detect the current generation phase.
 * Uses the global flag set by TunnelVision's index.js.
 * @returns {'planning' | 'writing'}
 */
export function getCurrentPhase() {
    return window.TunnelVision_isRecursiveToolPass ? 'writing' : 'planning';
}

// ─── Message Filtering ──────────────────────────────────────────

/**
 * Filter the outgoing API messages based on the current phase.
 * Called from CHAT_COMPLETION_SETTINGS_READY event handler.
 *
 * ST's Chat Completion messages have an `identifier` field on system/injection
 * messages that maps to the PM node identifier. We use this to match against
 * phase assignments.
 *
 * Messages without identifiers (chat history, tool results, etc.) are always kept.
 *
 * @param {Object} data - The chat completion settings/request object
 */
export function filterMessagesByPhase(data) {
    if (!isDualPhaseEnabled()) return;
    if (!data?.messages || !Array.isArray(data.messages)) return;

    const phase = getCurrentPhase();
    let removed = 0;
    let kept = 0;

    // Walk the messages and remove any whose identifier maps to the wrong phase
    for (let i = data.messages.length - 1; i >= 0; i--) {
        const msg = data.messages[i];

        // Only filter messages that have a prompt manager identifier
        // Chat messages, tool results, etc. don't have identifiers and should always pass
        const identifier = msg.identifier || msg.name;
        if (!identifier) continue;

        const nodePhase = getPhase(identifier);

        // 'both' always passes
        if (nodePhase === PHASE.BOTH) {
            kept++;
            continue;
        }

        // Check if this node belongs in the current phase
        if (nodePhase !== phase) {
            data.messages.splice(i, 1);
            removed++;
            console.debug(`[DualPhase] ${phase} pass: removed "${identifier}" (tagged ${nodePhase})`);
        } else {
            kept++;
        }
    }

    if (removed > 0) {
        console.log(`[DualPhase] ${phase} pass: kept ${kept} identified messages, removed ${removed}`);
    }

    // ── Phase-specific tool & prompt handling ─────────────────────────
    if (phase === 'planning') {
        // PLANNING PHASE: TV tools stay available so the model can search lorebooks.
        // Inject a system prompt telling the model to reason/plan + make tool calls.
        data.messages.push({
            role: 'system',
            content: "You are in the PLANNING phase. Your job is to reason about what the character should do, search relevant lorebook entries using your available tools, and outline the key beats of your response. Do NOT write the final prose yet — only plan and search. Your tool calls will trigger the writing phase automatically."
        });
        console.log(`[DualPhase] Planning pass: ${Array.isArray(data.tools) ? data.tools.length : 0} tools available`);

    } else if (phase === 'writing') {
        // WRITING PHASE: Strip ALL tools so the model MUST write prose.
        // This is the key mechanism — no tools = no tool calls = pure narrative output.
        if (data.tools) {
            console.log(`[DualPhase] Writing pass: stripping ${data.tools.length} tools to force narrative output`);
            delete data.tools;
        }
        if (data.tool_choice) {
            delete data.tool_choice;
        }

        data.messages.push({
            role: 'system',
            content: "You are in the WRITING phase. The planning and lorebook search is complete — the results are in your context above. Now write the final in-character response using all available information. Follow all writing guidelines, persona rules, and character voice. Do not output any planning, reasoning, or tool calls."
        });
    }
}
