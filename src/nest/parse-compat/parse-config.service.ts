import { Inject, Injectable } from "@nestjs/common";
import { GLOBAL_CONFIG_COLLECTION } from "../constants";
import type { GlobalConfigDoc } from "./documents";
import { ParseDbService } from "./parse-db.service";

/**
 * Reads Parse Config values (Parse.Config.get()), which Parse stores in the
 * `_GlobalConfig` collection under `_id: 1`.
 */
@Injectable()
export class ParseConfigService {
  constructor(@Inject(ParseDbService) private readonly db: ParseDbService) {}

  async get(key: string): Promise<unknown> {
    const config = await this.db
      .collection<GlobalConfigDoc>(GLOBAL_CONFIG_COLLECTION)
      .findOne({ _id: 1 });
    return config?.params?.[key];
  }

  async isInMaintenanceMode(): Promise<boolean> {
    return (await this.get("maintenance")) == true;
  }

  async allowAutoCaptioning(): Promise<boolean> {
    return (await this.get("allowAutoCaption")) == true;
  }
}
