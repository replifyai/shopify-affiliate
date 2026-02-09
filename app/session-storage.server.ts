import type { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { PrismaClient } from "@prisma/client";

export class ReadyPrismaSessionStorage {
  private storagePromise: Promise<PrismaSessionStorage<PrismaClient>> | null =
    null;

  constructor(
    private readonly bootstrapReady: Promise<void>,
    private readonly prisma: PrismaClient,
  ) {}

  private async getStorage() {
    if (!this.storagePromise) {
      this.storagePromise = (async () => {
        await this.bootstrapReady;
        return new PrismaSessionStorage(this.prisma, {
          connectionRetries: 10,
          connectionRetryIntervalMs: 1000,
        });
      })();
    }

    return this.storagePromise;
  }

  async storeSession(session: Session): Promise<boolean> {
    return (await this.getStorage()).storeSession(session);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    return (await this.getStorage()).loadSession(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    return (await this.getStorage()).deleteSession(id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    return (await this.getStorage()).deleteSessions(ids);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    return (await this.getStorage()).findSessionsByShop(shop);
  }

  async isReady(): Promise<boolean> {
    try {
      return (await this.getStorage()).isReady();
    } catch (error) {
      console.error("Session storage bootstrap failed:", error);
      return false;
    }
  }
}
