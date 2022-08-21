import {
  getCaptionGroupTagColor,
  getCaptionGroupTagName,
} from "@/common/feature/video/utils";
import { MAX_CAPTION_GROUP_TAG_NAME_LENGTH } from "cloud/constants";

/**
 * Sanitize a caption group tag of the form
 * g:<name>:<color>
 * @param tag
 */
export function sanitizeTag(tag: string): string {
  if (!tag.startsWith("g:")) {
    return "";
  }
  let name = getCaptionGroupTagName(tag);
  const color = getCaptionGroupTagColor(tag);
  if (!name) {
    return "";
  }
  name = name.substring(0, MAX_CAPTION_GROUP_TAG_NAME_LENGTH);
  name = name.replace(/[<>\"\'\?]/g, "");
  return `g:${name}:${color}`;
}
