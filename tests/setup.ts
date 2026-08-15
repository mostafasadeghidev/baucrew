import { vi } from 'vitest'

// `server-only` throws outside the Next.js server runtime; the tested modules
// are pure enough to run under Vitest once this import is a no-op.
vi.mock('server-only', () => ({}))
