import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { ONE_C_ADAPTER, type OneCAdapter, type OneCAdapterHealth } from './adapters/one-c-adapter';
import { OneCIntegrationEndpoint } from './decorators/one-c-integration-endpoint.decorator';
import { type OneCInboxReceipt } from './dto/one-c-envelope.dto';
import { OneCOrderExportQueryDto } from './dto/one-c-order-export-query.dto';
import { OneCOrderStatusEnvelopeDto } from './dto/one-c-order-status.dto';
import {
  ONE_C_ORDER_EXPORT_SOURCE,
  type OneCOrderExportPage,
  type OneCOrderExportSource,
} from './export/one-c-order-export.source';
import { OneCInboxService } from './inbox/one-c-inbox.service';
import { OneCSignatureGuard } from './security/one-c-signature.guard';

@Controller('integration/1c')
export class OneCController {
  constructor(
    private readonly inbox: OneCInboxService,
    @Inject(ONE_C_ADAPTER) private readonly adapter: OneCAdapter,
    @Inject(ONE_C_ORDER_EXPORT_SOURCE)
    private readonly orderExports: OneCOrderExportSource,
  ) {}

  @Get('health')
  @OneCIntegrationEndpoint()
  @UseGuards(OneCSignatureGuard)
  health(): Promise<OneCAdapterHealth> {
    return this.adapter.health();
  }

  @Post('orders/status')
  @HttpCode(202)
  @OneCIntegrationEndpoint()
  @UseGuards(OneCSignatureGuard)
  orderStatus(@Body() envelope: OneCOrderStatusEnvelopeDto): Promise<OneCInboxReceipt> {
    return this.inbox.acceptOrderStatus(envelope);
  }

  @Get('orders/export')
  @OneCIntegrationEndpoint()
  @UseGuards(OneCSignatureGuard)
  exportOrders(@Query() query: OneCOrderExportQueryDto): Promise<OneCOrderExportPage> {
    return this.orderExports.next(query.cursor ?? null, query.limit);
  }
}
