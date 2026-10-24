import { describe, expect, it } from "vitest";
import { MAX_CAPTION_TITLE_FILTER_LENGTH } from "../../src/nest/constants";
import { buildCaptionQueryStages } from "../../src/nest/shared/caption-pipeline";

const baseParam = {
  limit: 20,
  offset: 0,
  captionerId: "captioner-1",
  getRejected: true,
  tags: [] as string[],
};

const stageNames = (stages: Record<string, any>[]): string[] =>
  stages.map((stage) => Object.keys(stage)[0]);

const findTitleMatch = (stages: Record<string, any>[]) =>
  stages.find((stage) => stage.$match && Array.isArray(stage.$match.$or))
    ?.$match;

describe("buildCaptionQueryStages video title filter", () => {
  it("does not join the video before paginating when no title is given", () => {
    const stages = buildCaptionQueryStages(baseParam);

    expect(stageNames(stages).slice(0, 4)).toEqual([
      "$match",
      "$sort",
      "$skip",
      "$limit",
    ]);
    // The joins only run for the documents of the requested page
    expect(stageNames(stages).indexOf("$lookup")).toBeGreaterThan(
      stageNames(stages).indexOf("$limit"),
    );
  });

  it("matches the original and the translated title case insensitively", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "Spy",
    });

    expect(findTitleMatch(stages)).toEqual({
      $or: [
        { translatedTitle: { $regex: "Spy", $options: "i" } },
        { "video.name": { $regex: "Spy", $options: "i" } },
      ],
    });
  });

  it("joins the video before the title match but still paginates afterwards", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "spy",
    });
    const names = stageNames(stages);

    // The captioner + created date match narrows the pipeline down first so
    // that the video join only runs for that captioner's captions
    expect(names[0]).toBe("$match");
    expect(names[1]).toBe("$sort");
    expect(names.indexOf("$lookup")).toBeLessThan(names.lastIndexOf("$match"));
    expect(names.lastIndexOf("$match")).toBeLessThan(names.indexOf("$skip"));
    expect(names.indexOf("$skip")).toBeLessThan(names.indexOf("$limit"));
  });

  it("joins the video only once when filtering by title", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "spy",
    });
    const joinedCollections = stages
      .filter((stage) => !!stage.$lookup)
      .map((stage) => stage.$lookup.from);

    expect(joinedCollections).toEqual(["videos", "captioner"]);
  });

  it("escapes regex characters in the filter", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "(a+b)|c.*",
    });

    expect(findTitleMatch(stages).$or[0].translatedTitle.$regex).toBe(
      "\\(a\\+b\\)\\|c\\.\\*",
    );
  });

  it("trims the filter and ignores one that is only whitespace", () => {
    const trimmed = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "  spy  ",
    });
    expect(findTitleMatch(trimmed).$or[0].translatedTitle.$regex).toBe("spy");

    const blank = buildCaptionQueryStages({ ...baseParam, titleFilter: "   " });
    expect(findTitleMatch(blank)).toBeUndefined();
    expect(stageNames(blank).slice(0, 4)).toEqual([
      "$match",
      "$sort",
      "$skip",
      "$limit",
    ]);
  });

  it("caps the length of the filter", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      titleFilter: "a".repeat(MAX_CAPTION_TITLE_FILTER_LENGTH + 50),
    });

    expect(findTitleMatch(stages).$or[0].translatedTitle.$regex).toBe(
      "a".repeat(MAX_CAPTION_TITLE_FILTER_LENGTH),
    );
  });

  it("keeps the other filters when filtering by title", () => {
    const stages = buildCaptionQueryStages({
      ...baseParam,
      advancedFilter: "advanced",
      titleFilter: "spy",
    });

    expect(stages[0].$match).toMatchObject({
      creatorId: "captioner-1",
      rawContent: { $exists: true, $nin: [null, ""] },
    });
  });
});
