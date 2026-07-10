const { CUSTOM_FIELD_OUTPUT_TYPES } = require('../src/lib/ai-prompts');

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
};
