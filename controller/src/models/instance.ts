import mongoose from "mongoose";

export interface Instance extends Document {
  containerId: string;
  path: string;
  name: string;
  status: "available" | "allocated";
  metadata: {
    ports: {
      internal?: number;
      external?: string;
    };
  };
  createdAt: Date;
}

const instanceSchema = new mongoose.Schema<Instance>({
  containerId: {
    type: String,
    required: true,
    unique: true,
  },
  path: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["available", "allocated"],
    default: "available",
  },
  metadata: {
    ports: {
      internal: String,
      external: String,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Instance = mongoose.model<Instance>("Instance", instanceSchema);
