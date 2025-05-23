import { Document, Schema, model } from "mongoose";

export interface Allocation extends Document {
  roomId: string;
  path: string;
  instanceId: string;
  allocatedAt?: Date;
  lastActivity?: Date;
}

const allocationSchema = new Schema<Allocation>({
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  instanceId: {
    type: String,
    ref: "Instance",
    required: true,
  },
  path: {
    type: String,
    required: true,
    unique: true,
  },
  allocatedAt: {
    type: Date,
    default: Date.now,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
  },
});
export const Allocation = model<Allocation>("Allocation", allocationSchema);
