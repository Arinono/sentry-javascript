export type { Attachment } from './attachment';
export type { AllowedBaggageKeys, Baggage, BaggageObj } from './baggage';
export type { Breadcrumb, BreadcrumbHint } from './breadcrumb';
export type { Client } from './client';
export type { ClientReport, Outcome, EventDropReason } from './clientreport';
export type { Context, Contexts } from './context';
export type { DataCategory } from './datacategory';
export type { DsnComponents, DsnLike, DsnProtocol } from './dsn';
export type { DebugImage, DebugImageType, DebugMeta } from './debugMeta';
export type {
  AttachmentItem,
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
  ClientReportEnvelope,
  ClientReportItem,
  Envelope,
  EnvelopeItemType,
  EnvelopeItem,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  EventTraceContext,
  SessionEnvelope,
  SessionItem,
  UserFeedbackItem,
} from './envelope';
export type { ExtendedError } from './error';
export type { Event, EventHint } from './event';
export type { EventProcessor } from './eventprocessor';
export type { Exception } from './exception';
export type { Extra, Extras } from './extra';
// This is a dummy export, purely for the purpose of loading `globals.ts`, in order to take advantage of its side effect
// of putting variables into the global namespace. See
// https://www.typescriptlang.org/docs/handbook/declaration-files/templates/global-modifying-module-d-ts.html.
export type {} from './globals';
export type { Hub } from './hub';
export type { Integration, IntegrationClass } from './integration';
export type { Mechanism } from './mechanism';
export type { ExtractedNodeRequestData, Primitive, WorkerLocation } from './misc';
export type { ClientOptions, Options } from './options';
export type { Package } from './package';
export type { PolymorphicEvent } from './polymorphics';
export type { QueryParams, Request } from './request';
export type { Runtime } from './runtime';
export type { CaptureContext, Scope, ScopeContext } from './scope';
export type { SdkInfo } from './sdkinfo';
export type { SdkMetadata } from './sdkmetadata';
export type {
  SessionAggregates,
  AggregationCounts,
  Session,
  SessionContext,
  SessionStatus,
  RequestSession,
  RequestSessionStatus,
  SessionFlusherLike,
  SerializedSession,
} from './session';

// eslint-disable-next-line deprecation/deprecation
export type { Severity, SeverityLevel } from './severity';
export type { Span, SpanContext } from './span';
export type { StackFrame } from './stackframe';
export type { Stacktrace, StackParser, StackLineParser, StackLineParserFn } from './stacktrace';
export type { TextEncoderInternal } from './textencoder';
export type {
  CustomSamplingContext,
  Measurements,
  SamplingContext,
  TraceparentData,
  Transaction,
  TransactionContext,
  TransactionMetadata,
  TransactionSamplingMethod,
} from './transaction';
export type { Thread } from './thread';
export type {
  Transport,
  TransportRequest,
  TransportMakeRequestResponse,
  InternalBaseTransportOptions,
  BaseTransportOptions,
  TransportRequestExecutor,
} from './transport';
export type { User, UserFeedback } from './user';
export type { WrappedFunction } from './wrappedfunction';
