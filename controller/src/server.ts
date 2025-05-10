import express from "express";
import mongoose from "mongoose";
import { containerManager } from "./container-manager";
import { generateContainerName } from "./utils/generate-container-name";
import cors from "cors";
import setRoutes from "./routes/routes";
import { setupCleanupJob } from "./jobs/cleanup-instance";
const app = express();
const ORIGINS = process.env.ORIGINS?.split(",") || [];
console.log(ORIGINS, "yoo");

app.set("trust proxy", true);
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: ORIGINS,
  })
);

setRoutes(app);

app.get("/manoj", async (req, res) => {
  const fakeName = generateContainerName();
  const container = await containerManager.launchContainer("runner-prod", fakeName, {
    Env: [`SOCKET_PATH=${fakeName}`, `ORIGINS=haka`],
  });
  console.log("Container launched:", container);

  res.status(201).json(container);
});

app.get("/delete", async (req, res) => {
  const containerId = "30c2bbac7f09c748219d4fa9d1a877460c20b0fed16c285b49e5d38aad2d4256";
  try {
    await containerManager.removeContainer(containerId);
    res.status(200).json({ message: "Container removed successfully" });
  } catch (error) {
    console.error("Error removing container:", error);
    res.status(500).json({ error: "Failed to remove container" });
  }
});
console.log("mnog uro", process.env.MONGO_URI);

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => {
    console.log("Connected to MongoDB");
    const PORT = process.env.PORT || 1337;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
    setupCleanupJob();
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
  });
