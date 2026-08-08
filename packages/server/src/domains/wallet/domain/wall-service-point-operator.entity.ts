import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { MutableBaseEntity } from "../../../shared/database/mutable-base.entity";
import { UsrUserEntity } from "../../../platform/users";
import { WallServicePointEntity } from "./wall-service-point.entity";

/**
 * Maps to `wall_service_point_operator` (docs/phase-4/03-schema-student-finance.md
 * §5) — which `usr_user`s are permitted to operate (spend against) a given
 * `wall_service_point`. `user_id` is a real FK to `usr_user` (imported via
 * `platform/users`' barrel, same one-directional precedent every other
 * module's `usr_user` FK uses).
 */
@Entity("wall_service_point_operator")
@Index("uq_wall_service_point_operator", ["servicePointId", "userId"], { unique: true })
export class WallServicePointOperatorEntity extends MutableBaseEntity {
  @Column({ type: "uuid", name: "service_point_id" })
  servicePointId!: string;

  @ManyToOne(() => WallServicePointEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "service_point_id" })
  servicePoint?: WallServicePointEntity;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => UsrUserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UsrUserEntity;
}
