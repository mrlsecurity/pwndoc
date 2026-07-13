import { defineStore } from 'pinia'

// Run state for QA reports, keyed by target so it survives the panel/drawer being closed,
// remounted (language-tab switch), or the route changing. Keys look like:
//   audit:<auditId>            audit report QA
//   vuln:<vulnId>:<locale>     single stored-vulnerability QA
//   all:<locale>               run-all vulnerability QA for a locale
//   draft                      the unsaved vulnerability currently in the modal
//
// A run holds the raw report payload plus its lifecycle flags; consumers build their own
// view models from `report`. `scrollTop` persists the results panel's scroll position across
// remounts (route changes, tab switches) so re-rendering the same target doesn't reset it.
const emptyRun = () => ({
  running: false,
  loading: false,
  loaded: false,
  startedAt: null,
  scope: null,
  report: null,
  error: '',
  scrollTop: 0
})

const resolveError = (err, fallback) => {
  const datas = err?.response?.data?.datas
  if (typeof datas === 'string' && datas.trim())
    return datas

  const status = err?.response?.status
  if (status === 502 || status === 504 || err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || '')))
    return 'The QA request timed out. Partial results may already be saved — try running again.'

  return fallback || err?.message || ''
}

export const useQaRunsStore = defineStore('qaRuns', {
  state: () => ({
    runs: {}
  }),

  getters: {
    getRun: (state) => (key) => (key ? state.runs[key] || null : null),
    isRunning: (state) => (key) => Boolean(key && state.runs[key]?.running),
    isLoading: (state) => (key) => Boolean(key && state.runs[key]?.loading),
    startedAt: (state) => (key) => (key && state.runs[key]?.startedAt) || null,
    runScope: (state) => (key) => (key && state.runs[key]?.scope) || null,
    scrollTop: (state) => (key) => (key && state.runs[key]?.scrollTop) || 0
  },

  actions: {
    ensureRun(key) {
      if (!this.runs[key])
        this.runs[key] = emptyRun()
      return this.runs[key]
    },

    // Fetch a cached report. Never runs while a QA run is in flight (the run owns the state),
    // and never overwrites a run that starts while the fetch is outstanding.
    async load(key, loader, { errorFallback = '' } = {}) {
      const run = this.ensureRun(key)
      if (run.running)
        return

      run.loading = true
      run.error = ''
      try {
        const data = await loader()
        if (run.running)
          return
        run.report = data || {}
        run.loaded = true
      } catch (err) {
        if (!run.running)
          run.error = resolveError(err, errorFallback)
      } finally {
        run.loading = false
      }
    },

    // Start a QA run for a target. Ignored if that target already has a run in flight
    // (double-run guard). The report stays visible while running so panels can dim it.
    // Runner may call setReport() to push partial results before finishing.
    async start(key, runner, { errorFallback = '', scope = null } = {}) {
      const run = this.ensureRun(key)
      if (run.running)
        return

      run.running = true
      run.startedAt = Date.now()
      run.scope = scope || null
      run.error = ''
      // Drop finished progress so a new run doesn't show e.g. "394 of 394" from the previous pass.
      if (run.report?.progress)
        run.report = { ...run.report, progress: null }
      try {
        const result = await runner({
          setReport: (data) => {
            run.report = data || {}
            run.loaded = true
          }
        })
        if (result !== undefined)
          run.report = result || {}
        run.loaded = true
      } catch (err) {
        run.error = resolveError(err, errorFallback)
      } finally {
        run.running = false
        run.scope = null
        run.startedAt = null
      }
    },

    setScrollTop(key, value) {
      if (key)
        this.ensureRun(key).scrollTop = value
    },

    reset(key) {
      if (this.runs[key])
        this.runs[key] = emptyRun()
    }
  }
})
