import {
  CaptionerPrivateSchema,
  CaptionerSchema,
} from "@/common/providers/parse/types";
import { getPublicReadAdminACL, getAdminACL } from "cloud/acl";
import { PARSE_CLASS } from "cloud/constants";

export async function createCaptionerWithoutUser({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const Captioner = Parse.Object.extend(
    PARSE_CLASS.captioner,
  ) as new () => CaptionerSchema;
  const newCaptioner = new Captioner();
  newCaptioner.setACL(getPublicReadAdminACL());
  newCaptioner.set("userId", "undefined");
  newCaptioner.set("name", name);
  newCaptioner.set("nameTag", 99999);
  const captionerObject = await newCaptioner.save(null, { useMasterKey: true });

  const CaptionerPrivate = Parse.Object.extend(
    PARSE_CLASS.captionerPrivate,
  ) as new () => CaptionerPrivateSchema;
  const newCaptionerPrivate = new CaptionerPrivate();
  newCaptionerPrivate.setACL(getAdminACL());
  // captionerId for captionerPrivates without users are special, they point to the captioner's id instead
  // of the user id so that they can later be linked if needed.
  // Normally they point to the user object's id instead
  newCaptionerPrivate.set("captionerId", captionerObject.id);
  newCaptionerPrivate.set("email", email);
  await newCaptionerPrivate.save(null, { useMasterKey: true });
}
