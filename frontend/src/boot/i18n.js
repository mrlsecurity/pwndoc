import { defineBoot } from '#q-app/wrappers'
import { createI18n } from 'vue-i18n'
import messages from '@/i18n'

let language = localStorage.getItem("system_language");
  if (!language) {
      language = "en-US";
      localStorage.setItem("system_language", language);
  }

  const i18n = createI18n({
    legacy: false, // Use Composition API
    globalInjection: true, // Enable global $t in templates
    locale: language,
    fallbackLocale: 'en-US',
    messages
  })

export default defineBoot(({ app }) => {
  app.use(i18n)

  // Quasar's dev entry hardcodes app.config.performance = true, which makes Vue
  // scan the whole User-Timing buffer on every render. vue-i18n emits 3 uncleared
  // performance.measure entries per $t() call and never clears them, so the buffer
  // grows unbounded over a session and renders get progressively slower. Disable
  // it in dev; production builds never set the flag in the first place.
  if (process.env.DEV)
    app.config.performance = false
})

export const $t = (...args) => i18n.global.t(...args)