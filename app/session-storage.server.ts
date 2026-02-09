import type { Session } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import type { PrismaClient } from "@prisma/client";

export class ReadyPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  constructor(
    private readonly bootstrapReady: Promise<void>,
    prisma: PrismaClient,
  ) {
    super(prisma);
  }

  async storeSession(session: Session): Promise<boolean> {
    await this.bootstrapReady;
    return super.storeSession(session);
  }

  async loadSession(id: string): Promise<Session | undefined> {
    await this.bootstrapReady;
    return super.loadSession(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.bootstrapReady;
    return super.deleteSession(id);
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await this.bootstrapReady;
    return super.deleteSessions(ids);
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    await this.bootstrapReady;
    return super.findSessionsByShop(shop);
  }
}
