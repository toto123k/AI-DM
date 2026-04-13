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

    // Inject phase-specific guiding instructions
    if (phase === 'planning') {
        data.messages.push({
            role: 'system',
            content: "You are currently in the PLANNING PHASE. You MUST output a detailed text outline and reasoning for your response BEFORE making any tool calls. Always begin your output with an explicit reasoning block. DO NOT write the actual character dialogue or prose yet. Focus entirely on the plan.\n\nCRITICAL MUST DO: When your plan is perfectly compiled, you MUST call the `DualPhase_SubmitPlan` tool. This is mandatory to advance the workflow."
        });
    } else if (phase === 'writing') {
        data.messages.push({
            role: 'system',
            content: "You are currently in the WRITING PHASE. Using the plan and tool results from the previous phase, write the final character response. Ensure you follow all writing guidelines and persona rules. Do not include your raw planning steps in the final output."
        });
    }
}
