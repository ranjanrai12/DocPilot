# 04 — Data Model

> New to databases? Read each table as a TypeScript interface: a **table** ≈ a type, a **row** ≈ an
> object of that type, a **relation** ≈ one type referencing another by id.

## 1. Entities & relationships

```
Workspace (1) ───< (many) User
Workspace (1) ───< (many) Document ───< (many) Chunk
Workspace (1) ───< (many) Conversation ───< (many) Message
Workspace (1) ───< (many) UsageEvent
```

- A **Workspace** is the tenant. Everything else belongs to exactly one workspace.
- A **Document** is one uploaded file; it is split into many **Chunks** (the searchable pieces).
- A **Conversation** is a chat thread; it has many **Messages** (user + assistant turns).
- **UsageEvent** records token/cost per request for tracking and rate limiting.

## 2. Tables

### Workspace
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | company/workspace name |
| createdAt | timestamp | |

### User
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| workspaceId | uuid (FK → Workspace) | tenant scope |
| email | text (unique) | login |
| passwordHash | text | bcrypt hash |
| role | enum(ADMIN, MEMBER) | authorization |
| createdAt | timestamp | |

### Document
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| workspaceId | uuid (FK) | tenant scope |
| filename | text | original name |
| storageKey | text | R2/S3 object key |
| mimeType | text | pdf / docx / txt |
| status | enum(PROCESSING, READY, FAILED) | ingestion state |
| error | text (nullable) | failure reason |
| createdAt | timestamp | |

### Chunk  *(vector table)*
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| documentId | uuid (FK → Document) | |
| workspaceId | uuid (FK) | tenant scope (denormalized for fast filtered search) |
| content | text | the chunk text |
| embedding | vector(1536) | pgvector column (dimension matches embeddings model) |
| metadata | jsonb | e.g. { page, headings } for citations |
| createdAt | timestamp | |

> `embedding` uses the **pgvector** type. We add an index (e.g. HNSW or IVFFlat) for fast
> similarity search and always filter by `workspaceId`.

### Conversation
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| workspaceId | uuid (FK) | tenant scope |
| userId | uuid (FK → User) | owner |
| title | text | auto-generated from first message |
| createdAt | timestamp | |

### Message
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| conversationId | uuid (FK → Conversation) | |
| role | enum(USER, ASSISTANT, TOOL) | |
| content | text | message text |
| citations | jsonb (nullable) | [{ documentId, filename, page }] |
| toolCall | jsonb (nullable) | tool name + args/result when role = TOOL |
| createdAt | timestamp | |

### UsageEvent
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| workspaceId | uuid (FK) | tenant scope |
| kind | enum(EMBEDDING, CHAT) | what was billed |
| tokensIn | int | |
| tokensOut | int | |
| costUsd | numeric | estimated cost |
| createdAt | timestamp | |

## 3. Prisma schema (draft)

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // pgvector enabled via migration; vector column added with raw SQL / preview features
}

enum Role { ADMIN MEMBER }
enum DocStatus { PROCESSING READY FAILED }
enum MsgRole { USER ASSISTANT TOOL }
enum UsageKind { EMBEDDING CHAT }

model Workspace {
  id            String         @id @default(uuid())
  name          String
  createdAt     DateTime       @default(now())
  users         User[]
  documents     Document[]
  conversations Conversation[]
  usageEvents   UsageEvent[]
}

model User {
  id           String   @id @default(uuid())
  workspaceId  String
  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  email        String   @unique
  passwordHash String
  role         Role     @default(MEMBER)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  conversations Conversation[]
  @@index([workspaceId])
}

model Document {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  filename    String
  storageKey  String
  mimeType    String
  status      DocStatus @default(PROCESSING)
  error       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  chunks      Chunk[]
  @@index([workspaceId])
}

// NOTE: the `embedding vector(1536)` column is added via a migration using pgvector,
// since Prisma models the rest of the row and we query the vector with raw SQL.
model Chunk {
  id          String   @id @default(uuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id])
  workspaceId String
  content     String
  metadata    Json?
  createdAt   DateTime @default(now())
  // embedding  Unsupported("vector(1536)")   // handled in migration
  @@index([workspaceId])
  @@index([documentId])
}

model Conversation {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  title       String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  messages    Message[]
  @@index([workspaceId])
  @@index([userId])
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           MsgRole
  content        String
  citations      Json?
  toolCall       Json?
  createdAt      DateTime     @default(now())
  @@index([conversationId])
}

model UsageEvent {
  id          String    @id @default(uuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  kind        UsageKind
  tokensIn    Int
  tokensOut   Int
  costUsd     Decimal   @db.Decimal(10, 6)
  createdAt   DateTime  @default(now())
  @@index([workspaceId, createdAt])
}
```

## 4. The vector search query (concept)

Filtered similarity search (always tenant-scoped), run as raw SQL:

```sql
SELECT id, content, metadata,
       1 - (embedding <=> $1) AS similarity   -- <=> is pgvector cosine distance
FROM "Chunk"
WHERE "workspaceId" = $2
ORDER BY embedding <=> $1                      -- nearest first
LIMIT 5;                                       -- top-K
```

`$1` = the question's embedding vector, `$2` = the current workspace. This returns the most relevant
chunks, which become the LLM's context.

## 5. Indexing & integrity notes
- Index `embedding` (HNSW/IVFFlat) for fast vector search; index `workspaceId` on scoped tables.
- Foreign keys enforce relationships; deletes cascade from Document → Chunk and Conversation → Message.
- `email` is globally unique in the MVP (simplifies auth); could become unique-per-workspace later.
