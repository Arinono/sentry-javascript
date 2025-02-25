import {
  BaggageObj,
  DsnComponents,
  Event,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  EventTraceContext,
  SdkInfo,
  SdkMetadata,
  Session,
  SessionAggregates,
  SessionEnvelope,
  SessionItem,
} from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString } from '@sentry/utils';

/** Extract sdk info from from the API metadata */
function getSdkMetadataForEnvelopeHeader(metadata?: SdkMetadata): SdkInfo | undefined {
  if (!metadata || !metadata.sdk) {
    return;
  }
  const { name, version } = metadata.sdk;
  return { name, version };
}

/**
 * Apply SdkInfo (name, version, packages, integrations) to the corresponding event key.
 * Merge with existing data if any.
 **/
function enhanceEventWithSdkInfo(event: Event, sdkInfo?: SdkInfo): Event {
  if (!sdkInfo) {
    return event;
  }
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = [...(event.sdk.integrations || []), ...(sdkInfo.integrations || [])];
  event.sdk.packages = [...(event.sdk.packages || []), ...(sdkInfo.packages || [])];
  return event;
}

/** Creates an envelope from a Session */
export function createSessionEnvelope(
  session: Session | SessionAggregates,
  dsn: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): SessionEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const envelopeHeaders = {
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
  };

  const envelopeItem: SessionItem =
    'aggregates' in session ? [{ type: 'sessions' }, session] : [{ type: 'session' }, session];

  return createEnvelope<SessionEnvelope>(envelopeHeaders, [envelopeItem]);
}

/**
 * Create an Envelope from an event.
 */
export function createEventEnvelope(
  event: Event,
  dsn: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): EventEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const eventType = event.type || 'event';

  const { transactionSampling } = event.sdkProcessingMetadata || {};
  const { method: samplingMethod, rate: sampleRate } = transactionSampling || {};

  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);

  // Prevent this data (which, if it exists, was used in earlier steps in the processing pipeline) from being sent to
  // sentry. (Note: Our use of this property comes and goes with whatever we might be debugging, whatever hacks we may
  // have temporarily added, etc. Even if we don't happen to be using it at some point in the future, let's not get rid
  // of this `delete`, lest we miss putting it back in the next time the property is in use.)
  delete event.sdkProcessingMetadata;

  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);

  const eventItem: EventItem = [
    {
      type: eventType,
      sample_rates: [{ id: samplingMethod, rate: sampleRate }],
    },
    event,
  ];
  return createEnvelope<EventEnvelope>(envelopeHeaders, [eventItem]);
}

function createEventEnvelopeHeaders(
  event: Event,
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn: DsnComponents,
): EventEnvelopeHeaders {
  const baggage = event.contexts && (event.contexts.baggage as BaggageObj);
  const { environment, release, transaction, userid, usersegment } = baggage || {};

  return {
    event_id: event.event_id as string,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
    ...(event.type === 'transaction' &&
      // If we don't already have a trace context in the event, we can't get the trace id, which makes adding any other
      // trace data pointless
      event.contexts &&
      event.contexts.trace && {
        trace: dropUndefinedKeys({
          // Trace context must be defined for transactions
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          trace_id: (event.contexts!.trace as Record<string, unknown>).trace_id as string,
          public_key: dsn.publicKey,
          environment: environment,
          release: release,
          transaction: transaction,
          ...((userid || usersegment) && {
            user: {
              id: userid,
              segment: usersegment,
            },
          }),
        }) as EventTraceContext,
      }),
  };
}
