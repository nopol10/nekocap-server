import { Inject, Injectable } from "@nestjs/common";
import {
  ROLE_COLLECTION,
  ROLE_USERS_JOIN_COLLECTION,
  ROLES,
  type RoleName,
} from "../constants";
import type { RoleDoc, RoleJoinDoc } from "./documents";
import { ParseDbService } from "./parse-db.service";

export type UserRoles = {
  isAdmin: boolean;
  isReviewer: boolean;
  isReviewerManager: boolean;
};

/**
 * Parse roles. Role membership is stored by Parse as a relation, i.e. rows of
 * `{owningId: <role id>, relatedId: <user id>}` in `_Join:users:_Role`.
 */
@Injectable()
export class RolesService {
  constructor(@Inject(ParseDbService) private readonly db: ParseDbService) {}

  async findRole(name: RoleName): Promise<RoleDoc | null> {
    return this.db.collection<RoleDoc>(ROLE_COLLECTION).findOne({ name });
  }

  async hasRole(userId: string, name: RoleName): Promise<boolean> {
    const role = await this.findRole(name);
    if (!role) {
      return false;
    }
    const membership = await this.db
      .collection<RoleJoinDoc>(ROLE_USERS_JOIN_COLLECTION)
      .findOne({ owningId: role._id, relatedId: userId });
    return !!membership;
  }

  /** A user is an admin if they are a super admin */
  async hasAdminRole(userId: string): Promise<boolean> {
    return (
      (await this.hasRole(userId, ROLES.superadmin)) ||
      (await this.hasRole(userId, ROLES.admin))
    );
  }

  async hasReviewerManagerRole(userId: string): Promise<boolean> {
    return this.hasRole(userId, ROLES.reviewerManager);
  }

  /** A user is a reviewer if they are a reviewer manager */
  async hasReviewerRole(userId: string): Promise<boolean> {
    return (
      (await this.hasReviewerManagerRole(userId)) ||
      (await this.hasRole(userId, ROLES.reviewer))
    );
  }

  async getUserRoles(userId: string): Promise<UserRoles> {
    const [isAdmin, isReviewer, isReviewerManager] = await Promise.all([
      this.hasAdminRole(userId),
      this.hasReviewerRole(userId),
      this.hasReviewerManagerRole(userId),
    ]);
    return { isAdmin, isReviewer, isReviewerManager };
  }

  async addUser(role: RoleDoc, userId: string): Promise<void> {
    await this.db
      .collection<RoleJoinDoc>(ROLE_USERS_JOIN_COLLECTION)
      .updateOne(
        { owningId: role._id, relatedId: userId },
        { $setOnInsert: { owningId: role._id, relatedId: userId } },
        { upsert: true },
      );
    await this.db.updateById<RoleDoc>(ROLE_COLLECTION, role._id, {});
  }

  async removeUser(role: RoleDoc, userId: string): Promise<void> {
    await this.db
      .collection<RoleJoinDoc>(ROLE_USERS_JOIN_COLLECTION)
      .deleteMany({ owningId: role._id, relatedId: userId });
    await this.db.updateById<RoleDoc>(ROLE_COLLECTION, role._id, {});
  }
}
