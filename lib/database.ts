import mongoose from "mongoose";

const uri = process.env.DATABASE_URL!;

if (!uri) {
  throw new Error("DATABASE_URL is not configured.");
}

const DATABASE_NAME = "crestinegnlish";

declare global {
  var mongooseConnection:
    | {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
      }
    | undefined;
}

const cached =
  global.mongooseConnection ??
  (global.mongooseConnection = {
    conn: null,
    promise: null,
  });

export async function connectToDatabase() {
  if (cached.conn) return cached.conn;

  cached.promise ??= mongoose.connect(uri, {
    bufferCommands: false,
    dbName: DATABASE_NAME,
  });

  try {
    cached.conn = await cached.promise;

    if (process.env.NODE_ENV === "development") {
      console.info(
        `[MongoDB] Connected to database: ${mongoose.connection.name}`,
      );
    }

    return cached.conn;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
}