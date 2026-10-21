import { MongoClient, type Db } from "mongodb";

export async function connectDatabase(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  await ensureIndexes(db);
  return { client, db };
}

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("meetings").createIndex({ publicId: 1 }, { unique: true });
  await db.collection("users").createIndex({ createdAt: 1 });
}
