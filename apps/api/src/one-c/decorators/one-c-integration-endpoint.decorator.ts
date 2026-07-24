import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * Stable marker for integration-only middleware and guards.
 * It intentionally carries metadata only so transport policy can be composed
 * at the module boundary without coupling this decorator to a concrete guard.
 */
export const ONE_C_INTEGRATION_ENDPOINT_METADATA =
  'pro-dessert:one-c-integration-endpoint' as const;

export function OneCIntegrationEndpoint(): CustomDecorator<
  typeof ONE_C_INTEGRATION_ENDPOINT_METADATA
> {
  return SetMetadata(ONE_C_INTEGRATION_ENDPOINT_METADATA, true);
}
