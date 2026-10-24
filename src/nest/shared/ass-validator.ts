import { parse as parseAss } from "ass-compiler";

export const validateAss = (assText: string): boolean => {
  try {
    const result = parseAss(assText);
    if (
      !result ||
      !result.events ||
      !result.events.dialogue ||
      result.events.dialogue.length <= 0
    ) {
      return false;
    }
  } catch (e) {
    return false;
  }
  return true;
};
