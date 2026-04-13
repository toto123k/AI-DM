/**
 * DualPhase — Phase Assignment Store
 * Manages phase assignments (planning/writing/both) for preset prompt nodes.
 * Stores assignments in TunnelVision's extensionSettings under `dualphase`.
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { getSettings } from './tree-store.js';

// ─── Phase Constants ─────────────────────────────────────────────

/** Phase values for prompt node assignments. */
export const PHASE = Object.freeze({
    BOTH: 'both',
    PLANNING: 'planning',
    WRITING: 'writing',
});

/** Display config for each phase — used by UI badges. */
export const PHASE_DISPLAY = Object.freeze({
    [PHASE.BOTH]: { label: 'B', icon: '🔄', color: '#d97706', title: 'Both phases' },
    [PHASE.PLANNING]: { label: 'P', icon: '🧠', color: '#3b82f6', title: 'Planning phase only' },
    [PHASE.WRITING]: { label: 'W', icon: '✍️', color: '#22c55e', title: 'Writing phase only' },
});

/** Cycle order when clicking the badge. */
const PHASE_CYCLE = [PHASE.BOTH, PHASE.PLANNING, PHASE.WRITING];

/** Default settings for the DualPhase feature. */
const DUALPHASE_DEFAULTS = Object.freeze({
    enabled: false,
    phaseAssignments: {},
});

// ─── Settings Access ─────────────────────────────────────────────

/**
 * Get the dualphase settings object from TunnelVision's settings.
 * Creates defaults if missing.
 * @returns {Object} Mutable settings reference
 */
export function getDualPhaseSettings() {
    const tvSettings = getSettings();
    if (!tvSettings.dualphase) {
        tvSettings.dualphase = structuredClone(DUALPHASE_DEFAULTS);
    }
    const dp = tvSettings.dualphase;
    // Backfill missing defaults
    if (typeof dp.enabled !== 'boolean') dp.enabled = false;
    if (!dp.phaseAssignments || typeof dp.phaseAssignments !== 'object') {
        dp.phaseAssignments = {};
    }
    return dp;
}

/**
 * Check if DualPhase is globally enabled.
 * @returns {boolean}
 */
export function isDualPhaseEnabled() {
    return getDualPhaseSettings().enabled === true;
}

/**
 * Set the DualPhase enabled state.
 * @param {boolean} enabled
 */
export function setDualPhaseEnabled(enabled) {
    getDualPhaseSettings().enabled = enabled;
    saveSettingsDebounced();
}

// ─── Phase Assignment CRUD ───────────────────────────────────────

/**
 * Get the phase assignment for a specific prompt node.
 * @param {string} identifier - The PM node identifier (e.g. 'main', 'jailbreak', etc.)
 * @returns {string} 'both' | 'planning' | 'writing'
 */
export function getPhase(identifier) {
    const dp = getDualPhaseSettings();
    return dp.phaseAssignments[identifier] || PHASE.BOTH;
}

/**
 * Set the phase assignment for a specific prompt node.
 * @param {string} identifier
 * @param {string} phase - 'both' | 'planning' | 'writing'
 */
export function setPhase(identifier, phase) {
    const dp = getDualPhaseSettings();
    if (phase === PHASE.BOTH) {
        // Default = both, no need to store explicitly
        delete dp.phaseAssignments[identifier];
    } else {
        dp.phaseAssignments[identifier] = phase;
    }
    saveSettingsDebounced();
}

/**
 * Cycle to the next phase for a prompt node.
 * @param {string} identifier
 * @returns {string} The new phase value
 */
export function cyclePhase(identifier) {
    const current = getPhase(identifier);
    const idx = PHASE_CYCLE.indexOf(current);
    const next = PHASE_CYCLE[(idx + 1) % PHASE_CYCLE.length];
    setPhase(identifier, next);
    return next;
}

/**
 * Reset all phase assignments to 'both'.
 */
export function resetAllPhases() {
    const dp = getDualPhaseSettings();
    dp.phaseAssignments = {};
    saveSettingsDebounced();
}

/**
 * Check if a prompt node should be included in the given phase.
 * @param {string} identifier - The PM node identifier
 * @param {'planning' | 'writing'} currentPhase - Which phase we're building for
 * @returns {boolean}
 */
export function shouldIncludeInPhase(identifier, currentPhase) {
    const phase = getPhase(identifier);
    if (phase === PHASE.BOTH) return true;
    return phase === currentPhase;
}
