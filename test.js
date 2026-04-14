const { normalizeUrl } = require('./server/routes')

test('normalizeUrl removes query params', () => {
  expect(normalizeUrl('https://example.com?a=1&b=2')).toBe('https://example.com')
})