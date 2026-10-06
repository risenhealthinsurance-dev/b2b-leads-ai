function validateSearchPrompt(prompt) {
  if (!String(prompt || '').trim()) {
    return { valid: false, error: 'Search prompt is required.' };
  }

  return { valid: true, error: '' };
}

module.exports = { validateSearchPrompt };
