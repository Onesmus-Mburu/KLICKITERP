import { Injectable } from "@nestjs/common";
import { UsrPermissionEntity } from "../domain/usr-permission.entity";
import { UsrPermissionRepository } from "../infrastructure/usr-permission.repository";

/**
 * Phase 6 Slice 13 Part 1 — browsing surface for the permission catalogue
 * (FR-USER-001.1). Backs `GET /permissions` (`PermissionsController`);
 * `?module=` narrows to one module's codes via the new
 * `UsrPermissionRepository.findByModule()`.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly permissionRepository: UsrPermissionRepository) {}

  async list(module?: string): Promise<UsrPermissionEntity[]> {
    if (module) {
      return this.permissionRepository.findByModule(module);
    }
    return this.permissionRepository.list();
  }
}
