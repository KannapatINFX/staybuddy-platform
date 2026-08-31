import type { OnModuleDestroy } from "@nestjs/common";
import { Global, Inject, Module } from "@nestjs/common";
import { createDatabasePool, type DatabasePool } from "@staybuddy/db";

export const DATABASE_POOL = Symbol("DATABASE_POOL");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => createDatabasePool(),
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}
  async onModuleDestroy() {
    await this.pool.end();
  }
}
