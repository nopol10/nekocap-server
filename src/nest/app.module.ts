import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { HomepageStatsModule } from "./homepage-stats/homepage-stats.module";

const databaseUri = process.env.DATABASE_URI || "mongodb://localhost:27017/dev";

@Module({
  imports: [
    MongooseModule.forRoot(databaseUri),
    ScheduleModule.forRoot(),
    HomepageStatsModule,
  ],
})
export class AppModule {}
