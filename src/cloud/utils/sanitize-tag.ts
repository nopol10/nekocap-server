import {
  getCaptionGroupTagColor,
  getCaptionGroupTagName,
} from "@/common/feature/video/utils";
import { MAX_CAPTION_GROUP_TAG_NAME_LENGTH } from "cloud/constants";

/**
 * Sanitize a caption group tag of the form
 * g:<name>:<color>
 * If the current array of tags is provided,
 * it will change the color to match any same named tag in the current array
 * to prevent overwriting the tag
 * @param tag
 */
export function sanitizeTag(tag: string, currentTags?: string[]): string {
  if (!tag.startsWith("g:")) {
    return "";
  }
  let name = getCaptionGroupTagName(tag);
  if (!name) {
    return "";
  }
  name = name.substring(0, MAX_CAPTION_GROUP_TAG_NAME_LENGTH);
  name = name.replace(/[<>\"\'\?]/g, "");
  const color = getCaptionGroupTagColor(tag);
  if (currentTags) {
    const currentSameNamedTag = currentTags.find((currentTag) =>
      currentTag.includes(`:${name}:`)
    );
    if (currentSameNamedTag) {
      return currentSameNamedTag;
    }
  }
  return `g:${name}:${color}`;
}
