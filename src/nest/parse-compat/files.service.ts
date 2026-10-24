import { Inject, Injectable, Logger } from "@nestjs/common";
import { mongo } from "mongoose";
import { NEKOCAP_OPTIONS, type NekoCapOptions } from "../options";
import { randomHexString } from "./object-id";
import { ParseDbService } from "./parse-db.service";

/**
 * Stores files the same way Parse Server's default GridFSBucketAdapter does
 * (the default `fs` bucket in the Parse database), so files written here are
 * served by Parse's `/files/<appId>/<name>` route and vice versa.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(ParseDbService) private readonly db: ParseDbService,
    @Inject(NEKOCAP_OPTIONS) private readonly options: NekoCapOptions,
  ) {}

  private bucket(): mongo.GridFSBucket {
    return new mongo.GridFSBucket(this.db.db());
  }

  /**
   * Parse names uploaded files `<32 hex chars>_<name>` and, for files without
   * an extension uploaded as text (which is how `new Parse.File(name, {base64})`
   * was used for raw captions), appends `.txt`.
   */
  buildFilename(name: string): string {
    const hasExtension = /\.[^./]+$/.test(name);
    return `${randomHexString(32)}_${name}${hasExtension ? "" : ".txt"}`;
  }

  /**
   * Saves base64 encoded data, mirroring `new Parse.File(name, {base64}).save()`
   * @returns the stored file name, which is what Parse keeps in File fields
   */
  async createFromBase64(name: string, base64: string): Promise<string> {
    const filename = this.buildFilename(name);
    const data = Buffer.from(base64, "base64");
    await new Promise<void>((resolve, reject) => {
      const stream = this.bucket().openUploadStream(filename, {
        metadata: {},
      });
      stream.on("finish", () => resolve());
      stream.on("error", reject);
      stream.end(data);
    });
    return filename;
  }

  async delete(filename: string): Promise<void> {
    const bucket = this.bucket();
    const files = await bucket.find({ filename }).toArray();
    if (files.length === 0) {
      this.logger.warn(`File not found for deletion: ${filename}`);
      return;
    }
    await Promise.all(files.map((file) => bucket.delete(file._id)));
  }

  async getData(filename: string): Promise<Buffer | undefined> {
    const bucket = this.bucket();
    const files = await bucket.find({ filename }).toArray();
    if (files.length === 0) {
      return undefined;
    }
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      bucket
        .openDownloadStreamByName(filename)
        .on("data", (chunk: Buffer) => chunks.push(chunk))
        .on("end", () => resolve())
        .on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  /** The url Parse returns for a file, i.e. `file.url()` */
  url(filename: string): string {
    const encoded = filename.split("/").map(encodeURIComponent).join("/");
    return `${this.options.publicServerURL}/files/${this.options.appId}/${encoded}`;
  }
}
