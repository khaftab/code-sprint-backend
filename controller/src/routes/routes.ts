import { heartbeat } from "../controllers/heartbeat";
import container from "./container";
import { Express } from "express";

const routes = [
  {
    path: "/api",
    handler: container,
  },
  {
    path: "/api",
    handler: heartbeat,
  },
];

const setRoutes = (app: Express) => {
  routes.forEach((route) => {
    if (route.path === "/") {
      app.get(route.path, route.handler);
    } else {
      app.use(route.path, route.handler);
    }
  });
};

export default setRoutes;
