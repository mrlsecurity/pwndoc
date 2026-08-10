<template>
  <!-- Multiple allowed providers: a compact pill dropdown (logo + name + model). -->
  <q-btn-dropdown
  v-if="options.length > 1"
  flat
  dense
  no-caps
  :disable="disable"
  class="ai-provider-selector"
  content-class="ai-provider-selector__menu"
  >
    <template #label>
      <span class="ai-provider-selector__pill">
        <img
        v-if="activeOption.logo"
        :src="activeOption.logo"
        class="ai-provider-selector__logo"
        :class="{ 'ai-provider-selector__logo--mono': activeOption.mono }"
        alt=""
        />
        <span class="ai-provider-selector__name">{{ activeOption.label }}</span>
        <span v-if="activeModel" class="ai-provider-selector__model">{{ activeModel }}</span>
      </span>
    </template>
    <q-list dense>
      <q-item
      v-for="option in options"
      :key="option.value"
      v-close-popup
      clickable
      :active="option.value === effectiveValue"
      @click="$emit('update:modelValue', option.value)"
      >
        <q-item-section avatar class="ai-provider-selector__menu-avatar">
          <img v-if="option.logo" :src="option.logo" class="ai-provider-selector__logo" :class="{ 'ai-provider-selector__logo--mono': option.mono }" alt="" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ option.label }}</q-item-label>
          <q-item-label v-if="modelFor(option.value)" caption>{{ modelFor(option.value) }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
  </q-btn-dropdown>

  <!-- Single allowed provider: just display it (logo + name + model), no dropdown. -->
  <div v-else-if="options.length === 1" class="ai-provider-selector ai-provider-selector--static">
    <span class="ai-provider-selector__pill">
      <img
      v-if="activeOption.logo"
      :src="activeOption.logo"
      class="ai-provider-selector__logo"
      :class="{ 'ai-provider-selector__logo--mono': activeOption.mono }"
      alt=""
      />
      <span class="ai-provider-selector__name">{{ activeOption.label }}</span>
      <span v-if="activeModel" class="ai-provider-selector__model">{{ activeModel }}</span>
    </span>
  </div>
</template>

<script>
import { allowedProviderOptions, providerLogo, providerLabel, providerLogoIsMono } from '@/services/ai-providers'

// Compact provider picker for the chat drawer and QA panels. Options are the providers the
// admin permits (allowedProviders ∪ default, from public settings). Shows the provider logo,
// name and configured model. Falls back to a static (non-interactive) display when only one
// provider is available.
export default {
  name: 'AiProviderSelector',

  props: {
    modelValue: {
      type: String,
      default: ''
    },
    disable: {
      type: Boolean,
      default: false
    }
  },

  emits: ['update:modelValue'],

  computed: {
    options() {
      return allowedProviderOptions(this.$settings?.ai?.public)
    },

    // When the user hasn't picked a provider, show the org default so the field is never blank.
    effectiveValue() {
      if (this.modelValue && this.options.some((option) => option.value === this.modelValue))
        return this.modelValue
      return this.$settings?.ai?.public?.defaultProvider || this.options[0]?.value || ''
    },

    activeOption() {
      return this.options.find((option) => option.value === this.effectiveValue)
        || {
          label: providerLabel(this.effectiveValue),
          logo: providerLogo(this.effectiveValue),
          mono: providerLogoIsMono(this.effectiveValue)
        }
    },

    activeModel() {
      return this.modelFor(this.effectiveValue)
    }
  },

  methods: {
    modelFor(provider) {
      return this.$settings?.ai?.public?.providerModels?.[provider] || ''
    }
  }
}
</script>

<style scoped>
.ai-provider-selector {
  align-self: center;
}

.ai-provider-selector--static {
  cursor: default;
  display: inline-flex;
  align-items: center;
}

.ai-provider-selector__pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  font-size: 12px;
  line-height: 1.2;
}

.ai-provider-selector--static .ai-provider-selector__pill {
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 16px;
  padding: 3px 10px;
}

.body--dark .ai-provider-selector--static .ai-provider-selector__pill {
  border-color: rgba(255, 255, 255, 0.2);
}

.ai-provider-selector__logo {
  width: 16px;
  height: 16px;
  display: block;
  object-fit: contain;
  flex: 0 0 auto;
}

/* Monochrome (near-black) marks can't inherit theme color as an <img>, so invert them to
   near-white in dark mode. Brand-colored logos are unaffected. */
.body--dark .ai-provider-selector__logo--mono {
  filter: invert(1);
}

.ai-provider-selector__name {
  font-weight: 500;
}

.ai-provider-selector__model {
  color: var(--q-grey-6);
  opacity: 0.75;
}

.ai-provider-selector__menu-avatar {
  min-width: 28px;
  padding-right: 8px;
}

.ai-provider-selector__menu-avatar .ai-provider-selector__logo {
  width: 18px;
  height: 18px;
}
</style>
