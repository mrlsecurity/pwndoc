exports.name = '20260812-ai-actions-to-global-prompts'

const crypto = require('crypto')
const {
    MAX_GLOBAL_PROMPTS,
    normalizeGlobalPrompts,
    validateGlobalPromptsPayload
} = require('../lib/ai-global-prompts')

// The fork's legacy AI feature stored its custom actions in an `aiactions` collection backed by
// an AIAction model. Upstream has no such model, so the collection is read through the raw driver.
const LEGACY_COLLECTION = 'aiactions'

// Obsolete settings paths from the fork's old AI schema. Upstream uses `ai.public.enabled` and
// per-provider fields under `ai.private`, so these leftovers are dropped unconditionally.
const OBSOLETE_SETTINGS_PATHS = ['ai.enabled', 'ai.private.provider']

async function getLegacyCollection() {
    const db = require('mongoose').connection.db
    if (!db)
        return null

    try {
        const collections = await db.listCollections({name: LEGACY_COLLECTION}).toArray()
        if (collections.length === 0)
            return null
    }
    catch (error) {
        console.log(`Migration ${exports.name}: unable to list collections (${error.message})`)
        return null
    }

    return db.collection(LEGACY_COLLECTION)
}

function buildPromptText(doc) {
    const systemPrompt = String(doc.systemPrompt || '').trim()
    const adminInstructions = String(doc.adminInstructions || '').trim()

    if (systemPrompt && adminInstructions)
        return `${systemPrompt}\n\n${adminInstructions}`

    return systemPrompt || adminInstructions
}

function toGlobalPrompt(doc) {
    return {
        id: crypto.randomUUID(),
        label: String(doc.name || '').trim(),
        prompt: buildPromptText(doc),
        enabled: doc.isEnabled !== false
    }
}

async function unsetObsoleteSettingsPaths() {
    const Settings = require('mongoose').model('Settings')
    const unset = OBSOLETE_SETTINGS_PATHS.reduce((acc, path) => {
        acc[path] = ''
        return acc
    }, {})

    // strict:false is required: the paths no longer exist in the schema, so a strict update
    // would silently discard them.
    await Settings.updateMany({}, {$unset: unset}, {strict: false})
}

exports.up = async function() {
    await unsetObsoleteSettingsPaths()

    const collection = await getLegacyCollection()
    if (!collection)
        return

    let legacyDocs = []
    try {
        legacyDocs = await collection.find({}).toArray()
    }
    catch (error) {
        console.log(`Migration ${exports.name}: unable to read ${LEGACY_COLLECTION} (${error.message})`)
        return
    }

    if (legacyDocs.length === 0) {
        await collection.drop().catch(() => {})
        return
    }

    const overrideCount = legacyDocs.filter(doc => doc.type === 'builtin_override').length
    if (overrideCount > 0)
        console.log(`Migration ${exports.name}: skipped ${overrideCount} builtin_override AI action(s), no equivalent in global prompts`)

    const converted = normalizeGlobalPrompts(
        legacyDocs
            .filter(doc => doc.type === 'custom')
            .map(doc => toGlobalPrompt(doc))
    )

    const Settings = require('mongoose').model('Settings')
    const settings = await Settings.findOne({})
    if (!settings) {
        console.log(`Migration ${exports.name}: no settings document found, skipping global prompt import`)
        return
    }

    const existing = normalizeGlobalPrompts(settings.ai?.public?.globalPrompts || [])
    const existingLabels = new Set(existing.map(entry => entry.label))

    // Never overwrite prompts an admin already configured: merge, de-duplicate by label,
    // and stop at the cap so the payload stays valid.
    const additions = converted.filter(entry => !existingLabels.has(entry.label))
    const availableSlots = Math.max(0, MAX_GLOBAL_PROMPTS - existing.length)
    const accepted = additions.slice(0, availableSlots)
    const skipped = additions.length - accepted.length

    if (skipped > 0)
        console.log(`Migration ${exports.name}: skipped ${skipped} AI action(s), global prompt cap of ${MAX_GLOBAL_PROMPTS} reached`)

    if (accepted.length > 0) {
        const merged = [...existing, ...accepted]
        const validation = validateGlobalPromptsPayload(merged)
        if (!validation.valid) {
            console.log(`Migration ${exports.name}: aborting import, ${validation.message}`)
            return
        }

        await Settings.updateOne({_id: settings._id}, {$set: {'ai.public.globalPrompts': merged}})
        console.log(`Migration ${exports.name}: imported ${accepted.length} AI action(s) as global prompts`)
    }

    await collection.drop().catch(() => {})
}
