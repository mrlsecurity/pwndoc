<template>
    <div
    class="textarea-array"
    :class="{
        'textarea-array--framed': framedHeader,
        'textarea-array--ai-active': framedHeader && (aiSessionActive || aiLoading)
    }"
    >
    <div v-if="framedHeader" class="textarea-array__header row items-center no-wrap q-px-sm q-py-xs">
        <div class="col text-caption text-grey-8">
            {{label}} <span v-if="rules && rules[0] !== ''" class="text-red">*</span>
        </div>
        <div class="row items-center no-wrap q-gutter-xs">
            <slot name="header-actions" />
            <q-btn v-if="showAiButton && !readonly" flat size="sm" dense
            class="ai-gradient-icon-btn"
            data-testid="textarea-array-ai-action"
            :aria-label="$t('aiChat.tooltip')"
            :loading="aiLoading"
            :disable="aiLoading || readonly || aiSessionActive"
            @click="$emit('ai-click')"
            >
                <q-tooltip :delay="500" class="text-bold">{{$t('aiChat.tooltip')}}</q-tooltip>
                <q-icon name="auto_awesome" />
            </q-btn>
        </div>
    </div>
    <q-separator v-if="framedHeader" />
    <div v-else-if="showAiButton && !readonly" class="bg-grey-4 row items-center justify-end q-px-sm q-py-xs">
        <q-btn flat size="sm" dense class="ai-gradient-icon-btn"
        data-testid="textarea-array-ai-action"
        :aria-label="$t('aiChat.tooltip')"
        :loading="aiLoading"
        :disable="aiLoading || readonly || aiSessionActive"
        @click="$emit('ai-click')"
        >
            <q-tooltip :delay="500" class="text-bold">{{$t('aiChat.tooltip')}}</q-tooltip>
            <q-icon name="auto_awesome" />
        </q-btn>
    </div>
    <q-input
    ref="textareaField"
    :label-slot="!framedHeader"
    :stack-label="!framedHeader"
    v-model="dataString"
    type="textarea"
    @update:model-value="updateParent"
    :outlined="!framedHeader"
    :borderless="framedHeader"
    :aria-label="label"
    :class="{'ai-field-active': !framedHeader && (aiSessionActive || aiLoading)}"
    :rules="rules"
    hide-bottom-space
    lazy-rules="ondemand"
    :readonly="readonly"
    >
    <template v-if="!framedHeader" v-slot:label>
        {{label}} <span v-if="rules && rules[0] !== ''" class="text-red">*</span>
    </template>
    </q-input>
    </div>
</template>

<script>

export default {
    name: 'textarea-array',
    props: {
        label: String,
        modelValue: Array,
        objectFields: {
            type: Object,
            default: null
        },
        noEmptyLine: {
            type: Boolean,
            default: false
        },
        readonly: {
            type: Boolean,
            default: false
        },
        rules: Array,
        showAiButton: {
            type: Boolean,
            default: false
        },
        aiLoading: {
            type: Boolean,
            default: false
        },
        aiSessionActive: {
            type: Boolean,
            default: false
        },
        framedHeader: {
            type: Boolean,
            default: false
        }
    },

    emits: ['update:modelValue', 'ai-click'],

    data: function() {
        return {
            dataString: "",
            hasError: false
        }
    },

    mounted: function() {
        if (this.modelValue)
            this.dataString = this.arrayToString(this.modelValue)
    },

    watch: {
        modelValue (val) {
            var str = (val)? this.arrayToString(val): ""
            if (str === this.dataString)
                return
            this.dataString = str
        }
    },

    methods: {
        arrayToString: function(arr) {
            if (this.objectFields) {
                return arr.map(item => {
                    const name = item[this.objectFields.name] || '';
                    const desc = item[this.objectFields.description];
                    return desc ? `${name} || ${desc}` : name;
                }).join('\n');
            } else {
                return arr.join('\n');
            }
        },

        stringToArray: function(str) {
            if (this.objectFields) {
                return str.split('\n').map(line => {
                    const separatorIndex = line.indexOf('||');
                    if (separatorIndex > -1) {
                        const name = line.substring(0, separatorIndex).trim();
                        const description = line.substring(separatorIndex + 2).trim();
                        return {[this.objectFields.name]: name, [this.objectFields.description]: description};
                    }
                    return {[this.objectFields.name]: line.trim(), [this.objectFields.description]: ''};
                });
            } else {
                return str.split('\n');
            }
        },

        updateParent: function() {
            var array = this.stringToArray(this.dataString);
            if (this.noEmptyLine)
                array = array.filter(e => {
                    if (this.objectFields)
                        return e[this.objectFields.name] !== '';
                    return e !== '';
                });
            this.$emit('update:modelValue', array);
        },

        validate: function() {
            this.$refs.textareaField.validate()
            this.hasError = this.$refs.textareaField.hasError
        },

        getTextSelection: function() {
            const el = this.$refs.textareaField?.$el?.querySelector('textarea')
            if (!el)
                return null

            const start = el.selectionStart
            const end = el.selectionEnd
            if (start === end)
                return null

            const text = el.value.substring(start, end)
            return {
                start,
                end,
                text,
                html: text
            }
        },

        replaceTextSelection: function(content, range) {
            if (!range)
                return

            const el = this.$refs.textareaField?.$el?.querySelector('textarea')
            if (!el)
                return

            const replacement = Array.isArray(content) ?
                content.join('\n') :
                String(content || '')
            const value = el.value
            this.dataString = value.substring(0, range.start) + replacement + value.substring(range.end)
            this.updateParent()
        }
    }
}

</script>
