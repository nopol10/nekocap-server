import { Global, Module } from "@nestjs/common";
import { FilesService } from "./files.service";
import { ParseConfigService } from "./parse-config.service";
import { ParseDbService } from "./parse-db.service";
import { RolesService } from "./roles.service";
import { SchemaSyncService } from "./schema-sync.service";

/**
 * Services for reading and writing data in Parse Server's MongoDB format
 */
@Global()
@Module({
  providers: [
    ParseDbService,
    ParseConfigService,
    RolesService,
    FilesService,
    SchemaSyncService,
  ],
  exports: [ParseDbService, ParseConfigService, RolesService, FilesService],
})
export class ParseCompatModule {}
