import { Module } from "@nestjs/common";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

/**
 * Registers `OutboxDispatcherService` for DI. Deliberately minimal — it
 * does NOT import `TypeOrmModule.forFeature([...])` for `OutboxEntity`/
 * `OutboxConsumerMarkEntity` because the dispatcher reads/writes both via
 * `dataSource.getRepository(...)` directly off the injected `DataSource`
 * (`@InjectDataSource()`), which resolves globally once the composition
 * root's own `TypeOrmModule.forRoot()` has registered `AppDataSource`'s
 * full entity list (both entities are already in that list — see
 * `packages/server/src/migrations/data-source.ts`) — no separate
 * `forFeature` registration is needed for that access pattern, matching
 * `apps/api/src/health.controller.ts`'s own `@InjectDataSource()` +
 * `dataSource.query(...)` precedent.
 *
 * Does NOT bind `OUTBOX_HANDLERS` to anything — that token starts
 * unregistered (see `outbox-handler.interface.ts`'s own doc comment): the
 * dispatcher's `@Optional()` injection defaults to `[]` when nothing binds
 * it, which is exactly this codebase's honest current state (zero real
 * handlers exist yet). A future module that adds a real handler class
 * would provide its own `{ provide: OUTBOX_HANDLERS, useFactory: (h) =>
 * [h], inject: [ItsHandlerClass] }`-shaped binding at whatever composition
 * root wires it in — NestJS has no built-in "multi provider" primitive, so
 * that factory-array shape is the idiomatic way multiple such bindings
 * would need to be merged if/when more than one real handler exists.
 */
@Module({
  providers: [OutboxDispatcherService],
  exports: [OutboxDispatcherService],
})
export class OutboxDispatcherModule {}
