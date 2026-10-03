/**
 * Timing for the recipe editor's autosave: a debounce with a max-wait ceiling
 * (same idea as lodash's `debounce(fn, wait, { maxWait })`).
 *
 * A pure debounce postpones the save on every edit, so a user editing with
 * gaps shorter than the debounce never gets saved until they pause — and if
 * they close the tab first, nothing was persisted. The ceiling guarantees a
 * save at most `maxWaitMs` after the first unsaved edit.
 *
 * Kept free of React so it can be tested with mocked timers; RecipeBuilder
 * owns one instance per mount.
 */

export interface AutosaveTiming {
  /** Fire this long after the most recent edit… */
  debounceMs: number
  /** …but never later than this long after the first unsaved edit. */
  maxWaitMs: number
  /** Floor for the delay once the ceiling is reached, so a burst coalesces. */
  minDelayMs: number
}

export const DEFAULT_AUTOSAVE_TIMING: AutosaveTiming = {
  debounceMs: 3000,
  maxWaitMs: 15_000,
  minDelayMs: 200,
}

export interface AutosaveScheduler {
  /** An edit happened — (re)schedule the autosave. */
  markDirty(): void
  /**
   * A save completed. `stillDirty` = the user edited again while it was in
   * flight; the max-wait window then restarts from now instead of closing.
   */
  markSaved(stillDirty: boolean): void
  /** Drop the pending timer without firing (the unsaved window stays open). */
  cancel(): void
}

export function createAutosaveScheduler(
  onFire: () => void,
  timing: AutosaveTiming = DEFAULT_AUTOSAVE_TIMING
): AutosaveScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstDirtyAt: number | null = null

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    markDirty() {
      const now = Date.now()
      if (firstDirtyAt === null) firstDirtyAt = now
      const fireAt = Math.min(now + timing.debounceMs, firstDirtyAt + timing.maxWaitMs)
      cancel()
      timer = setTimeout(() => {
        timer = null
        onFire()
      }, Math.max(timing.minDelayMs, fireAt - now))
    },
    markSaved(stillDirty) {
      firstDirtyAt = stillDirty ? Date.now() : null
    },
    cancel,
  }
}
