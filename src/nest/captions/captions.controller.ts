import { Controller, Get, HttpCode } from "@nestjs/common";
import {
  CaptionsResponsePayload,
  CaptionsService,
} from "./captions.service";

@Controller("captions")
export class CaptionsController {
  constructor(private readonly service: CaptionsService) {}

  @Get("latest")
  @HttpCode(200)
  async getLatest(): Promise<CaptionsResponsePayload> {
    return this.service.getLatest();
  }
}
