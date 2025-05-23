import { Request, Response } from "express";
import { Allocation } from "../models/allocation";
import { generateContainerName } from "../utils/generate-container-name";
import { containerManager } from "../container-manager";
import { Instance } from "../models/instance";
import { containerPoolManager } from "../container-pool-manager";

export const getSocketPath = async (req: Request, res: Response) => {
  const { roomId } = req.body;
  if (!roomId || typeof roomId !== "string") {
    res.status(400).json({ error: "roomId is required" });
    return;
  }

  // Check if the roomId already exists
  const existingAllocation = await Allocation.findOne({ roomId });
  if (existingAllocation) {
    res.json({ socketPath: existingAllocation.path });
    return;
  }

  try {
    // Try to get an available container from the pool
    const availableInstance = await containerPoolManager.getAvailableContainer();

    if (!availableInstance) {
      // If no container is available, launch a new one
      const containerPath = generateContainerName();
      const ORIGINS = process.env.ORIGINS?.split(",") || [];

      const container = await containerManager.launchContainer("runner-prod", containerPath, {
        Env: [`SOCKET_PATH=${containerPath}`, `ORIGINS=${ORIGINS}`],
      });

      // Create an Instance document
      const instance = new Instance({
        containerId: container.id,
        path: containerPath,
        name: container.name,
        status: "allocated",
        metadata: {
          ports: {
            internal: container.ports.internal,
            external: container.ports.external,
          },
        },
      });

      await instance.save();

      // Create an allocation
      const allocation = new Allocation({
        roomId: roomId,
        path: containerPath,
        instanceId: container.id,
      });
      await allocation.save();

      // TOP UP THE POOL
      containerPoolManager.maintainContainerPool();

      res.status(201).json({ socketPath: containerPath });
      return;
    }

    // Create an allocation for the available container
    const allocation = new Allocation({
      roomId: roomId,
      path: availableInstance.path,
      instanceId: availableInstance.containerId,
    });
    await allocation.save();

    res.status(200).json({ socketPath: availableInstance.path });
  } catch (error) {
    console.error("Error allocating socket path:", error);
    res.status(500).json({ error: "Failed to allocate socket path" });
  }
};
