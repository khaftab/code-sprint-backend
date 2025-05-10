import express from "express";
import { getSocketPath } from "../controllers/container";

const router = express.Router();

router.post("/get-socket-path", getSocketPath);

export default router;
