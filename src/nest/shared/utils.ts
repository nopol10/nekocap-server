import { getBaseLanguageCode, languages } from "@/common/languages";
import { CaptionPrivacy } from "./video-source";

export const unixSeconds = (date: Date): number =>
  parseInt((date.getTime() / 1000).toFixed(0));

export const escapeRegexInString = (input: string): string =>
  input.replace(/[#-.]|[[-^]|[?|{}]/g, "\\$&");

export const isUndefinedOrNull = (value: unknown): value is undefined | null =>
  value === undefined || value === null;

export function isTruthy<T>(x: T | undefined | null | false | "" | 0): x is T {
  return !!x;
}

/**
 * Returns the base language code and all of its sub languages,
 * e.g. "en_US" → ["en", "en_US", "en_GB", ...]
 */
export const getRelatedLanguageCodes = (languageCode: string): string[] => {
  const baseLanguageCode = getBaseLanguageCode(languageCode);
  return Object.keys(languages).filter(
    (language) =>
      language === baseLanguageCode ||
      language.startsWith(`${baseLanguageCode}_`),
  );
};

/**
 * Non public captions can only be seen by their creator
 */
export const canViewCaption = (
  caption: { privacy?: number | null; creatorId?: string },
  userId: string | undefined,
): boolean => {
  const privacy = caption.privacy || CaptionPrivacy.Public;
  if (privacy === CaptionPrivacy.Public) {
    return true;
  }
  return !!userId && caption.creatorId === userId;
};
