import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import setRoutes from "./routes/routes";
import { setupCleanupJob } from "./jobs/cleanup-instance";
const app = express();
const ORIGINS = process.env.ORIGINS?.split(",") || [];
import { containerPoolManager } from "./container-pool-manager";

app.set("trust proxy", true);
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: ORIGINS,
  })
);

setRoutes(app);

// app.get("/test-launch", async (req, res) => {
//   const fakeName = generateContainerName();
//   const container = await containerManager.launchContainer("runner-prod", fakeName, {
//     Env: [`SOCKET_PATH=${fakeName}`, `ORIGINS=haka`],
//   });
//   console.log("Container launched:", container);

//   res.status(201).json(container);
// });

mongoose
  .connect(process.env.MONGO_URI!, {
    connectTimeoutMS: 60000,
    socketTimeoutMS: 60000,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    const PORT = process.env.PORT || 1337;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
    setupCleanupJob();
    (async () => {
      await containerPoolManager.maintainContainerPool();
    })();
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
