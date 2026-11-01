import { MAX_CAPTION_GROUP_TAG_NAME_LENGTH } from "../constants";

// Mirrors getCaptionGroupTagName / getCaptionGroupTagColor in nekocap's
// src/common/feature/video/utils.ts. Group tags have the format g:<name>:<color>

export const getCaptionGroupTagName = (tag: string): string => {
  const nameStart = tag.indexOf(":", 0) + 1;
  const nameEnd = tag.lastIndexOf(":");
  if (nameStart < 0 || nameEnd < 0 || nameStart >= tag.length) {
    return "";
  }
  return tag.substring(nameStart, nameEnd);
};

export const getCaptionGroupTagColor = (tag: string): string => {
  const colorStart = tag.lastIndexOf(":") + 1;
  // The last colon has to be present at least
  if (colorStart <= 0) {
    return "";
  }
  return tag.substring(colorStart);
};

/**
 * Sanitize a caption group tag of the form g:<name>:<color>
 * If the current array of tags is provided, it will change the color to match
 * any same named tag in the current array to prevent overwriting the tag
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
  name = name.replace(/[<>"'?]/g, "");
  const color = getCaptionGroupTagColor(tag);
  if (currentTags) {
    const currentSameNamedTag = currentTags.find((currentTag) =>
      currentTag.includes(`:${name}:`),
    );
    if (currentSameNamedTag) {
      return currentSameNamedTag;
    }
  }
  return `g:${name}:${color}`;
}

/** Whether the tag list contains the group tag with the given name */
export const hasGroupTag = (tags: string[], tagName: string): boolean =>
  tags.some((tag) => tag.indexOf(`g:${tagName}:`) >= 0);

export const withoutGroupTag = (tags: string[], tagName: string): string[] =>
  tags.filter((tag) => tag.indexOf(`g:${tagName}:`) < 0);
