import express from "express";
import { heartbeat } from "../controllers/heartbeat";

const router = express.Router();

router.post("/heartbeat", heartbeat);

export default router;
