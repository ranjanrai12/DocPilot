import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

// Swappable object storage (CLAUDE.md: one client module so the provider can be
// changed). Raw uploaded files live here — never in Postgres.
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// --- Local filesystem driver (dev default) ----------------------------------
// Files are written under STORAGE_DIR, keyed by their storage key (which itself
// is workspace-prefixed). No external account needed.
class LocalStorage implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  private full(key: string): string {
    return path.join(this.baseDir, key);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const file = this.full(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.full(key), { force: true }); // `force` => no error if absent
  }
}

// --- S3 / Cloudflare R2 driver ----------------------------------------------
// Dynamically imports @aws-sdk/client-s3 so the dependency is only needed when
// STORAGE_DRIVER=s3. The specifier is a variable so the type-checker/bundler
// don't require the package to be installed for the local-only path.
class S3Storage implements StorageDriver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private clientPromise: Promise<{ mod: any; s3: any }> | null = null;

  private client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const spec = '@aws-sdk/client-s3';
        let mod: any;
        try {
          mod = await import(spec);
        } catch {
          throw new Error(
            'STORAGE_DRIVER=s3 requires @aws-sdk/client-s3 — run: pnpm --filter api add @aws-sdk/client-s3',
          );
        }
        const s3 = new mod.S3Client({
          region: env.STORAGE_REGION,
          endpoint: env.STORAGE_ENDPOINT,
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.STORAGE_ACCESS_KEY ?? '',
            secretAccessKey: env.STORAGE_SECRET_KEY ?? '',
          },
        });
        return { mod, s3 };
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const { mod, s3 } = await this.client();
    await s3.send(
      new mod.PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { mod, s3 } = await this.client();
    const res = await s3.send(new mod.GetObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    const { mod, s3 } = await this.client();
    await s3.send(new mod.DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  }
}

function createStorage(): StorageDriver {
  if (env.STORAGE_DRIVER === 's3') return new S3Storage();
  const baseDir = path.isAbsolute(env.STORAGE_DIR)
    ? env.STORAGE_DIR
    : path.resolve(process.cwd(), env.STORAGE_DIR);
  return new LocalStorage(baseDir);
}

export const storage: StorageDriver = createStorage();
