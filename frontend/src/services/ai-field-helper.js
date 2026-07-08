import Utils from '@/services/utils'
import { useAiGenerationStore } from '@/stores/ai-generation'
import { $t } from '@/boot/i18n'

const FINDING_FIELD_OUTPUT_TYPES = {
  description: 'html',
  observation: 'html',
  remediation: 'html',
  poc: 'html',
  references: 'array'
}

const CUSTOM_FIELD_OUTPUT_TYPES = {
  text: 'html',
  input: 'text',
  date: 'text',
  select: 'text',
  radio: 'text',
  'select-multiple': 'array',
  checkbox: 'array'
}

const getFieldLabel = (field, customField, fieldKey) => {
  if (customField?.customField?.label)
    return customField.customField.label

  return {
    description: 'Description',
    observation: 'Observation',
    remediation: 'Remediation',
    references: 'References',
    poc: 'Proofs'
  }[field] || fieldKey
}

const getOutputType = (field, customField) => {
  if (customField)
    return CUSTOM_FIELD_OUTPUT_TYPES[customField?.customField?.fieldType] || 'text'

  return FINDING_FIELD_OUTPUT_TYPES[field] || 'html'
}

const normalizeContextValue = (value) => {
  if (value === null || value === undefined)
    return ''
  if (Array.isArray(value))
    return value.join(', ')
  if (typeof value === 'object')
    return JSON.stringify(value)
  return String(value)
}

const renderPromptTemplate = (template = '', context = {}) => {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return normalizeContextValue(context[key])
  }).trim()
}

const getDefaultPrompt = (fieldPrompts = [], fieldKey, context = {}) => {
  const mapping = (fieldPrompts || []).find((entry) => {
    return String(entry.fieldKey || '') === String(fieldKey)
  })
  return renderPromptTemplate(mapping?.prompt || '', context)
}

const normalizeDraftForApply = (draft, outputType) => {
  if (outputType === 'array') {
    const entries = Array.isArray(draft) ?
      draft :
      String(draft || '').split('\n')

    return entries
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  }

  const text = String(draft || '').trim()
  if (outputType === 'html')
    return Utils.htmlEncode(text)

  return text
}

const getInputSelection = (inputRef) => {
  const el = inputRef?.$el?.querySelector('textarea, input')
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
}

const CUSTOM_FIELD_PREFIX = 'custom-field:'

const cloneData = (data) => JSON.parse(JSON.stringify(data))

const parseFieldKey = (fieldKey) => {
  const key = String(fieldKey || '')
  if (key.startsWith(CUSTOM_FIELD_PREFIX)) {
    return {
      kind: 'custom',
      customFieldId: key.slice(CUSTOM_FIELD_PREFIX.length)
    }
  }

  return { kind: 'standard', field: key }
}

const findCustomField = (container, customFieldId) => {
  const fields = container?.customFields
  if (!Array.isArray(fields))
    return null

  return fields.find((entry) => {
    const id = entry?.customField?._id || entry?.customField
    return String(id) === String(customFieldId)
  })
}

const getFieldContainer = (entity, entityShape, locale) => {
  if (entityShape === 'vulnerability') {
    const details = entity?.details
    if (!Array.isArray(details))
      return null
    return details.find((detail) => detail.locale === locale) || details[0]
  }

  if (entityShape === 'finding' || entityShape === 'section')
    return entity

  return entity
}

const getFieldValue = (entity, entityShape, fieldKey, locale) => {
  const container = getFieldContainer(entity, entityShape, locale)
  if (!container)
    return undefined

  const parsed = parseFieldKey(fieldKey)
  if (parsed.kind === 'custom')
    return findCustomField(container, parsed.customFieldId)?.text

  return container[parsed.field]
}

const getContextFieldValue = (context, fieldKey) => {
  const parsed = parseFieldKey(fieldKey)
  if (parsed.kind === 'custom')
    return context?.customFieldValue || ''

  return context?.[parsed.field] || ''
}

const withCurrentFieldContext = (context, fieldKey, fieldLabel) => ({
  ...(context || {}),
  currentFieldKey: fieldKey,
  currentFieldLabel: fieldLabel || fieldKey,
  currentFieldValue: getContextFieldValue(context || {}, fieldKey)
})

const setFieldValue = (entity, entityShape, fieldKey, locale, value) => {
  const result = cloneData(entity)
  const container = getFieldContainer(result, entityShape, locale)
  if (!container)
    return result

  const parsed = parseFieldKey(fieldKey)
  if (parsed.kind === 'custom') {
    const customField = findCustomField(container, parsed.customFieldId)
    if (customField)
      customField.text = value
  } else {
    container[parsed.field] = value
  }

  return result
}

const applySelectionToValue = (value, selection, replacement, outputType) => {
  const repl = Array.isArray(replacement) ?
    replacement.join('\n') :
    String(replacement || '')

  if (outputType === 'array') {
    const text = Array.isArray(value) ? value.join('\n') : String(value || '')
    const next = text.substring(0, selection.start) + repl + text.substring(selection.end)
    return next
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  const text = String(value || '')
  return text.substring(0, selection.start) + repl + text.substring(selection.end)
}

const createDiffContext = ({
  getDiffEntity,
  entityShape,
  fieldKey,
  locale,
  outputType,
  mode,
  selection = null,
  languages = []
}) => ({
  current: cloneData(getDiffEntity()),
  entityShape,
  fieldKey,
  locale,
  outputType,
  mode,
  selection: selection ? { ...selection } : null,
  languages: languages || []
})

const replaceInputSelection = (inputRef, selection, content) => {
  const el = inputRef?.$el?.querySelector('textarea, input')
  if (!el || !selection)
    return

  const replacement = Array.isArray(content) ?
    content.join('\n') :
    String(content || '')
  const value = el.value
  const nextValue = value.substring(0, selection.start) + replacement + value.substring(selection.end)

  const inputComponent = inputRef
  if (inputComponent)
    inputComponent.$emit('update:modelValue', nextValue)
}

export default {
  getOutputType,
  getFieldLabel,
  getDefaultPrompt,
  getInputSelection,
  replaceInputSelection,

  validateDraft(draft, outputType) {
    if (outputType === 'array') {
      const entries = Array.isArray(draft) ?
        draft :
        String(draft || '').split('\n')

      const normalized = entries
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)

      if (normalized.length === 0)
        throw new Error($t('aiChat.emptyDraft'))

      return normalized
    }

    const text = String(draft || '').trim()
    if (!text)
      throw new Error($t('aiChat.emptyDraft'))

    return text
  },

  buildAiDiffDraft(diffContext, draft) {
    if (!diffContext?.current)
      return null

    const {
      current,
      entityShape,
      fieldKey,
      locale,
      outputType,
      mode,
      selection
    } = diffContext
    const normalized = normalizeDraftForApply(draft, outputType)

    if (mode === 'selection' && selection) {
      const currentValue = getFieldValue(current, entityShape, fieldKey, locale)
      const nextValue = applySelectionToValue(currentValue, selection, normalized, outputType)
      return setFieldValue(current, entityShape, fieldKey, locale, nextValue)
    }

    return setFieldValue(current, entityShape, fieldKey, locale, normalized)
  },

  async runFieldAiChat({
    title,
    defaultPrompt,
    outputType,
    requestParams,
    fieldLabel = null,
    lockKey = null,
    onCancel,
    getDiffEntity = null,
    entityShape = null,
    languages = []
  }) {
    const diffContext = (typeof getDiffEntity === 'function' && entityShape) ?
      createDiffContext({
        getDiffEntity,
        entityShape,
        fieldKey: requestParams.field,
        locale: requestParams.locale,
        outputType,
        mode: 'field',
        languages
      }) :
      null

    try {
      const scopedRequestParams = {
        ...requestParams,
        context: withCurrentFieldContext(
          requestParams?.context || {},
          requestParams?.field,
          fieldLabel || title
        )
      }

      return await useAiGenerationStore().openSession({
        title,
        defaultPrompt,
        outputType,
        requestParams: scopedRequestParams,
        lockKey,
        diffContext
      })
    } catch (err) {
      if (err?.message === 'cancelled') {
        if (typeof onCancel === 'function')
          onCancel()
        return null
      }
      throw err
    }
  },

  applyFieldDraft({
    draft,
    outputType,
    setValue
  }) {
    setValue(normalizeDraftForApply(draft, outputType))
  },

  async runSelectionAiChat({
    title,
    selectedText,
    outputType,
    requestParams,
    lockKey = null,
    onCancel,
    selection = null,
    getDiffEntity = null,
    entityShape = null,
    languages = []
  }) {
    const diffContext = (typeof getDiffEntity === 'function' && entityShape && selection) ?
      createDiffContext({
        getDiffEntity,
        entityShape,
        fieldKey: requestParams.field,
        locale: requestParams.locale,
        outputType,
        mode: 'selection',
        selection,
        languages
      }) :
      null

    try {
      return await useAiGenerationStore().openSession({
        title,
        selectedText,
        outputType,
        requestParams,
        lockKey,
        diffContext
      })
    } catch (err) {
      if (err?.message === 'cancelled') {
        if (typeof onCancel === 'function')
          onCancel()
        return null
      }
      throw err
    }
  },

  applySelectionDraft({
    selectionTarget,
    selection,
    draft,
    outputType
  }) {
    const normalizedDraft = normalizeDraftForApply(draft, outputType)

    if (selectionTarget?.applyReplacement) {
      selectionTarget.applyReplacement(selection, normalizedDraft, outputType)
      return
    }

    if (selectionTarget?.replaceTextSelection) {
      selectionTarget.replaceTextSelection(normalizedDraft, selection)
      return
    }

    if (selectionTarget?.editor?.replaceTextSelection) {
      selectionTarget.editor.replaceTextSelection(normalizedDraft, selection)
    }
  },

  buildFindingAiContext(finding, customField) {
    const customFieldContext = {}
    if (finding.customFields && finding.customFields.length > 0) {
      finding.customFields.forEach((entry) => {
        if (entry?.customField?.label)
          customFieldContext[entry.customField.label] = entry.text
      })
    }

    return {
      title: finding.title || '',
      vulnType: finding.vulnType || '',
      observation: finding.observation || '',
      description: finding.description || '',
      remediation: finding.remediation || '',
      references: finding.references || [],
      poc: finding.poc || '',
      scope: finding.scope || '',
      customFieldLabel: customField?.customField?.label || '',
      customFieldValue: customField?.text || '',
      customFields: customFieldContext
    }
  },

  buildSectionAiContext(section, customField) {
    const customFieldContext = {}
    if (section.customFields && section.customFields.length > 0) {
      section.customFields.forEach((entry) => {
        if (entry?.customField?.label)
          customFieldContext[entry.customField.label] = entry.text
      })
    }

    return {
      sectionField: section.field || '',
      sectionName: section.name || '',
      sectionText: section.text || '',
      customFieldLabel: customField?.customField?.label || '',
      customFieldValue: customField?.text || '',
      customFields: customFieldContext
    }
  },

  buildVulnerabilityAiContext(vulnerability, detail, customField) {
    const customFieldContext = {}
    if (detail?.customFields && detail.customFields.length > 0) {
      detail.customFields.forEach((entry) => {
        if (entry?.customField?.label)
          customFieldContext[entry.customField.label] = entry.text
      })
    }

    return {
      title: detail?.title || '',
      vulnType: detail?.vulnType || '',
      category: vulnerability?.category || '',
      observation: detail?.observation || '',
      description: detail?.description || '',
      remediation: detail?.remediation || '',
      references: detail?.references || [],
      customFieldLabel: customField?.customField?.label || '',
      customFieldValue: customField?.text || '',
      customFields: customFieldContext
    }
  },

  appliedMessage() {
    return $t('aiChat.applied')
  },

  appliedFieldMessage() {
    return $t('aiChat.appliedField')
  }
}
