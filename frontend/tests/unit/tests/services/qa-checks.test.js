import { describe, expect, it } from 'vitest'
import {
    hasAnyQaCheckEnabled,
    hasAnyProgrammaticQaCheckEnabled,
    hasAnyAiQaCheckEnabled
} from '@/services/qa-checks'

describe('qa-checks service', () => {
    it('returns true when at least one check is enabled', () => {
        expect(hasAnyQaCheckEnabled({ completeness: false, references: true })).toBe(true)
    })

    it('returns false when every check is disabled', () => {
        expect(hasAnyQaCheckEnabled({
            completeness: false,
            references: false,
            imageCaptions: false,
            duplicates: false,
            aiDuplicates: false,
            aiUnlinkedTranslations: false,
            redaction: false,
            customer: false,
            instructions: false
        })).toBe(false)
    })

    it('treats missing keys as enabled', () => {
        expect(hasAnyQaCheckEnabled({})).toBe(true)
    })

    it('detects when all built-in checks are disabled', () => {
        expect(hasAnyProgrammaticQaCheckEnabled({
            completeness: false,
            references: false,
            imageCaptions: false,
            duplicates: false,
            redaction: true
        })).toBe(false)
        expect(hasAnyAiQaCheckEnabled({
            completeness: false,
            references: false,
            imageCaptions: false,
            duplicates: false,
            redaction: true
        })).toBe(true)
    })
})
