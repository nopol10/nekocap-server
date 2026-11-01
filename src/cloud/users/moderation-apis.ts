import type {
  RoleRequest,
  VerifyRequest,
} from "@/common/feature/captioner/types";
import type { CaptionerSchema } from "@/common/providers/parse/types";
import type { ServerResponse } from "@/common/types";
import { isInMaintenanceMode } from "../config";
import { ERROR_MESSAGES, PARSE_CLASS } from "../constants";
import { role } from "../roles";
import {
  hasAdminRole,
  hasReviewerManagerRole,
  hasReviewerRole,
} from "../utils";

/**
 * Make a user a reviewer, removes them as a reviewer if they are already one
 */
Parse.Cloud.define(
  "assignReviewerRole",
  async (
    request: Parse.Cloud.FunctionRequest<RoleRequest>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    const isReviewerManager = await hasReviewerManagerRole(requester);
    if (!isAdmin && !isReviewerManager) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const reviewerQuery = new Parse.Query<Parse.Role>(Parse.Role);
    reviewerQuery.equalTo("name", role.reviewer);
    const reviewerRole = await reviewerQuery.first({ useMasterKey: true });
    if (!reviewerRole) {
      return { status: "error", error: "Reviewer role not found!" };
    }

    const userQuery = new Parse.Query<Parse.User>(Parse.User);
    userQuery.equalTo("objectId", targetUserId);
    const user = await userQuery.first({ useMasterKey: true });
    if (!user) {
      return { status: "error", error: "Target user not found!" };
    }
    const isReviewer = await hasReviewerRole(user);
    if (isReviewer) {
      reviewerRole.getUsers().remove(user);
    } else {
      reviewerRole.getUsers().add(user);
    }

    await reviewerRole.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

/**
 * Make a user a reviewer, removes them as a reviewer if they are already one
 */
Parse.Cloud.define(
  "assignReviewerManagerRole",
  async (
    request: Parse.Cloud.FunctionRequest<RoleRequest>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const reviewerQuery = new Parse.Query<Parse.Role>(Parse.Role);
    reviewerQuery.equalTo("name", role.reviewerManager);
    const reviewerManagerRole = await reviewerQuery.first({
      useMasterKey: true,
    });
    if (!reviewerManagerRole) {
      return { status: "error", error: "Reviewer Manager role not found!" };
    }

    const userQuery = new Parse.Query<Parse.User>(Parse.User);
    userQuery.equalTo("objectId", targetUserId);
    const user = await userQuery.first({ useMasterKey: true });
    if (!user) {
      return { status: "error", error: "Target user not found!" };
    }
    const isReviewerManager = await hasReviewerManagerRole(user);
    if (isReviewerManager) {
      reviewerManagerRole.getUsers().remove(user);
    } else {
      reviewerManagerRole.getUsers().add(user);
    }

    await reviewerManagerRole.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

Parse.Cloud.define(
  "verifyCaptioner",
  async (
    request: Parse.Cloud.FunctionRequest<VerifyRequest>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
    query.equalTo("userId", targetUserId);
    const captioner = await query.first();
    if (!captioner) {
      return { status: "error", error: "Target user not found!" };
    }
    captioner.set("verified", !captioner.get("verified"));
    await captioner.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);

Parse.Cloud.define(
  "banCaptioner",
  async (
    request: Parse.Cloud.FunctionRequest<VerifyRequest>,
  ): Promise<ServerResponse> => {
    if (!request.user || !request.user.getSessionToken()) {
      return { status: "error", error: ERROR_MESSAGES.NOT_LOGGED_IN };
    }
    if (await isInMaintenanceMode()) {
      return { status: "error", error: ERROR_MESSAGES.MAINTENANCE };
    }
    const { user: requester } = request;
    const isAdmin = await hasAdminRole(requester);
    if (!isAdmin) {
      return { status: "error", error: "Not authorized!" };
    }
    const { targetUserId } = request.params;
    const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
    query.equalTo("userId", targetUserId);
    const captioner = await query.first();
    if (!captioner) {
      return { status: "error", error: "Target user not found!" };
    }
    captioner.set("banned", !captioner.get("banned"));
    await captioner.save(null, { useMasterKey: true });

    return {
      status: "success",
    };
  },
);
