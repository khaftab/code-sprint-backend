import cron from "node-cron";
import { Allocation } from "../models/allocation";
import { Instance } from "../models/instance"; // Assuming you have an Instance model
import { containerManager } from "../container-manager";

// Cleanup job that runs every hour
export const setupCleanupJob = () => {
  cron.schedule("0 * * * *", async () => {
    // every hour
    try {
      console.log("Running instance cleanup job...");
      const cutoff = new Date(Date.now() - 45 * 60 * 1000); // 45-min inactivity
      // Find allocations with no activity in the last 30 minutes
      const inactiveAllocations = await Allocation.find({
        lastActivity: { $lt: cutoff },
      });

      console.log(`Found ${inactiveAllocations.length} inactive allocations`);

      for (const allocation of inactiveAllocations) {
        try {
          await containerManager.removeContainer(allocation.instanceId);
          console.log(`Container ${allocation.instanceId} removed`);
          // Delete the instance
          await Instance.findOneAndDelete({
            containerId: allocation.instanceId,
          });

          // Delete the allocation
          await Allocation.findByIdAndDelete(allocation._id);

          console.log(`Cleaned up inactive instance for room ${allocation.roomId}`);
        } catch (error) {
          console.error(`Error cleaning up room ${allocation.roomId}:`, error);
        }
      }
    } catch (error) {
      console.error("Instance cleanup job error:", error);
    }
  });

  console.log("Instance cleanup job scheduled");
};
