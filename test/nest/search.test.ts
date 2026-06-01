import mongoose, { Connection } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import {
  Caption,
  CaptionSchema,
} from "../../src/nest/shared/schemas/caption.schema";
import {
  Video,
  VideoSchema,
} from "../../src/nest/shared/schemas/video.schema";
import { SearchService } from "../../src/nest/search/search.service";

// These tests exercise the NestJS `search` service (GET /api/v1/search) against
// a real in-memory MongoDB, asserting the same request/response contract the
// Parse `search` cloud function provided. Documents are inserted in Parse's
// on-disk shape (`source` as a string, `_updated_at` controlling sort order).

let mongo: MongoMemoryReplSet | undefined;
let connection: Connection | undefined;
let service: SearchService;
let skipReason: string | undefined;

const skipIfNoMongo = (ctx: TestContext) => {
  if (skipReason) ctx.skip(skipReason);
};

type VideoDoc = {
  sourceId: string;
  source: string;
  name: string;
  language: string;
  sourceCreatorId?: string;
  captions: Record<string, number>;
  captionCount: number;
  _updated_at?: Date;
  _created_at?: Date;
};

type CaptionDoc = {
  videoId: string;
  videoSource: string;
  translatedTitle?: string;
  language?: string;
  privacy?: number | null;
};

const seedVideos = async (videos: VideoDoc[]) => {
  await connection!.collection("videos").insertMany(
    videos.map((video, index) => ({
      _updated_at: new Date(Date.UTC(2024, 0, 1 + index)),
      _created_at: new Date(Date.UTC(2024, 0, 1 + index)),
      ...video,
    })),
  );
};

const seedCaptions = async (captions: CaptionDoc[]) => {
  await connection!.collection("captions").insertMany(captions);
};

const sourceIds = (videos: { sourceId: string }[]) =>
  videos.map((video) => video.sourceId).sort();

describe("search service", () => {
  beforeAll(async () => {
    try {
      mongo = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: "wiredTiger" },
      });
    } catch (err) {
      skipReason =
        "in-memory MongoDB unavailable (mongodb-memory-server could not " +
        `obtain a mongod binary): ${(err as Error)?.message ?? String(err)}`;
      console.warn(`[search.test] skipping: ${skipReason}`);
      return;
    }
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();
    const captionModel = connection.model(Caption.name, CaptionSchema);
    const videoModel = connection.model(Video.name, VideoSchema);
    service = new SearchService(captionModel as never, videoModel as never);
  });

  afterAll(async () => {
    if (connection) await connection.close();
    if (mongo) await mongo.stop();
  });

  beforeEach(async (ctx) => {
    if (skipReason) return;
    await connection!.collection("videos").deleteMany({});
    await connection!.collection("captions").deleteMany({});
    void ctx;
  });

  it("matches by video name, source id and caption translated title", async (ctx) => {
    skipIfNoMongo(ctx);
    await seedVideos([
      // name match
      {
        sourceId: "vid-1",
        source: "0",
        name: "Naruto Episode 1",
        language: "ja",
        captions: { en: 2, ja: 1 },
        captionCount: 3,
      },
      // source id match (name does not contain the term)
      {
        sourceId: "naruto-id-123",
        source: "0",
        name: "Some Other Title",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
      // translated-title match target
      {
        sourceId: "vid-trans",
        source: "1",
        name: "Unrelated Title",
        language: "en",
        captions: { fr: 1 },
        captionCount: 1,
      },
      // name matches but has no captions -> excluded
      {
        sourceId: "vid-nocaptions",
        source: "0",
        name: "Naruto No Captions",
        language: "ja",
        captions: {},
        captionCount: 0,
      },
      // only reachable via a private caption -> excluded
      {
        sourceId: "vid-private",
        source: "0",
        name: "Holder",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
    ]);
    await seedCaptions([
      {
        videoId: "vid-trans",
        videoSource: "1",
        translatedTitle: "Naruto Translated",
        language: "fr",
        privacy: 0,
      },
      {
        videoId: "vid-private",
        videoSource: "0",
        translatedTitle: "Naruto Secret",
        language: "en",
        privacy: 1,
      },
    ]);

    const result = await service.search({
      title: "Naruto",
      limit: 10,
      offset: 0,
    });

    expect(result.status).toBe("success");
    expect(sourceIds(result.videos)).toEqual([
      "naruto-id-123",
      "vid-1",
      "vid-trans",
    ]);
    expect(result.hasMoreResults).toBe(false);
    // Response shape matches the frontend VideoFields contract.
    const named = result.videos.find((v) => v.sourceId === "vid-1");
    expect(named).toMatchObject({
      name: "Naruto Episode 1",
      language: "ja",
      source: "0",
      captionCount: 3,
      captions: { en: 2, ja: 1 },
    });
  });

  it("filters by caption language and expands a base code to sub-languages", async (ctx) => {
    skipIfNoMongo(ctx);
    await seedVideos([
      {
        sourceId: "vid-ja",
        source: "0",
        name: "Naruto JA",
        language: "ja",
        captions: { ja: 1 },
        captionCount: 1,
      },
      {
        sourceId: "vid-en",
        source: "0",
        name: "Naruto EN",
        language: "en",
        captions: { en: 1 },
        captionCount: 1,
      },
      {
        sourceId: "vid-enus",
        source: "0",
        name: "Naruto EN-US",
        language: "en",
        captions: { en_US: 2 },
        captionCount: 2,
      },
    ]);

    const baseEn = await service.search({
      title: "Naruto",
      captionLanguageCode: "en",
      limit: 10,
    });
    // Base code "en" expands to en and en_US, but not ja.
    expect(sourceIds(baseEn.videos)).toEqual(["vid-en", "vid-enus"]);

    const exactEnUs = await service.search({
      title: "Naruto",
      captionLanguageCode: "en_US",
      limit: 10,
    });
    expect(sourceIds(exactEnUs.videos)).toEqual(["vid-enus"]);

    const enGb = await service.search({
      title: "Naruto",
      captionLanguageCode: "en_GB",
      limit: 10,
    });
    expect(enGb.videos).toHaveLength(0);
  });

  it("filters by video language and treats unknown/empty codes as 'any'", async (ctx) => {
    skipIfNoMongo(ctx);
    await seedVideos([
      {
        sourceId: "vid-ja",
        source: "0",
        name: "Naruto JA",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
      {
        sourceId: "vid-en",
        source: "0",
        name: "Naruto EN",
        language: "en",
        captions: { en: 1 },
        captionCount: 1,
      },
    ]);

    const jaOnly = await service.search({
      title: "Naruto",
      videoLanguageCode: "ja",
      limit: 10,
    });
    expect(sourceIds(jaOnly.videos)).toEqual(["vid-ja"]);

    const unknownAsAny = await service.search({
      title: "Naruto",
      videoLanguageCode: "unk",
      captionLanguageCode: "",
      limit: 10,
    });
    expect(sourceIds(unknownAsAny.videos)).toEqual(["vid-en", "vid-ja"]);
  });

  it("sorts by last-updated descending and paginates with hasMoreResults", async (ctx) => {
    skipIfNoMongo(ctx);
    // seedVideos assigns increasing _updated_at by array index, so the last
    // entry is the most recently updated.
    await seedVideos([
      {
        sourceId: "vid-oldest",
        source: "0",
        name: "Naruto A",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
      {
        sourceId: "vid-middle",
        source: "0",
        name: "Naruto B",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
      {
        sourceId: "vid-newest",
        source: "0",
        name: "Naruto C",
        language: "ja",
        captions: { en: 1 },
        captionCount: 1,
      },
    ]);

    const firstPage = await service.search({
      title: "Naruto",
      limit: 2,
      offset: 0,
    });
    expect(firstPage.videos.map((v) => v.sourceId)).toEqual([
      "vid-newest",
      "vid-middle",
    ]);
    expect(firstPage.hasMoreResults).toBe(true);

    const secondPage = await service.search({
      title: "Naruto",
      limit: 2,
      offset: 2,
    });
    expect(secondPage.videos.map((v) => v.sourceId)).toEqual(["vid-oldest"]);
    expect(secondPage.hasMoreResults).toBe(false);
  });
});
