<template>
    <q-input
    ref="textareaField"
    label-slot
    stack-label
    v-model="dataString"
    type="textarea"
    outlined
    :rules="rules"
    lazy-rules="ondemand"
    :readonly="readonly"
    >
    <template v-slot:label>
        {{label}} <span v-if="rules && rules[0] !== ''" class="text-red">*</span>
    </template>
    </q-input>
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
        rules: Array
    },

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
                    const colonIndex = line.indexOf('||');
                    if (colonIndex > -1) {
                        const name = line.substring(0, colonIndex).trim();
                        const description = line.substring(colonIndex + 2).trim();
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
        }
    }
}

</script>

<style>
</style>