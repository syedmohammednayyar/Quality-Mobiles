import mongoose from "mongoose";
import { HttpError } from "./httpError.js";

export function assertObjectId(value, code = "INVALID_ID") {
  const id = String(value || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new HttpError(400, "Invalid identifier", code);
  }
  return id;
}

export function toObjectId(value, code = "INVALID_ID") {
  return new mongoose.Types.ObjectId(assertObjectId(value, code));
}

export function optionalObjectId(value, code = "INVALID_ID") {
  if (value === undefined || value === null || value === "") return null;
  return toObjectId(value, code);
}
