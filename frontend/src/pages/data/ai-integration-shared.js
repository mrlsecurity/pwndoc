// Helpers shared by the two AI-integration data pages (assisted writing and
// quality assurance). Both persist a "markdown instructions" block through the
// same /data/ai-integration endpoint - redaction guidelines on the writing page,
// QA instructions on the quality-assurance page - so the shape lives here to keep
// the two in sync.

export const defaultMarkdownInstructions = () => ({
    content: ''
});

export const serializeMarkdownInstructions = (guidelines = {}) => ({
    content: String(guidelines.content || '')
});
