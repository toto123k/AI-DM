/**
 * DualPhase — Prompt Manager Badge Injector
 * Injects clickable phase badges (🧠P / ✍️W / 🔄B) into each Prompt Manager row.
 *
 * Uses a polling interval (like TunnelVision's WI condition injector) to detect
 * when the Prompt Manager UI is open and inject badges into `.completion_prompt_manager_prompt`
 * elements that have a `data-pm-identifier` attribute.
 */

import {
    isDualPhaseEnabled,
    getPhase,
    cyclePhase,
    PHASE_DISPLAY,
} from './phase-store.js';

let _injecting = false;
let _intervalId = null;

// ─── Badge Creation ──────────────────────────────────────────────

/**
 * Create a phase badge element for a prompt node.
 * @param {string} identifier - The PM node identifier
 * @returns {HTMLElement}
 */
function createBadge(identifier) {
    const badge = document.createElement('span');
    badge.className = 'dp-phase-badge';
    badge.dataset.dpIdentifier = identifier;
    updateBadgeDisplay(badge, identifier);

    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const newPhase = cyclePhase(identifier);
        updateBadgeDisplay(badge, identifier);
        console.log(`[DualPhase] "${identifier}" → ${newPhase}`);
    });

    return badge;
}

/**
 * Update a badge's visual to match the current phase.
 * @param {HTMLElement} badge
 * @param {string} identifier
 */
function updateBadgeDisplay(badge, identifier) {
    const phase = getPhase(identifier);
    const display = PHASE_DISPLAY[phase];
    badge.textContent = `${display.icon}${display.label}`;
    badge.title = `${display.title} — click to cycle`;
    badge.style.setProperty('--dp-badge-color', display.color);
    badge.dataset.dpPhase = phase;
}

// ─── DOM Injection ───────────────────────────────────────────────

/**
 * Scan the Prompt Manager for rows that need badges.
 * Injects a badge into each `.completion_prompt_manager_prompt` that doesn't already have one.
 */
function injectBadges() {
    if (!isDualPhaseEnabled()) return;

    const promptRows = document.querySelectorAll('.completion_prompt_manager_prompt[data-pm-identifier]');
    if (promptRows.length === 0) return;

    for (const row of promptRows) {
        // Skip if already injected
        if (row.querySelector('.dp-phase-badge')) continue;

        const identifier = row.getAttribute('data-pm-identifier');
        if (!identifier) continue;

        const badge = createBadge(identifier);

        // Find a good insertion point — before the existing control icons
        // ST's PM rows typically have a controls area on the right side
        const controls = row.querySelector('.prompt_manager_prompt_controls')
            || row.querySelector('.prompt-manager-prompt-controls');
        if (controls) {
            controls.insertBefore(badge, controls.firstChild);
        } else {
            // Fallback: append to the row itself
            row.appendChild(badge);
        }
    }
}

/**
 * Remove all injected badges from the DOM.
 */
function removeBadges() {
    document.querySelectorAll('.dp-phase-badge').forEach(el => el.remove());
}

/**
 * Refresh all badge displays (e.g., after a bulk phase reset).
 */
export function refreshBadges() {
    document.querySelectorAll('.dp-phase-badge').forEach(badge => {
        const id = badge.dataset.dpIdentifier;
        if (id) updateBadgeDisplay(badge, id);
    });
}

// ─── Polling Lifecycle ───────────────────────────────────────────

/**
 * Start the polling interval that injects badges when the PM is visible.
 */
export function startPhaseInjector() {
    if (_intervalId) return;
    _intervalId = setInterval(() => {
        if (_injecting) return;
        _injecting = true;
        try {
            injectBadges();
        } finally {
            _injecting = false;
        }
    }, 500);
    console.log('[DualPhase] Phase badge injector started');
}

/**
 * Stop the polling interval and remove all badges.
 */
export function stopPhaseInjector() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
    removeBadges();
    console.log('[DualPhase] Phase badge injector stopped');
}
