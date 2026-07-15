const { CUSTOM_FIELD_OUTPUT_TYPES, buildAiFieldCatalog, buildPromptMappings } = require('../src/lib/ai-prompts');

module.exports = function() {
    describe('AI prompts constants', () => {
        // Pinned to the literal mapping, not just re-imported, so a drift from the frontend's
        // independent copy in ai-field-helper.js is caught here (see the comment on
        // CUSTOM_FIELD_OUTPUT_TYPES in ai-prompts.js).
        it('CUSTOM_FIELD_OUTPUT_TYPES matches the frontend copy', () => {
            expect(CUSTOM_FIELD_OUTPUT_TYPES).toEqual({
                text: 'html',
                input: 'text',
                date: 'text',
                select: 'text',
                radio: 'text',
                'select-multiple': 'array',
                checkbox: 'array'
            });
        });
    });

    describe('buildPromptMappings', () => {
        const customFields = [
            { _id: 'cf1', label: 'Cloud Type', fieldType: 'input', display: 'vulnerability', displaySub: 'Cloud' },
            { _id: 'cf2', label: 'Attack Vector', fieldType: 'text', display: 'finding', displaySub: '' },
            { _id: 'cf3', label: 'Executive Overview', fieldType: 'text', display: 'section', displaySub: 'Executive Summary' }
        ];

        it('carries the custom field display/category so the UI can group prompts', () => {
            const mappings = buildPromptMappings(buildAiFieldCatalog(customFields), []);

            const cloudType = mappings.find((m) => m.fieldKey === 'custom-field:cf1');
            expect(cloudType.customFieldDisplay).toBe('vulnerability');
            expect(cloudType.customFieldDisplaySub).toBe('Cloud');

            const attackVector = mappings.find((m) => m.fieldKey === 'custom-field:cf2');
            expect(attackVector.customFieldDisplay).toBe('finding');
            expect(attackVector.customFieldDisplaySub).toBe('');

            const sectionField = mappings.find((m) => m.fieldKey === 'custom-field:cf3');
            expect(sectionField.entityType).toBe('section');
            expect(sectionField.customFieldDisplaySub).toBe('Executive Summary');

            const builtin = mappings.find((m) => m.fieldKey === 'description');
            expect(builtin.customFieldDisplay).toBeNull();
            expect(builtin.customFieldDisplaySub).toBeNull();
        });

        it('flags fields still using the default prompt', () => {
            const catalog = buildAiFieldCatalog(customFields);
            const mappings = buildPromptMappings(catalog, [
                { entityType: 'finding', fieldKey: 'description', prompt: 'Custom description prompt' },
                { entityType: 'finding', fieldKey: 'observation', prompt: '' },
                { entityType: 'finding', fieldKey: 'poc', prompt: catalog.find((f) => f.fieldKey === 'poc').defaultPrompt }
            ]);

            expect(mappings.find((m) => m.fieldKey === 'description').usingDefaultPrompt).toBe(false);
            expect(mappings.find((m) => m.fieldKey === 'description').prompt).toBe('Custom description prompt');
            expect(mappings.find((m) => m.fieldKey === 'observation').usingDefaultPrompt).toBe(true);
            expect(mappings.find((m) => m.fieldKey === 'poc').usingDefaultPrompt).toBe(true);
            expect(mappings.find((m) => m.fieldKey === 'remediation').usingDefaultPrompt).toBe(true);
        });
    });
};
