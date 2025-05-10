import { EventEmitter } from "events";
import Dockerode, { ContainerCreateOptions } from "dockerode";
import * as fs from "fs/promises";
import { execSync } from "child_process";
import { Instance } from "./models/instance";

interface ContainerData {
  id: string;
  name: string;
  path: string;
  ports: { internal: number; external: string };
  status: string;
  createdAt: Date;
}

class ContainerManager extends EventEmitter {
  private docker: Dockerode;
  private containers: Map<string, ContainerData>;
  private nginxReloadDebounceTimeout: NodeJS.Timeout | null = null;
  private pendingReloadPromise: Promise<void> | null = null;
  private pendingReloadResolve: (() => void) | null = null;

  constructor() {
    super();
    this.docker = new Dockerode();
    this.containers = new Map();
  }

  /**
   * Launch a container and register it with a path
   */
  async launchContainer(
    imageName: string,
    path: string,
    options: Partial<ContainerCreateOptions> = {}
  ): Promise<ContainerData> {
    // Generate a unique container name based on the path
    const safePath = path.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const containerName = `container-${safePath}-${Date.now().toString().slice(-6)}`;

    try {
      console.log(`Launching container from image: ${imageName} with path: ${path}`);

      // Default container configuration
      const containerConfig: ContainerCreateOptions = {
        Image: imageName,
        name: containerName,
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: false,
        StdinOnce: false,
        ExposedPorts: {
          "5000/tcp": {}, // Default exposed port
        },
        HostConfig: {
          PortBindings: {
            "5000/tcp": [{ HostPort: "0" }], // Assign random port on host
          },
          RestartPolicy: {
            Name: "on-failure",
            MaximumRetryCount: 3,
          },
          ...options.HostConfig,
        },
        Env: options.Env || [],
      };

      // Create and start the container
      const container = await this.docker.createContainer(containerConfig);
      await container.start();

      // Get container info including networking details
      const containerInfo = await container.inspect();
      const hostPort = containerInfo.NetworkSettings.Ports["5000/tcp"][0].HostPort;

      // Create container data object
      const containerData: ContainerData = {
        id: containerInfo.Id,
        name: containerName,
        path,
        ports: {
          internal: 5000,
          external: hostPort,
        },
        status: containerInfo.State.Status,
        createdAt: new Date(),
      };

      // Store container info
      this.containers.set(containerInfo.Id, containerData);

      await this.updateNginxConfig(containerInfo.Id);

      // Trigger nginx config update and wait for it
      await this.scheduleNginxReload();

      // Add a small delay to ensure Nginx is fully ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emit event for tracking
      this.emit("container-launched", containerData);

      return containerData;
    } catch (error) {
      console.error("Error launching container:", error);
      throw error;
    }
  }

  /**
   * Remove a container by ID and update Nginx
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      const containerData = await Instance.findOne({ containerId });

      if (!containerData) {
        throw new Error(`Container ${containerId} not found`);
      }

      const container = this.docker.getContainer(containerId);

      // Check if container is running
      try {
        const info = await container.inspect();
        if (info.State.Running) {
          console.log(`Stopping container: ${containerData.name} (${containerId})`);
          await container.stop();
        }

        console.log(`Removing container: ${containerData.name} (${containerId})`);
        await container.remove();
      } catch (error) {
        throw new Error(`Error stopping/removing container: ${containerId}. Details: ${error}`);
      }

      // Remove the nginx configuration file for this container
      try {
        const configPath = `/etc/nginx/conf.d/${containerData.path}.conf`;
        console.log(`Removing nginx config file: ${configPath}`);
        await fs.unlink(configPath);
      } catch (err) {
        console.error(`Error removing nginx config file: ${err}`);
      }

      // Remove from our registry
      this.containers.delete(containerId);

      // Reload Nginx to apply changes and wait for it
      await this.scheduleNginxReload();

      // Emit event
      this.emit("container-removed", containerData);

      console.log(`Container ${containerData.name} removed successfully!`);
    } catch (error) {
      console.error("Error removing container:", error);
      throw error;
    }
  }

  generateConfig(path: string, port: string): string {
    return `
    location /${path} {
        proxy_pass http://host.docker.internal:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    `;
  }

  /**
   * Debounced Nginx reload to prevent too many reloads
   * Now returns a promise that resolves when nginx has reloaded
   */
  private scheduleNginxReload(): Promise<void> {
    // If we already have a pending reload, return that promise
    if (this.pendingReloadPromise) {
      return this.pendingReloadPromise;
    }

    // Create a new promise for this reload
    this.pendingReloadPromise = new Promise<void>((resolve) => {
      this.pendingReloadResolve = resolve;

      if (this.nginxReloadDebounceTimeout) {
        clearTimeout(this.nginxReloadDebounceTimeout);
      }

      this.nginxReloadDebounceTimeout = setTimeout(async () => {
        await this.reloadNginx();
        this.nginxReloadDebounceTimeout = null;

        // Clear the pending promise state
        this.pendingReloadPromise = null;
        this.pendingReloadResolve = null;
      }, 1000);
    });

    return this.pendingReloadPromise;
  }

  /**
   * Update Nginx configuration and reload
   */
  private async reloadNginx(): Promise<void> {
    try {
      // Reload Nginx
      execSync("nginx -s reload");
      console.log("Nginx configuration reloaded");

      // Emit event that nginx has been reloaded
      this.emit("nginx-reloaded");

      // Resolve the pending promise if it exists
      if (this.pendingReloadResolve) {
        this.pendingReloadResolve();
      }
    } catch (error) {
      console.error("Failed to reload Nginx:", error);
    }
  }

  /**
   * Update Nginx configuration for a specific container
   */
  private async updateNginxConfig(containerId: string): Promise<void> {
    try {
      const containerInfo = this.containers.get(containerId);
      if (!containerInfo) {
        throw new Error(`Container ${containerId} not found`);
      }

      const config = this.generateConfig(containerInfo.path, containerInfo.ports.external);

      // Write the config to a file
      await fs.writeFile(`/etc/nginx/conf.d/${containerInfo.path}.conf`, config);

      console.log(`Nginx configuration updated for container ${containerInfo.name}`);
    } catch (error) {
      console.error("Failed to update Nginx config:", error);
    }
  }

  /**
   * Get all registered containers
   */
  getAllContainers(): ContainerData[] {
    return Array.from(this.containers.values());
  }

  /**
   * Get container by ID
   */
  getContainer(id: string): ContainerData | undefined {
    return this.containers.get(id);
  }

  /**
   * Get container by path
   */
  getContainerByPath(path: string): ContainerData | undefined {
    for (const container of this.containers.values()) {
      if (container.path === path) {
        return container;
      }
    }
    return undefined;
  }
}

export const containerManager = new ContainerManager();
