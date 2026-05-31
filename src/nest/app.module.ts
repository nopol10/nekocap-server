import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { CaptionsModule } from "./captions/captions.module";
import { HomepageStatsModule } from "./homepage-stats/homepage-stats.module";
import { SearchModule } from "./search/search.module";

const databaseUri = process.env.DATABASE_URI || "mongodb://localhost:27017/dev";

@Module({
  imports: [
    MongooseModule.forRoot(databaseUri),
    ScheduleModule.forRoot(),
    HomepageStatsModule,
    CaptionsModule,
    SearchModule,
  ],
})
export class AppModule {}
