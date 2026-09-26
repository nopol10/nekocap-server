import { Inject, Injectable } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import type { Connection, mongo } from "mongoose";
import type { ParseAclFields } from "./acl";
import type { ParseBaseDoc } from "./documents";
import { newObjectId } from "./object-id";

type Collection<T extends mongo.Document> = mongo.Collection<T>;
type Document = mongo.Document;
type UpdateFilter<T extends mongo.Document> = mongo.UpdateFilter<T>;

/**
 * Removes keys whose value is undefined. The MongoDB driver would otherwise
 * store them as null, whereas Parse leaves such fields out.
 */
export const stripUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;

/**
 * Thin access layer over the MongoDB collections Parse Server owns.
 * All writes go through here so that documents keep Parse's on-disk format:
 * string objectIds, `_created_at` / `_updated_at` and Parse ACL fields.
 */
@Injectable()
export class ParseDbService {
  constructor(
    @Inject(getConnectionToken())
    private readonly connection: Connection,
  ) {}

  db(): mongo.Db {
    const db = this.connection.db;
    if (!db) {
      throw new Error("MongoDB connection is not ready");
    }
    return db;
  }

  collection<T extends Document>(name: string): Collection<T> {
    return this.db().collection<T>(name);
  }

  /**
   * Inserts a new Parse object into the collection
   */
  async create<T extends ParseBaseDoc>(
    collectionName: string,
    fields: Omit<T, keyof ParseBaseDoc>,
    acl?: ParseAclFields,
    id: string = newObjectId(),
  ): Promise<T> {
    const now = new Date();
    const doc = {
      _id: id,
      ...stripUndefined(fields),
      ...(acl || {}),
      _created_at: now,
      _updated_at: now,
    } as unknown as T;
    await this.collection<T>(collectionName).insertOne(
      doc as unknown as Parameters<Collection<T>["insertOne"]>[0],
    );
    return doc;
  }

  /**
   * Adds the `_updated_at` bump Parse applies to every save
   */
  withUpdatedAt<T extends Document>(update: UpdateFilter<T>): UpdateFilter<T> {
    const $set = {
      ...stripUndefined(update.$set || {}),
      _updated_at: new Date(),
    };
    return { ...update, $set } as unknown as UpdateFilter<T>;
  }

  async updateById<T extends ParseBaseDoc>(
    collectionName: string,
    id: string,
    update: UpdateFilter<T>,
  ): Promise<void> {
    await this.collection<T>(collectionName).updateOne(
      { _id: id } as never,
      this.withUpdatedAt(update),
    );
  }
}
