import { containerManager } from "./container-manager";
import { Instance } from "./models/instance";
import { Allocation } from "./models/allocation";
import { generateContainerName } from "./utils/generate-container-name";

class ContainerPoolManager {
  private poolSize: number;

  constructor(poolSize = 2) {
    this.poolSize = poolSize;
  }

  /**
   * Ensures the container pool is maintained
   */
  async maintainContainerPool() {
    console.log("Maintain container pool");

    try {
      // Count available instances
      const availableInstancesCount = await Instance.countDocuments({ status: "available" });

      // Calculate how many containers we need to launch
      const containerDeficit = this.poolSize - availableInstancesCount;

      if (containerDeficit > 0) {
        console.log(`Launching ${containerDeficit} new containers to maintain pool`);

        // Launch containers in parallel
        const launchPromises = Array(containerDeficit)
          .fill(null)
          .map(async () => {
            const containerPath = generateContainerName();
            const ORIGINS = process.env.ORIGINS?.split(",") || [];

            try {
              const container = await containerManager.launchContainer(
                "runner-prod",
                containerPath,
                {
                  Env: [`SOCKET_PATH=${containerPath}`, `ORIGINS=${ORIGINS}`],
                }
              );

              // Create an Instance document
              const instance = new Instance({
                containerId: container.id,
                path: containerPath,
                name: container.name,
                status: "available",
                metadata: {
                  ports: {
                    internal: container.ports.internal,
                    external: container.ports.external,
                  },
                },
              });

              await instance.save();
              console.log(`Launched and saved container: ${containerPath}`);
            } catch (error) {
              console.error(`Failed to launch container in pool: ${error}`);
            }
          });

        await Promise.all(launchPromises);
      }
    } catch (error) {
      console.error("Error maintaining container pool:", error);
    }
  }

  /**
   * Get an available container and mark it as allocated
   */
  async getAvailableContainer(): Promise<Instance | null> {
    try {
      // Find the first available instance
      const availableInstance = await Instance.findOne({ status: "available" }).sort({
        createdAt: 1,
      });

      if (availableInstance) {
        // Mark the instance as allocated
        availableInstance.status = "allocated";
        await availableInstance.save();

        // Trigger pool maintenance in the background
        this.maintainContainerPool();

        return availableInstance;
      }

      return null;
    } catch (error) {
      console.error("Error getting available container:", error);
      return null;
    }
  }
}

// Singleton export
export const containerPoolManager = new ContainerPoolManager(
  process.env.CONTAINER_POOL_SIZE ? parseInt(process.env.CONTAINER_POOL_SIZE) : 2
);
