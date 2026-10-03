// Regression guard for a data-loss bug: the recipe editor's autosave was a
// pure 3s debounce, so editing with gaps under 3s postponed the save forever
// and nothing was persisted until the user paused. The scheduler adds a
// max-wait ceiling on top of the debounce. These tests drive the real
// scheduler RecipeBuilder uses, with node:test's mocked setTimeout/Date.
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createAutosaveScheduler } from '../src/lib/recipes/autosaveScheduler'

function setup() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const fires: number[] = []
  const scheduler = createAutosaveScheduler(() => fires.push(Date.now()))
  return { scheduler, fires }
}

// mock.timers.tick(n) runs a timer that came due mid-tick with Date.now()
// already at the END of the tick, so step 1ms at a time to record exact fire times.
function advance(ms: number) {
  for (let i = 0; i < ms; i++) mock.timers.tick(1)
}

test('a single edit autosaves after the 3s debounce', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  scheduler.markDirty()
  mock.timers.tick(2999)
  assert.deepEqual(fires, [])
  mock.timers.tick(1)
  assert.deepEqual(fires, [3000])
})

test('edits closer together than 3s still autosave within the 15s max wait', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  // An edit every 2s for 30s — the debounce alone would never fire.
  for (let ms = 0; ms <= 30_000 && fires.length === 0; ms += 2000) {
    scheduler.markDirty()
    advance(2000)
  }
  assert.ok(fires.length >= 1, 'autosave never fired during continuous editing')
  assert.ok(fires[0] <= 15_000, `first autosave at ${fires[0]}ms, expected <= 15000ms`)
})

test('max wait counts from the first unsaved edit, not the latest one', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  // Edits at 0, 2, 4 … 14s. Each pushes the 3s debounce out (to 17s after the
  // last one), but the ceiling is 15s after the FIRST edit.
  for (let ms = 0; ms <= 14_000; ms += 2000) {
    mock.timers.setTime(ms)
    scheduler.markDirty()
  }
  mock.timers.tick(999)            // t=14999
  assert.deepEqual(fires, [])
  mock.timers.tick(1)              // t=15000
  assert.deepEqual(fires, [15_000])
})

test('a completed save restarts the max-wait window', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  const editEvery2sUntilFire = () => {
    for (let i = 0; i < 30 && fires.length === 0; i++) {
      scheduler.markDirty()
      advance(2000)
    }
  }
  editEvery2sUntilFire()
  assert.deepEqual(fires, [15_000])
  scheduler.markSaved(false)       // save finished, nothing newer pending
  fires.length = 0
  const savedAt = Date.now()
  editEvery2sUntilFire()
  // Without the reset, the very first edit after the save would already be
  // past the old window and fire ~200ms later.
  assert.equal(fires[0] - savedAt, 15_000, `fired ${fires[0] - savedAt}ms after the save; window did not restart`)
})

test('if newer edits were pending when a save completed, the window restarts from that save', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  scheduler.markDirty()
  mock.timers.tick(3000)           // fires at 3000
  assert.deepEqual(fires, [3000])
  mock.timers.tick(1000)           // t=4000: save completes but user edited meanwhile
  scheduler.markSaved(true)
  // Continuous edits from here: the ceiling is 15s after the save (t=19000),
  // not ~200ms (stale window) and not 15s after the next edit.
  for (let i = 0; i < 30 && fires.length === 1; i++) {
    advance(500)
    scheduler.markDirty()
    advance(1500)
  }
  assert.deepEqual(fires, [3000, 19_000])
})

test('cancel() drops the pending timer without firing', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  scheduler.markDirty()
  scheduler.cancel()
  mock.timers.tick(60_000)
  assert.deepEqual(fires, [])
})

test('past the max wait, an edit schedules an (almost) immediate save', (t) => {
  t.after(() => mock.timers.reset())
  const { scheduler, fires } = setup()
  scheduler.markDirty()            // window opens at 0
  scheduler.cancel()               // e.g. paused (AI import) — window stays open
  mock.timers.setTime(20_000)
  scheduler.markDirty()
  mock.timers.tick(199)
  assert.deepEqual(fires, [])
  mock.timers.tick(1)
  assert.deepEqual(fires, [20_200])
})
