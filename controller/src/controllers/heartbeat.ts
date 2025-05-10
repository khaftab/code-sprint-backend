import { Allocation } from "../models/allocation";
import { Request, Response } from "express";

export const heartbeat = async (req: Request, res: Response) => {
  const { roomId } = req.body;
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json({ error: "roomId is required" });
    return;
  }
  // Check if the roomId already exists
  const allocation = await Allocation.findOne({ roomId });
  if (!allocation) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  allocation.lastActivity = new Date();
  try {
    await allocation.save();
    res.status(200).json({ message: "Heartbeat received" });
    return;
  } catch (error) {
    console.error("Error updating last activity:", error);
  }
  res.status(500).json({ error: "Failed to update last activity" });
};
