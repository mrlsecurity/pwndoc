<template>
  <div
  class="ai-chat-prompt-results"
  :class="{ 'ai-chat-prompt-results--fill': fillAvailable }"
  >
    <template v-if="sections.length">
      <div v-for="section in sections" :key="section.id" class="ai-chat-prompt-section">
        <q-card
        v-if="section.id === 'default'"
        flat
        bordered
        class="ai-chat-default-prompt"
        >
          <q-item
          clickable
          v-close-popup="closeOnSelect"
          class="q-pa-sm"
          @click="$emit('select', section.options[0].id)"
          >
            <q-item-section avatar>
              <q-avatar rounded class="ai-chat-default-prompt__icon">
                <q-icon name="bolt" size="22px" />
              </q-avatar>
            </q-item-section>
            <q-item-section>
              <q-item-label class="ai-chat-default-prompt__title text-weight-medium">
                {{ section.label }}
              </q-item-label>
              <q-item-label caption>{{ defaultHint }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-card>
        <template v-else>
          <div v-if="section.label" class="ai-chat-prompt-section__label row items-center no-wrap text-caption text-grey-7 text-weight-medium">
            <q-icon v-if="section.icon" :name="section.icon" size="16px" class="q-mr-xs" />
            <span>{{ section.label }}</span>
          </div>
          <q-list dense bordered separator class="ai-chat-prompt-list">
          <q-item
          v-for="option in section.options"
          :key="option.id"
          clickable
          :active="selectedPromptId === option.id"
          active-class="ai-chat-prompt-item--active"
          v-close-popup="closeOnSelect"
          class="ai-chat-prompt-item"
          @click="$emit('select', option.id)"
          >
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ option.label }}</q-item-label>
            </q-item-section>
          </q-item>
          </q-list>
        </template>
      </div>
    </template>
    <div v-else class="text-caption text-grey-6 text-center q-pa-md">
      {{ noResultsLabel }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'AiPromptList',

  props: {
    sections: {
      type: Array,
      default: () => []
    },
    selectedPromptId: {
      type: String,
      default: null
    },
    noResultsLabel: {
      type: String,
      required: true
    },
    defaultHint: {
      type: String,
      required: true
    },
    fillAvailable: Boolean,
    closeOnSelect: Boolean
  },

  emits: ['select']
}
</script>

<style>
.ai-chat-prompt-results {
  max-height: min(46vh, 440px);
  overflow-y: auto;
  padding: 8px;
}

.ai-chat-prompt-results--fill {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}

.ai-chat-default-prompt {
  border-color: #e5e0f8;
  border-radius: 9px;
  background: #faf9ff;
}

.ai-chat-default-prompt__icon {
  color: #7c4dff;
  background: #f0ebff;
}

.ai-chat-default-prompt__title {
  color: #6f45e8;
}

.ai-chat-prompt-list {
  overflow: hidden;
  border-color: #e5e5ef;
  border-radius: 8px;
  background: #fff;
}

.ai-chat-prompt-item {
  min-height: 38px;
  border-radius: 0;
}

.body--dark .ai-chat-default-prompt,
.body--dark .ai-chat-prompt-list {
  border-color: #484765;
  background: #29283b;
}

.body--dark .ai-chat-default-prompt__icon {
  color: #d8ccff;
  background: #3b3855;
}

.body--dark .ai-chat-default-prompt__title {
  color: #cbbcff;
}
</style>
