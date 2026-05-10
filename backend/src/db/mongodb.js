import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectDB() {
  try {
    await mongoose.connect(env.databaseUrl);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

// Helper to simulate transactions for now (MongoDB needs replica set for transactions)
export async function withTransaction(fn) {
  const isReplicaSet = mongoose.connection.client.topology && mongoose.connection.client.topology.type === 'ReplicaSetWithPrimary';
  
  if (!isReplicaSet) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
  } catch (err) {
    session.endSession();
    return fn(null);
  }

  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export const db = mongoose.connection;
