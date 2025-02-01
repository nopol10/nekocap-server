import { getCaptionGroupTagName } from "@/common/feature/video/utils";
import { CaptionerSchema } from "@/common/providers/parse/types";
import { PARSE_CLASS } from "cloud/constants";
import { differenceBy } from "lodash-es";

export async function addMissingCaptionTags(
  creatorId: string,
  tags?: string[],
) {
  if (!creatorId || !tags || tags.length <= 0) {
    return;
  }
  const query = new Parse.Query<CaptionerSchema>(PARSE_CLASS.captioner);
  query.equalTo("userId", creatorId);
  const captioner = await query.first();
  if (!captioner) {
    return;
  }
  const existingTags: string[] = captioner.get("captionTags") || [];
  const existingMappedTags = existingTags
    .map((tag: string) => {
      return { name: getCaptionGroupTagName(tag), tag };
    })
    .filter(Boolean);
  const incomingMappedTags = tags
    .map((tag) => {
      const name = getCaptionGroupTagName(tag);
      if (!name) {
        return undefined;
      }
      return { name, tag };
    })
    .filter(Boolean);

  const newTags = differenceBy(
    incomingMappedTags,
    existingMappedTags,
    "name",
  ).map((tag) => tag.tag);
  captioner.set("captionTags", [...existingTags, ...newTags]);
  await captioner.save(null, { useMasterKey: true });
}
