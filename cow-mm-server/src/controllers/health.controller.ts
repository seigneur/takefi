import { Request, Response, NextFunction } from "express";
import { HealthCheckResponseDto } from "../models";
import { CoWService } from "../services/cow.service";
import { SafeService } from "../services/safe.service";
import { config } from "../config/app.config";

export class HealthController {
  private cowService: CoWService;
  private safeService: SafeService;
  private startTime: Date;

  constructor() {
    this.cowService = new CoWService();
    this.safeService = new SafeService();
    this.startTime = new Date();
  }

  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Check server and service health
   *     description: |
   *       Performs comprehensive health checks on all critical services:
   *       - **CoW API**: Tests connectivity to CoW Protocol API
   *       - **Safe Wallet**: Verifies blockchain connectivity for Safe operations  
   *       - **Blockchain**: Checks RPC connectivity to the configured network
   *       
   *       Returns `healthy` only when all services are operational.
   *       Individual service status is provided for debugging.
   *     tags:
   *       - Monitoring
   *     responses:
   *       200:
   *         description: All services are healthy
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HealthResponse'
   *       503:
   *         description: One or more services are unhealthy
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HealthResponse'
   */
  async checkHealth(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("Performing health check...");

      // Check all services
      const [cowApiHealth, safeWalletHealth, blockchainHealth] =
        await Promise.allSettled([
          this.cowService.checkServiceHealth(),
          this.safeService.checkServiceHealth(),
          this.checkBlockchainHealth(),
        ]);

      const services = {
        cowApi:
          cowApiHealth.status === "fulfilled" && cowApiHealth.value
            ? "up"
            : "down",
        safeWallet:
          safeWalletHealth.status === "fulfilled" && safeWalletHealth.value
            ? "up"
            : "down",
        blockchain:
          blockchainHealth.status === "fulfilled" && blockchainHealth.value
            ? "up"
            : "down",
      } as const;

      // Determine overall status
      const allServicesUp = Object.values(services).every(
        (status) => status === "up"
      );
      const overallStatus = allServicesUp ? "healthy" : "unhealthy";

      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

      const response: HealthCheckResponseDto = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime,
        services,
      };

      // Set appropriate HTTP status code
      const statusCode = overallStatus === "healthy" ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      console.error("Health check failed:", error);

      const response: HealthCheckResponseDto = {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        services: {
          cowApi: "down",
          safeWallet: "down",
          blockchain: "down",
        },
      };

      res.status(503).json(response);
    }
  }

  private async checkBlockchainHealth(): Promise<boolean> {
    try {
      // Use the configured RPC URL for the current chain
      const rpcUrl = this.getRpcUrlForChain(config.cow.chainId);

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });

      const data = (await response.json()) as any;
      return !!data.result;
    } catch (error) {
      console.error("Blockchain health check failed:", error);
      return false;
    }
  }

  private getRpcUrlForChain(chainId: number): string {
    switch (chainId) {
      case 1:
        return process.env.ETHEREUM_RPC_URL || "https://cloudflare-eth.com";
      case 100:
        return process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com";
      case 11155111:
        return (
          process.env.SEPOLIA_RPC_URL ||
          "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
        );
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}
