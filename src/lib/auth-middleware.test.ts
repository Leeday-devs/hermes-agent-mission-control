import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

test('production route protection uses the Auth.js session wrapper', async () => {
  const middleware = await readFile(path.join(process.cwd(), 'src/middleware.ts'), 'utf8')

  assert.match(middleware, /import\s*\{\s*auth\s*\}\s*from\s*['"]@\/lib\/auth['"]/)
  assert.match(middleware, /export\s+default\s+auth\(/)
  assert.doesNotMatch(middleware, /getToken\(/)
})
