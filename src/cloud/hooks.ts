import { getNestBridge } from "./nest-bridge";

Parse.Cloud.beforeSave(
  Parse.User,
  (request: Parse.Cloud.BeforeSaveRequest<Parse.User>) => {
    const user = request.object;
    if (!user.isNew()) {
      return;
    }
    // Prevent users from signing up with their own username and password
    if (!user.get("authData")) {
      throw new Error("No authentication data provided");
    }
  },
);

/**
 * Users that log in through Parse (older clients) get their captioner
 * records created here. Users that log in through the NestJS API get them
 * created by the API itself.
 */
Parse.Cloud.afterSave(
  Parse.User,
  async (request: Parse.Cloud.AfterSaveRequest<Parse.User>) => {
    if (request.object.existed()) {
      return;
    }
    await getNestBridge().run(
      "ensureCaptionerRecords",
      { userId: request.object.id },
      { master: true },
    );
  },
);

// Caption counts on videos and captioners (previously kept up to date by
// captions afterSave / afterDelete hooks) are now maintained by the NestJS
// services, which all caption writes go through.
