import { type DynamicModule, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { CaptionersModule } from "./captioners/captioners.module";
import { CaptionsModule } from "./captions/captions.module";
import { HomepageStatsModule } from "./homepage-stats/homepage-stats.module";
import { LegacyModule } from "./legacy/legacy.module";
import { MigrationModule } from "./migration/migration.module";
import { NEKOCAP_OPTIONS, type NekoCapOptions } from "./options";
import { ParseCompatModule } from "./parse-compat/parse-compat.module";
import { SearchModule } from "./search/search.module";
import { StatsModule } from "./stats/stats.module";
import { UsersModule } from "./users/users.module";
import { VideosModule } from "./videos/videos.module";

@Module({})
export class AppModule {
  static forRoot(options: NekoCapOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        MongooseModule.forRoot(options.databaseURI),
        ...(options.enableSchedule ? [ScheduleModule.forRoot()] : []),
        ParseCompatModule,
        AuthModule,
        UsersModule,
        VideosModule,
        CaptionsModule,
        CaptionersModule,
        SearchModule,
        StatsModule,
        HomepageStatsModule,
        MigrationModule,
        LegacyModule,
      ],
      providers: [{ provide: NEKOCAP_OPTIONS, useValue: options }],
      exports: [NEKOCAP_OPTIONS],
    };
  }
}
