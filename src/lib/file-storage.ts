import 'server-only'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import path from 'path'

/**
 * Where uploaded project files live on disk. Local dev: ./storage (gitignored).
 * Docker: a volume mounted at /app/storage. Override with FILE_STORAGE_DIR.
 */
function storageDir(): string {
  return process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage')
}

/** Resolves a storage key to an absolute path — and refuses to leave the dir. */
function resolveKey(key: string): string {
  const base = storageDir()
  const abs = path.resolve(base, key)
  if (!abs.startsWith(path.resolve(base) + path.sep)) {
    throw new Error('invalid storage key')
  }
  return abs
}

export async function saveStoredFile(key: string, data: Buffer): Promise<void> {
  const abs = resolveKey(key)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, data)
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key))
}

export async function deleteStoredFile(key: string): Promise<void> {
  // A missing file must never block deleting the database row.
  await unlink(resolveKey(key)).catch(() => {})
}
